import { AppError } from "../../../utils/errors.js";
import { createSicrediOAuthClient } from "./sicredi.oauth.js";

function money(cents) {
  const amount = Number(cents);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError("Valor Pix Sicredi invalido", 400);
  }
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}

function txid(value) {
  const id = String(value ?? "");
  if (!/^[a-zA-Z0-9]{26,35}$/.test(id)) throw new AppError("TXID Sicredi invalido", 400);
  return id;
}

function e2eid(value) {
  const id = String(value ?? "");
  if (!/^[a-zA-Z0-9]{32}$/.test(id)) throw new AppError("E2E ID Sicredi invalido", 400);
  return id;
}

export function sicrediTxidForPayment(paymentId) {
  const id = Number(paymentId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError("Pagamento invalido", 400);
  return `DTJ${String(id).padStart(28, "0")}`;
}

export function createSicrediPixClient(config, { oauthFactory = createSicrediOAuthClient } = {}) {
  const clients = new Map();
  function scoped(scope) {
    if (!clients.has(scope)) clients.set(scope, oauthFactory({
      ...config,
      scope,
      tokenStyle: "basic",
    }));
    return clients.get(scope);
  }

  return {
    async createCharge({ amountCents, description, expirationSeconds = 3600, id }) {
      const key = String(config.pixKey ?? "").trim();
      if (!key || key.length > 77) throw new AppError("Chave Pix recebedora Sicredi invalida", 503);
      const expiration = Number(expirationSeconds);
      if (!Number.isSafeInteger(expiration) || expiration < 60 || expiration > 86_400) {
        throw new AppError("Expiracao da cobranca Sicredi invalida", 400);
      }
      return scoped("cob.write").request(`/cob/${txid(id)}`, {
        body: {
          calendario: { expiracao: expiration },
          chave: key,
          ...(description ? { solicitacaoPagador: String(description).slice(0, 140) } : {}),
          valor: { modalidadeAlteracao: "0", original: money(amountCents) },
        },
        method: "PUT",
      });
    },
    getCharge(id) {
      return scoped("cob.read").request(`/cob/${txid(id)}`);
    },
    cancelCharge(id) {
      return scoped("cob.write").request(`/cob/${txid(id)}`, {
        body: { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" },
        method: "PATCH",
      });
    },
    getReceivedPix(id) {
      return scoped("pix.read").request(`/pix/${e2eid(id)}`);
    },
    requestRefund({ amountCents, e2eId, refundId }) {
      const id = String(refundId ?? "");
      if (!/^[a-zA-Z0-9]{1,35}$/.test(id)) throw new AppError("ID de devolucao Sicredi invalido", 400);
      return scoped("pix.write").request(`/pix/${e2eid(e2eId)}/devolucao/${id}`, {
        body: { natureza: "ORIGINAL", valor: money(amountCents) },
        method: "PUT",
      });
    },
    getRefund({ e2eId, refundId }) {
      const id = String(refundId ?? "");
      if (!/^[a-zA-Z0-9]{1,35}$/.test(id)) throw new AppError("ID de devolucao Sicredi invalido", 400);
      return scoped("pix.read").request(`/pix/${e2eid(e2eId)}/devolucao/${id}`);
    },
  };
}

export function sicrediPixConfigFromEnv(source = process.env) {
  return {
    apiUrl: source.SICREDI_PIX_API_URL,
    clientId: source.SICREDI_PIX_CLIENT_ID,
    clientSecret: source.SICREDI_PIX_CLIENT_SECRET,
    mtls: {
      certPath: source.SICREDI_PIX_CERT_PATH || source.SICREDI_MULTIPAG_CERT_PATH,
      chainPath: source.SICREDI_PIX_CHAIN_PATH || source.SICREDI_MULTIPAG_CHAIN_PATH,
      keyPath: source.SICREDI_PIX_KEY_PATH || source.SICREDI_MULTIPAG_KEY_PATH,
      passphrase: source.SICREDI_PIX_CERT_PASSPHRASE || source.SICREDI_MULTIPAG_CERT_PASSPHRASE,
    },
    pixKey: source.SICREDI_PIX_RECEIVING_KEY,
    tokenUrl: source.SICREDI_PIX_AUTH_URL,
  };
}
