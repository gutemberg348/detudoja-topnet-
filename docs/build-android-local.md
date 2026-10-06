# APK Android local no Windows

O APK de testes pode ser compilado neste PC com Expo Prebuild e Gradle Wrapper,
sem iniciar builds remotos nem consumir cota EAS. O APK usa a variante release,
com JavaScript e imagens incluidos, e pode rodar no telefone sem Metro/computador
ligado. A API continua sendo a URL de `apps/mobile/.env`.

## Comando de uso diario

No PowerShell, na raiz do repositorio:

```powershell
cd C:\Users\GUTOO\Documents\projetos_node\detudoja
npm run build:android:local
```

Saida depois de compilar e verificar a assinatura:

```text
apps/mobile/.build-local/brasil-cashback-local.apk
apps/mobile/.build-local/build-info.json
```

O primeiro build baixa Gradle/dependencias e compila bibliotecas nativas.
Os seguintes aproveitam os caches. O wrapper usa a versao do template Expo;
nao precisa instalar ou atualizar um Gradle global. Por padrao compila apenas
`arm64-v8a`, para acelerar testes nos celulares Android 64 bits atuais.
Para incluir Android 32 bits ou um emulador x86_64:

```powershell
npm run build:android:local -- --architectures arm64-v8a,armeabi-v7a,x86_64
```

## Manter a mesma assinatura e o login Google

Recomendado neste projeto: baixar **a chave existente** do EAS uma vez. Em
`apps/mobile`, executar:

```powershell
cd apps/mobile
npx --yes eas-cli@latest credentials -p android
```

Escolher `preview`, depois `credentials.json` e a opcao de baixar credenciais
do EAS para `credentials.json`. Nao criar ou substituir a keystore. Manter
`credentials.json` em `apps/mobile` e o arquivo de chave no caminho indicado
por ele. O script aceita o formato EAS `android.keystore` com keystorePath,
keystorePassword, keyAlias e keyPassword; caminho relativo e resolvido contra
`apps/mobile`. O download de credenciais nao inicia uma compilacao remota.

Depois, voltar a raiz e gerar o APK garantindo o uso dessa chave:

```powershell
cd ../..
npm run build:android:local -- --require-eas-key
```

O script escolhe `credentials.json` automaticamente quando ele existe e
valida a chave com keytool antes de compilar. Senhas ficam no ambiente do
processo Gradle, sem argumentos de linha de comando, alteracao de
gradle.properties ou registro em build-info.json. Assinatura existente do
APK EAS de preview:

```text
Pacote: com.detudoja.mobile
SHA-1: AE:91:85:9C:7F:46:77:21:ED:F9:0A:A7:67:61:24:FB:AD:5D:31:69
```

Sem credentials.json, usa a chave de testes do template Expo. Isso muda o
SHA-1, exige outro cliente OAuth Android no mesmo projeto do cliente Web e
impede instalar por cima de um APK assinado com a chave EAS. Desinstalar o
APK anterior remove seus dados locais; o script nunca desinstala por conta
propria. SHA-1 do template instalado, conferido com keytool em 05/10/2026:

