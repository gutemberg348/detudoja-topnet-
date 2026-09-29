import { AppError } from "../../../utils/errors.js";
import { createSicrediOAuthClient } from "./sicredi.oauth.js";

const urls = {
  production: {
    api: "https://mtls-api-parceiro.sicredi.com.br/multipag",
    token: "https://mtls-api-parceiro.sicredi.com.br/thirdparty/auth/token",
  },
  sandbox: {
    api: "https://mtls-api-parceiro.sicredi.com.br/sb/multipag-pagamento-sandbox",
    token: "https://mtls-api-parceiro.sicredi.com.br/sb/thirdparty/auth/token",
  },
};

function required(value, label) {
  const item = String(value ?? "").trim();
  if (!item) throw new AppError(`${label} nao configurado para o Multipag`, 503);
  return item;
}

function account(config) {
  const cooperativa = required(config.cooperativa, "Cooperativa");
  const conta = required(config.conta, "Conta");
  const documento = required(config.documento, "Documento");
  if (!/^\d{4}$/.test(cooperativa) || !/^\d+$/.test(conta) || !/^\d{11}(\d{3})?$/.test(documento)) {
    throw new AppError("Dados da conta pagadora Multipag invalidos", 503);
  }
  return { conta, cooperativa, documento };
}

function amount(cents) {
  const value = Number(cents);
  if (!Number.isSafeInteger(value) || value <= 0) throw new AppError("Valor de transferencia Sicredi invalido", 400);
  return Number((value / 100).toFixed(2));
}

export function sicrediPixKeyForTransfer(type, key) {
  const value = required(key, "Chave Pix destino");
  if (type === "TELEFONE") {
    const digits = value.replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "");
    if (!/^\d{11}$/.test(digits)) throw new AppError("Chave Pix telefone invalida", 400);
    return `+55${digits}`;
  }
  if (type === "CPF" || type === "CNPJ") {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== (type === "CPF" ? 11 : 14)) throw new AppError("Chave Pix documento invalida", 400);
    return digits;
  }
  if (type === "EMAIL") {
    const email = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 77) {
      throw new AppError("Chave Pix e-mail invalida", 400);
    }
    return email;
  }
  if (type === "ALEATORIA" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return value.toLowerCase();
  }
  throw new AppError("Tipo de chave Pix destino invalido", 400);
}

export function createSicrediMultipagClient(config, { oauthFactory = createSicrediOAuthClient } = {}) {
  const clients = new Map();
  function scoped(scope) {
    if (!clients.has(scope)) clients.set(scope, oauthFactory({ ...config, scope, tokenStyle: "body" }));
    return clients.get(scope);
  }

  return {
    async createPixTransfer({ amountCents, date, description, destinationDocument, destinationKey, destinationKeyType, destinationName, transactionId, associatedPaymentId }) {
      if (config.transferEnabled !== true) throw new AppError("Envio Pix Multipag nao habilitado", 503);
      const id = required(transactionId, "ID da transferencia");
      const reference = associatedPaymentId == null ? id : required(associatedPaymentId, "Identificador associado");
      if (reference.length > 100) throw new AppError("Identificador associado excede 100 caracteres", 400);
      const document = required(destinationDocument, "Documento beneficiario").replace(/\D/g, "");
      if (!/^[a-zA-Z0-9:-]{1,100}$/.test(id) || !/^\d{11}(\d{3})?$/.test(document)) {
        throw new AppError("Identificacao da transferencia Multipag invalida", 400);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) throw new AppError("Data Pix Multipag invalida", 400);
      return scoped("multipag.pix.pagar").request("/v1/pagamentos/pix/chave", {
        body: {
          ...account(config),
          chavePix: sicrediPixKeyForTransfer(destinationKeyType, destinationKey),
          dataPagamento: date,
          documentoBeneficiario: document,
          idTransacao: id,
          identificadorPagamentoAssociado: reference,
          ...(description ? { mensagemPix: String(description).slice(0, 140) } : {}),
          ...(destinationName ? { nomeBeneficiario: String(destinationName).slice(0, 100) } : {}),
          valorPagamento: amount(amountCents),
        },
        method: "POST",
      });
    },
    getPixTransfer(transactionId) {
      const id = required(transactionId, "ID da transferencia");
      if (!/^[a-zA-Z0-9:-]{1,100}$/.test(id)) throw new AppError("ID da transferencia invalido", 400);
      const payer = account(config);
      return scoped("multipag.pix.consultar").request(`/v1/pagamentos/pix/${encodeURIComponent(id)}`, {
        headers: {
          "x-conta": payer.conta,
          "x-cooperativa": payer.cooperativa,
          "x-documento": payer.documento,
        },
      });
    },
  };
}

export function sicrediMultipagConfigFromEnv(source = process.env) {
  const environment = source.SICREDI_MULTIPAG_ENV === "production" ? "production" : "sandbox";
  return {
    apiUrl: source.SICREDI_MULTIPAG_API_URL || urls[environment].api,
    clientId: source.SICREDI_MULTIPAG_CLIENT_ID,
    clientSecret: source.SICREDI_MULTIPAG_CLIENT_SECRET,
    conta: source.SICREDI_MULTIPAG_CONTA,
    cooperativa: source.SICREDI_MULTIPAG_COOPERATIVA,
    documento: source.SICREDI_MULTIPAG_DOCUMENTO,
    mtls: {
      certPath: source.SICREDI_MULTIPAG_CERT_PATH,
      chainPath: source.SICREDI_MULTIPAG_CHAIN_PATH,
      keyPath: source.SICREDI_MULTIPAG_KEY_PATH,
      passphrase: source.SICREDI_MULTIPAG_CERT_PASSPHRASE,
    },
    tokenUrl: source.SICREDI_MULTIPAG_AUTH_URL || urls[environment].token,
    transferEnabled: source.SICREDI_MULTIPAG_TRANSFER_ENABLED === "true",
  };
}
