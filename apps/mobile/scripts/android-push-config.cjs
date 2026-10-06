const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function androidPushConfig(mobileDir, packageName, configuredFile) {
  const explicit = configuredFile?.trim();
  const file = resolve(mobileDir, explicit || 'google-services.json');
  if (!existsSync(file)) {
    if (explicit) throw new Error('GOOGLE_SERVICES_JSON aponta para um arquivo inexistente. Confira o caminho do google-services.json.');
    return { configured: false };
  }
  let config;
  try { config = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error('google-services.json invalido. Baixe a configuracao do app Android no Firebase.'); }
  const client = Array.isArray(config?.client) ? config.client.find(item => item?.client_info?.android_client_info?.package_name === packageName) : null;
  if (!config?.project_info?.project_number || !config?.project_info?.project_id || !client?.client_info?.mobilesdk_app_id || !Array.isArray(client.api_key) || !client.api_key.some(item => item?.current_key)) {
    throw new Error(`google-services.json precisa ser a configuracao Firebase do app Android ${packageName}. Nao use a chave privada da conta de servico.`);
  }
  return { configured: true, file };
}

module.exports = { androidPushConfig };