```text
5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

`--test-key` permite escolher explicitamente a chave de testes mesmo com
credentials.json presente. `--require-eas-key` impede esse fallback. A chave
de testes nao e a chave de publicacao na Play Store. O build EAS `production`
continua gerando AAB com suas credenciais remotas; nao trocar a chave existente.

## Ambiente e verificacao sem compilar

```powershell
npm run check:android:local
npm run build:android:local -- --prepare
```

`--check` verifica Java, SDK, licenca, NDK, CMake, API, formato do ID Web Google
e chave baixada, se presente. `--prepare` tambem gera/sincroniza Android e
mostra o SHA-1, sem executar assembleRelease. Neste PC foram encontrados:

- JDK 17.0.18 em JAVA_HOME.
- SDK Android 36, Build Tools 36.0.0, NDK 27.1.12297006 e CMake 3.22.1.
- Gradle Wrapper 9.3.1 indicado no template Expo 57.

As versoes SDK/Build Tools/NDK sao lidas do React Native instalado. Se faltar
um componente, instalar pelo Android Studio > SDK Manager. Caminhos comuns:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

Configuracao do app vem de `apps/mobile/.env`; nao depende das variaveis do
EAS ou do `.env` da API. Se usa push Android/FCM, configurar GOOGLE_SERVICES_JSON
com o caminho local do google-services.json do mesmo app Firebase. Valores
remotos de arquivo no EAS nao sao baixados pelo build local.

Tambem pode salvar diretamente em `apps/mobile/google-services.json`; app.config.js
detecta esse arquivo sem variavel adicional. Arquivo explicito inexistente,
estrutura invalida ou pacote diferente interrompem a configuracao. Ausencia
de arquivo padrao gera aviso no check/build local e estado de configuracao
pendente no app, nunca sucesso falso. Precisa novo APK depois de incluir FCM.

O script sincroniza `app.json`/plugins em cada execucao com `--no-clean`,
preserva comandos npm existentes e escreve local.properties com o SDK local.
O init script Gradle aplica a assinatura apenas nesta compilacao, reduz
caminhos de objetos CMake e obriga recompilar o bundle para incorporar mudancas
no `.env`, mantendo os caches nativos. O APK final e verificado com apksigner
antes de copiar; a assinatura deve corresponder a chave selecionada.

android/, APKs, credenciais e chaves sao ignorados pelo Git, para que o EAS
continue gerando seu projeto nativo a partir da configuracao Expo.

Em 05/10/2026, check e prepare passaram no PC, inclusive repeticao preservando
package.json e keystore. Gradle Wrapper 9.3.1 iniciou com Java 17; sintaxe do
init script Groovy aprovada. Launcher PowerShell/apksigner verificou um APK
real existente, incluindo argumentos separados corretamente. Leitura de
credentials.json foi exercitada em memoria com BOM, caminho com espacos,
formato/campos invalidos e ausencia da chave obrigatoria; nao houve download
ou escrita de credenciais. A compilacao completa do APK e instalacao no
aparelho ficaram para o usuario executar; nao afirmar que o APK ja foi gerado.

Depois, o usuario baixou as credenciais existentes em apps/mobile/credentials.json
e credentials/android/keystore.jks. `--check --require-eas-key` passou com a
chave real e confirmou SHA-1 AE:91:85:9C:7F:46:77:21:ED:F9:0A:A7:67:61:24:FB:AD:
5D:31:69, igual ao APK EAS. Ambos os arquivos estao ignorados pelo Git.
Nenhuma compilacao foi iniciada nessa conferencia.

## Erro Filename longer than 260 characters no Windows

O primeiro build completo encontrou esse erro no objeto ComponentDescriptors.cpp
do safe-area-context. O limite CMAKE_OBJECT_PATH_MAX=128 era menor que a propria
pasta do target; portanto nao encurtava o objeto de forma suficiente.

O init script local agora usa CMAKE_OBJECT_PATH_MAX=240 e buildStagingDirectory
em `%USERPROFILE%/.dtj-cxx/<checkout>/<modulo>`, com identificadores derivados
dos caminhos para separar caches. Opcionalmente DTJ_APK_CXX_ROOT define outra
raiz curta. Aplicado somente no Windows e pelo comando local; nao move o
projeto nem altera o build EAS. Nao exige apagar node_modules ou credenciais.
O cache nativo muda de local, entao a primeira compilacao pode demorar mais.

Executar novamente `npm run build:android:local -- --require-eas-key`.
Validacao em 05/10/2026: configureCMakeRelWithDebInfo de app e expo-modules-core
passou; maior caminho de objeto gerado mediu 238 caracteres; Ninja compilou
o ComponentDescriptors.cpp que falhava. APK completo ainda fica para o usuario.

Referencias: [build nativo local no Expo](https://docs.expo.dev/guides/local-app-production/),
[formato credentials.json](https://docs.expo.dev/app-signing/local-credentials/),
[finalizeDsl do Android Gradle Plugin](https://developer.android.com/reference/tools/gradle-api/8.12/com/android/build/api/variant/AndroidComponentsExtension),
[limite de objetos CMake](https://cmake.org/cmake/help/latest/variable/CMAKE_OBJECT_PATH_MAX.html).
