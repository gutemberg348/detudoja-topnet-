import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { googleConfigurationError, googleErrorMessage } from '../src/utils/google-auth.js';
import { androidPushConfig } from './android-push-config.cjs';

const mobileDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const log = (message) => console.log(`[apk-local] ${message}`);

function run(command, args, env, capture = false, cwd = mobileDir) {
  // .bat files need a shell on Windows. Pass paths/arguments through environment
  // variables instead of interpolating them into executable PowerShell code.
  const batch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command);
  const result = spawnSync(batch ? 'powershell.exe' : command, batch ? [
    '-NoProfile', '-NonInteractive', '-Command',
    '$taskArguments = @($env:DTJ_APK_ARGUMENTS | ConvertFrom-Json); & $env:DTJ_APK_COMMAND @taskArguments; exit $LASTEXITCODE',
  ] : args, {
    cwd,
    env: batch ? { ...env, DEBUG: '', DTJ_APK_COMMAND: command, DTJ_APK_ARGUMENTS: JSON.stringify(args) } : env,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  if (result.error) throw new Error(`Nao foi possivel executar ${command}: ${result.error.code}.`);
  if (result.status !== 0) {
    // Captured signing output may contain sensitive diagnostics; never dump it.
    throw new Error(`${command} falhou (codigo ${result.status ?? result.signal}).`);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function requiredPath(path, label) {
  if (!existsSync(path)) throw new Error(`${label} nao encontrado: ${path}. Veja docs/build-android-local.md.`);
  return path;
}

function parseOptions() {
  const options = { check: false, prepare: false, testKey: false, requireEasKey: false, architectures: 'arm64-v8a' };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--prepare') options.prepare = true;
    else if (arg === '--test-key') options.testKey = true;
    else if (arg === '--require-eas-key') options.requireEasKey = true;
    else if (arg === '--architectures') options.architectures = args[++i] ?? '';
    else if (arg === '--help') {
      console.log('npm run build:android:local -- [--check | --prepare] [--require-eas-key | --test-key] [--architectures arm64-v8a,x86_64]');
      process.exit(0);
    } else throw new Error(`Opcao desconhecida: ${arg}. Use --help.`);
  }
  const valid = new Set(['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86']);
  if (options.architectures.split(',').some((arch) => !valid.has(arch))) throw new Error('Arquiteturas invalidas. Use --help.');
  if (options.testKey && options.requireEasKey) throw new Error('Escolha --test-key ou --require-eas-key.');
  return options;
}

function signingCredentials(options) {
  const credentialsPath = join(mobileDir, 'credentials.json');
  if (!options.testKey && existsSync(credentialsPath)) {
    let signing;
    try {
      signing = JSON.parse(readFileSync(credentialsPath, 'utf8').replace(/^\uFEFF/, '')).android?.keystore;
    } catch {
      throw new Error('credentials.json invalido. Baixe novamente as credenciais existentes pelo EAS.');
    }
    for (const field of ['keystorePath', 'keystorePassword', 'keyAlias', 'keyPassword']) {
      if (typeof signing?.[field] !== 'string' || !signing[field]) {
        throw new Error(`Campo android.keystore.${field} ausente em credentials.json.`);
      }
    }
    return { ...signing, keystorePath: requiredPath(resolve(mobileDir, signing.keystorePath), 'Keystore do EAS'), source: 'credentials.json' };
  }
  if (options.requireEasKey) {
    throw new Error('Baixe a chave existente: em apps/mobile, rode npx eas-cli@latest credentials -p android; escolha preview > credentials.json > Download. Nao gere outra chave.');
  }
  return {
    source: 'chave de testes do template Expo',
    keystorePath: join(mobileDir, 'android', 'app', 'debug.keystore'),
    keystorePassword: 'android', keyAlias: 'androiddebugkey', keyPassword: 'android',
  };
}

function certificateSha1(output) {
  const digest = output.match(/(?:SHA-?1(?: digest)?):\s*([a-f\d:]+)/i)?.[1]?.replaceAll(':', '').toUpperCase();
  if (!digest || digest.length !== 40) throw new Error('Nao foi possivel conferir o SHA-1 da assinatura.');
  return digest.match(/../g).join(':');
}

function main() {
  const options = parseOptions();
  try { loadEnvFile(join(mobileDir, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  try {
    if (!['http:', 'https:'].includes(new URL(apiUrl).protocol)) throw new Error();
  } catch { throw new Error('Configure EXPO_PUBLIC_API_URL em apps/mobile/.env.'); }
  const googleCode = googleConfigurationError({ platform: 'android', webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() });
  if (googleCode) throw new Error(googleErrorMessage({ code: googleCode }));

  const windows = process.platform === 'win32';
  const sdk = requiredPath(resolve(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    (windows ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk') : join(homedir(), 'Android', 'Sdk'))), 'Android SDK');
  const javaHome = process.env.JAVA_HOME;
  const java = javaHome ? requiredPath(join(javaHome, 'bin', windows ? 'java.exe' : 'java'), 'Java') : 'java';
  const keytool = javaHome ? requiredPath(join(javaHome, 'bin', windows ? 'keytool.exe' : 'keytool'), 'keytool') : 'keytool';
  const env = {
    ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, CI: '1', NODE_ENV: 'production',
    PATH: [javaHome && join(javaHome, 'bin'), join(sdk, 'platform-tools'), process.env.PATH].filter(Boolean).join(windows ? ';' : ':'),
  };
  const javaVersion = run(java, ['-version'], env, true).match(/version "(\d+)/)?.[1];
  if (!javaVersion || Number(javaVersion) < 17) throw new Error('Instale/configure Java JDK 17 ou superior em JAVA_HOME.');
  const rnDir = dirname(require.resolve('react-native/package.json'));
  const versions = readFileSync(join(rnDir, 'gradle', 'libs.versions.toml'), 'utf8');
  const version = (key) => {
    const value = versions.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1];
    if (!value) throw new Error(`Versao Android ${key} nao encontrada no React Native instalado.`);
    return value;
  };
  const compileSdk = version('compileSdk');
  const buildTools = version('buildTools');
  const ndk = version('ndkVersion');
  const cmake = '3.22.1';
  requiredPath(join(sdk, 'platforms', `android-${compileSdk}`, 'android.jar'), `Plataforma Android ${compileSdk}`);
  const apksigner = requiredPath(join(sdk, 'build-tools', buildTools, windows ? 'apksigner.bat' : 'apksigner'), `Build Tools ${buildTools}`);
  requiredPath(join(sdk, 'ndk', ndk, 'source.properties'), `NDK ${ndk}`);
  requiredPath(join(sdk, 'cmake', cmake, 'bin', windows ? 'cmake.exe' : 'cmake'), `CMake ${cmake}`);
  requiredPath(join(sdk, 'licenses', 'android-sdk-license'), 'Licenca Android SDK');
  const expoCli = require.resolve('expo/bin/cli');
  const signing = signingCredentials(options);
  const app = JSON.parse(readFileSync(join(mobileDir, 'app.json'), 'utf8')).expo;
  const pushConfig = androidPushConfig(mobileDir, app.android.package, process.env.GOOGLE_SERVICES_JSON || app.android.googleServicesFile);
  log(pushConfig.configured ? 'Configuracao Firebase Android encontrada para este pacote.'
    : 'Push Android ainda nao configurado: coloque google-services.json em apps/mobile ou configure GOOGLE_SERVICES_JSON. Este APK nao recebera avisos com o app fechado.');
  log(`Java ${javaVersion}; Android ${compileSdk}; Build Tools ${buildTools}; NDK ${ndk}; CMake ${cmake}.`);
  log(`API: ${apiUrl}; pacote: ${app.android.package}; arquiteturas: ${options.architectures}.`);
  log(`Assinatura: ${signing.source}.`);
  if (signing.source !== 'credentials.json') {
    log('A chave de testes tem outro SHA-1. Para manter a assinatura do EAS, baixe credentials.json uma vez; veja docs/build-android-local.md.');
  }
  if (options.check) {
    if (signing.source === 'credentials.json') {
      log(`SHA-1: ${certificateSha1(run(keytool, ['-list', '-v', '-keystore', signing.keystorePath, '-alias', signing.keyAlias,
        '-storepass:env', 'DTJ_APK_STORE_PASSWORD'], { ...env, DTJ_APK_STORE_PASSWORD: signing.keystorePassword }, true))}`);
    }
    log('Verificacao local concluida. Nenhuma compilacao ou chamada ao EAS.');
    return;
  }

  log('Sincronizando projeto Android com o Expo (sem apagar o projeto nativo).');
  const packagePath = join(mobileDir, 'package.json');
  const packageSnapshot = readFileSync(packagePath, 'utf8');
  const originalPackage = JSON.parse(packageSnapshot);
  try {
    run(process.execPath, [expoCli, 'prebuild', '--platform', 'android', '--no-install', '--no-clean'], env);
  } finally {
    // Prebuild rewrites the development shortcuts. Keep the existing npm commands.
    const updatedPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
    for (const platform of ['android', 'ios']) updatedPackage.scripts[platform] = originalPackage.scripts[platform];
    writeFileSync(packagePath, JSON.stringify(updatedPackage) === JSON.stringify(originalPackage)
      ? packageSnapshot : `${JSON.stringify(updatedPackage, null, 2)}\n`);
  }
  const androidDir = join(mobileDir, 'android');
  const wrapper = requiredPath(join(androidDir, windows ? 'gradlew.bat' : 'gradlew'), 'Gradle Wrapper');
  writeFileSync(join(androidDir, 'local.properties'), `sdk.dir=${sdk.replaceAll('\\', '/')}\n`);
  requiredPath(signing.keystorePath, 'Chave da assinatura');
  const signingEnv = {
    ...env, DTJ_APK_KEYSTORE: signing.keystorePath, DTJ_APK_STORE_PASSWORD: signing.keystorePassword,
    DTJ_APK_KEY_ALIAS: signing.keyAlias, DTJ_APK_KEY_PASSWORD: signing.keyPassword,
  };
  const expectedSha1 = certificateSha1(run(keytool, ['-list', '-v', '-keystore', signing.keystorePath,
    '-alias', signing.keyAlias, '-storepass:env', 'DTJ_APK_STORE_PASSWORD'], signingEnv, true));
  log(`SHA-1 para o cliente Android no Google Cloud: ${expectedSha1}`);
  if (options.prepare) {
    log('Projeto Android preparado. A compilacao completa fica para npm run build:android:local.');
    return;
  }
  log('Compilando APK release com JavaScript incluido. A primeira execucao baixa o Gradle e as dependencias.');
  run(wrapper, [':app:assembleRelease', '--console=plain', '--max-workers=2',
    `-PreactNativeArchitectures=${options.architectures}`, `-Pandroid.cmakeVersion=${cmake}`,
    '--init-script', join(mobileDir, 'scripts', 'local-apk.init.gradle')], signingEnv, false, androidDir);
  const builtApk = requiredPath(join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), 'APK compilado');
  const actualSha1 = certificateSha1(run(apksigner, ['verify', '--print-certs', builtApk], env, true));
  if (actualSha1 !== expectedSha1) throw new Error('O APK nao foi assinado com a chave selecionada.');
  const outputDir = join(mobileDir, '.build-local');
  mkdirSync(outputDir, { recursive: true });
  const outputApk = join(outputDir, 'brasil-cashback-local.apk');
  copyFileSync(builtApk, outputApk);
  writeFileSync(join(outputDir, 'build-info.json'), `${JSON.stringify({
    builtAt: new Date().toISOString(), package: app.android.package, versionCode: app.android.versionCode,
    apiUrl, architectures: options.architectures.split(','), signingSource: signing.source, sha1: actualSha1,
  }, null, 2)}\n`);
  log(`APK pronto: ${outputApk}`);
  log(`SHA-1: ${actualSha1}`);
  log('Pode instalar no celular. Este APK nao precisa do Metro; a API precisa estar acessivel.');
}

try { main(); } catch (error) {
  console.error(`[apk-local] Falha: ${error.message}`);
  process.exitCode = 1;
}
