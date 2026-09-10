import { env } from "../../config/env.js";
import { logError } from "../../config/logger.js";
import { notificationsRepository } from "./notifications.repository.js";

const expoPushUrl = "https://exp.host/--/api/v2/push/send";
const expoChunkSize = 100;

function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => (
    items.slice(index * size, (index + 1) * size)
  ));
}

export async function registerPushToken(userId, { platform, token }) {
  await notificationsRepository.upsertPushToken(token, {
    plataforma: platform,
    usuario_id: userId,
  });
}

export async function unregisterPushToken(userId, token) {
  await notificationsRepository.removeUserPushToken(userId, token);
}

export async function sendExpoPushToUsers({ body, data = {}, title, userIds }) {
  if (!env.push.enabled || !userIds?.length) return;

  try {
    const devices = await notificationsRepository.findActivePushTokens([...new Set(userIds)]);
    const invalidTokens = [];

    for (const deviceChunk of chunks(devices, expoChunkSize)) {
      const response = await fetch(expoPushUrl, {
        body: JSON.stringify(deviceChunk.map((device) => ({
          body,
          data,
          sound: "default",
          title,
          to: device.token,
        }))),
        headers: {
          "Content-Type": "application/json",
          ...(env.push.accessToken ? { Authorization: `Bearer ${env.push.accessToken}` } : {}),
        },
        method: "POST",
      });
      if (!response.ok) throw new Error(`Expo Push returned HTTP ${response.status}`);
      const payload = await response.json();
      const tickets = Array.isArray(payload?.data) ? payload.data : [];
      tickets.forEach((ticket, index) => {
        if (ticket?.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(deviceChunk[index]?.token);
        }
      });
    }

    if (invalidTokens.length) {
      await notificationsRepository.deactivatePushTokens(invalidTokens.filter(Boolean));
    }
  } catch (error) {
    logError("notifications.expo_push_failed", error, { recipientCount: userIds.length });
  }
}
