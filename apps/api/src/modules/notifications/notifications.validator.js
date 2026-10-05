import { z } from "zod";

const expoPushToken = z.string().trim().regex(
  /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,}\]$/,
  "Token de notificacao invalido",
);

export const registerPushTokenSchema = z.object({
  platform: z.enum(["android", "ios"]),
  channels: z.array(z.enum(["general", "messages", "orders", "courier-calls", "service-calls"])).max(5).optional(),
  token: expoPushToken,
});

export const unregisterPushTokenSchema = z.object({ token: expoPushToken });
