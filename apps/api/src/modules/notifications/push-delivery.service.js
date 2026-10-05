import { env } from "../../config/env.js";
import { notificationsRepository } from "./notifications.repository.js";

const baseUrl = "https://exp.host/--/api/v2/push";
const receiptDelayMs = 15 * 60_000;
const maxAttempts = 10;
const transientCodes = new Set(["MessageRateExceeded", "TOO_MANY_REQUESTS", "ServiceUnavailable", "NETWORK_ERROR"]);
const legacyChannels = ["general", "messages", "orders", "courier-calls"];

function deviceChannel(job, device) {
  const channels = device.canais_notificacao?.length ? device.canais_notificacao : legacyChannels;
  return device.plataforma === "android" && !channels.includes(job.conteudo.channelId) ? "messages" : job.conteudo.channelId;
}

export function createPushDeliveryService({ repository = notificationsRepository, fetcher = (...args) => fetch(...args), now = () => new Date(), accessToken = () => env.push.accessToken } = {}) {
  async function post(path, body) {
    let response;
    try {
      response = await fetcher(`${baseUrl}/${path}`, {
        method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(8_000),
        headers: { "Content-Type": "application/json", ...(accessToken() ? { Authorization: `Bearer ${accessToken()}` } : {}) },
      });
    } catch { throw Object.assign(new Error("Falha temporária ao contatar o serviço push"), { code: "NETWORK_ERROR", retryable: true }); }
    if (!response.ok) throw Object.assign(new Error(`Push HTTP ${response.status}`), { code: `HTTP_${response.status}`, retryable: response.status === 429 || response.status >= 500 });
    let payload;
    try { payload = await response.json(); }
    catch { throw Object.assign(new Error("Resposta push invalida"), { code: "INVALID_RESPONSE", retryable: true }); }
    if (!payload || typeof payload !== "object") throw Object.assign(new Error("Resposta push invalida"), { code: "INVALID_RESPONSE", retryable: true });
    if (payload.errors?.length) {
      const code = payload.errors[0]?.code ?? "INVALID_RESPONSE";
      throw Object.assign(new Error(`Push ${code}`), { code, retryable: transientCodes.has(code) });
    }
    return payload.data;
  }
  async function finish(job, status, extra = {}) { await repository.updatePushJob(job, { status, ...extra }); }
  async function fail(job, code, retryable) {
    const attempts = job.tentativas + 1;
    if (retryable && attempts < maxAttempts && (job.status === "AGUARDANDO_RECIBO" || job.expira_em > now())) {
      await repository.updatePushJob(job, { tentativas: attempts, ultimo_erro: code, proxima_tentativa_em: new Date(now().getTime() + Math.min(300_000, 5_000 * 2 ** (attempts - 1))) });
      return "retried";
    }
    await finish(job, "FALHOU", { tentativas: attempts, ultimo_erro: code });
    return "failed";
  }
  async function processPushQueue() {
    const jobs = await repository.claimDuePushJobs(now());
    const report = { processed: jobs.length, accepted: 0, confirmed: 0, failed: 0, retried: 0, cancelled: 0, expired: 0 };
    if (!jobs.length) return report;
    const [devices, actionable] = await Promise.all([
      repository.findActivePushTokens([...new Set(jobs.map(job => job.destinatario_usuario_id))]),
      repository.findActionableCallJobIds(jobs.filter(job => job.status === "PENDENTE"), now()),
    ]);
    const byId = new Map(devices.map(device => [device.id, device]));
    const send = [], receipts = [];
    for (const job of jobs) {
      const device = byId.get(job.dispositivo_id);
      if (!device || device.usuario_id !== job.destinatario_usuario_id) { await finish(job, "CANCELADA"); report.cancelled++; continue; }
      if (job.status === "AGUARDANDO_RECIBO") { receipts.push(job); continue; }
      if (job.expira_em <= now()) { await finish(job, "EXPIRADA"); report.expired++; continue; }
      if (!actionable.has(job.id)) { await finish(job, "CANCELADA"); report.cancelled++; continue; }
      send.push({ job, device });
    }
    if (send.length) {
      let tickets;
      try {
        tickets = await post("send", send.map(({ job, device }) => ({
          ...job.conteudo, channelId: deviceChannel(job, device), to: device.token, sound: "default", priority: "high", expiration: Math.floor(job.expira_em.getTime() / 1000),
          collapseId: job.id, ...(device.plataforma === "android" ? { tag: job.id } : {}),
        })));
        if (!Array.isArray(tickets) || tickets.length !== send.length) throw Object.assign(new Error("Resposta push incompleta"), { code: "INVALID_RESPONSE", retryable: true });
      } catch (error) {
        for (const { job } of send) report[await fail(job, error.code ?? "INVALID_RESPONSE", error.retryable === true)]++;
      }
      if (Array.isArray(tickets) && tickets.length === send.length) {
        for (const [index, { job, device }] of send.entries()) {
          const ticket = tickets[index];
          if (ticket?.status === "ok" && ticket.id) {
            await finish(job, "AGUARDANDO_RECIBO", { ticket_id: ticket.id, tentativas: 0, ultimo_erro: null, proxima_tentativa_em: new Date(now().getTime() + receiptDelayMs) });
            report.accepted++;
          } else {
            const code = ticket?.details?.error ?? "INVALID_TICKET";
            if (code === "DeviceNotRegistered") await repository.deactivatePushTokens([device.token]);
            report[await fail(job, code, transientCodes.has(code))]++;
          }
        }
      }
    }
    if (receipts.length) {
      let results;
      try {
        results = await post("getReceipts", { ids: receipts.map(job => job.ticket_id) });
        if (!results || typeof results !== "object" || Array.isArray(results)) {
          results = null;
          throw Object.assign(new Error("Resposta de recibos invalida"), { code: "INVALID_RESPONSE", retryable: true });
        }
      }
      catch (error) { for (const job of receipts) report[await fail(job, error.code ?? "INVALID_RESPONSE", error.retryable === true)]++; }
      if (results && typeof results === "object") {
        for (const job of receipts) {
          const receipt = results[job.ticket_id];
          if (receipt?.status === "ok") { await finish(job, "CONFIRMADA", { ultimo_erro: null }); report.confirmed++; }
          else if (!receipt) { report[await fail(job, "RECEIPT_PENDING", true)]++; }
          else {
            const code = receipt.details?.error ?? "INVALID_RECEIPT";
            if (code === "DeviceNotRegistered") await repository.deactivatePushTokens([byId.get(job.dispositivo_id).token]);
            await finish(job, "FALHOU", { ultimo_erro: code }); report.failed++;
          }
        }
      }
    }
    return report;
  }
  return { processPushQueue };
}
export const { processPushQueue } = createPushDeliveryService();
