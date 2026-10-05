import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { logError } from "../../config/logger.js";
import { AppError } from "../../utils/errors.js";
import { notificationsRepository } from "./notifications.repository.js";

let wakeUp = () => {};
export function setPushQueueWakeUp(callback) { wakeUp = callback ?? (() => {}); }

export function createNotificationsService({ repository = notificationsRepository, enabled = () => env.push.enabled, now = () => new Date(), onError = logError, wake = () => wakeUp() } = {}) {
  async function enqueue({ body, channelId = "general", data = {}, expiresAt, title, userIds, tokens }) {
    if (!enabled() || !userIds?.length) return { queued: 0, enabled: enabled() };
    const createdAt = now();
    const expiry = expiresAt ? new Date(expiresAt) : new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    if (!Number.isFinite(expiry.getTime()) || expiry <= createdAt) return { queued: 0, enabled: true };
    const devices = (await repository.findActivePushTokens([...new Set(userIds)]))
      .filter(device => !tokens || tokens.includes(device.token));
    if (!devices.length) return { queued: 0, enabled: true };
    await repository.enqueuePushJobs(devices.map(device => ({
      id: randomUUID(), dispositivo_id: device.id, destinatario_usuario_id: device.usuario_id,
      expira_em: expiry,
      conteudo: { body: String(body ?? "").slice(0, 600), title: String(title ?? "Brasil Cashback").slice(0, 120), channelId,
        data: { ...data, recipientUserId: device.usuario_id } },
    })));
    wake();
    return { queued: devices.length, enabled: true };
  }
  return {
    registerPushToken: (userId, { platform, token, channels = [] }) => repository.upsertPushToken(token, { plataforma: platform, usuario_id: userId, canais_notificacao: channels }),
    unregisterPushToken: (userId, token) => repository.removeUserPushToken(userId, token),
    async getPushStatus(userId) { return { enabled: enabled(), ...await repository.pushStatus(userId) }; },
    async sendTestPush(userId, token) {
      if (!enabled()) throw new AppError("As notificações do servidor ainda não estão ativadas. Fale com o suporte.", 503);
      const result = await enqueue({
        userIds: [userId], tokens: [token], channelId: "service-calls",
        title: "Tudo pronto para receber chamados?", body: "Este é seu aviso de teste. Você pode receber notificações com o app fora da tela.",
        data: { reason: "push-test", screen: "ServiceDesk" }, expiresAt: new Date(now().getTime() + 300_000),
      });
      if (!result.queued) throw new AppError("Este aparelho ainda não está preparado. Ative as notificações e tente novamente.", 409);
      return result;
    },
    async sendExpoPushToUsers(notification) {
      try { return await enqueue(notification); }
      catch (error) { onError("notifications.enqueue_failed", error, { recipientCount: notification.userIds?.length ?? 0 }); return { queued: 0, error: true }; }
    },
  };
}
const service = createNotificationsService();
export const { registerPushToken, unregisterPushToken, getPushStatus, sendTestPush, sendExpoPushToUsers } = service;
