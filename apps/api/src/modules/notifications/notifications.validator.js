import { z } from "zod";

const expoPushToken = z.string().trim().regex(
  /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,}\]$/,
  "Token de notificacao invalido",
);

export const registerPushTokenSchema = z.object({
  platform: z.enum(["android", "ios"]),
  token: expoPushToken,
});

export const unregisterPushTokenSchema = z.object({ token: expoPushToken });
