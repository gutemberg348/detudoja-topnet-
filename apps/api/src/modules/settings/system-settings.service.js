import { systemSettingsRepository } from "./system-settings.repository.js";

const supportConfigKey = "support.whatsapp";
const defaultSupportMessage =
  "Ola, preciso de ajuda com minha conta no Brasil Cashback.";

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function normalizeWhatsappNumber(value = "") {
  const digits = onlyDigits(value);

  if (!digits) {
    return "";
  }

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }

  return digits;
}

function formatWhatsappNumber(value = "") {
  const digits = normalizeWhatsappNumber(value);
  const brazilian = digits.startsWith("55") ? digits.slice(2) : digits;

  if (brazilian.length === 11) {
    return `+55 (${brazilian.slice(0, 2)}) ${brazilian.slice(2, 7)}-${brazilian.slice(7)}`;
  }

  if (brazilian.length === 10) {
    return `+55 (${brazilian.slice(0, 2)}) ${brazilian.slice(2, 6)}-${brazilian.slice(6)}`;
  }

  return digits ? `+${digits}` : "";
}

function supportUrl(whatsappDigits, message) {
  if (!whatsappDigits) {
    return null;
  }

  return `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(message)}`;
}

function serializeSupportSettings(value = {}) {
  const whatsappDigits = normalizeWhatsappNumber(value.whatsapp ?? "");
  const message = value.message?.trim() || defaultSupportMessage;

  return {
    message,
    whatsapp: value.whatsapp ?? "",
    whatsappDisplay: formatWhatsappNumber(whatsappDigits),
    whatsappDigits,
    whatsappUrl: supportUrl(whatsappDigits, message),
  };
}

async function getConfigValue(key) {
  const config = await systemSettingsRepository.findByKey(key);

  return config?.valor_json ?? {};
}

export async function getSupportSettings() {
  const value = await getConfigValue(supportConfigKey);

  return { support: serializeSupportSettings(value) };
}

export async function updateSupportSettings(adminId, data) {
  const whatsappDigits = normalizeWhatsappNumber(data.whatsapp);
  const value = {
    message: data.message?.trim() || defaultSupportMessage,
    whatsapp: whatsappDigits,
  };

  const config = await systemSettingsRepository.upsert({
    adminId,
    description: "WhatsApp e mensagem padrao do suporte exibidos no app.",
    key: supportConfigKey,
    value,
  });

  return {
    support: serializeSupportSettings(config.valor_json),
  };
}
