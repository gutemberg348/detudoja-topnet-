import { prisma } from "../../config/prisma.js";

export function createNotificationsRepository(database = prisma) {
  return {
    deactivatePushTokens(tokens) {
      return database.dispositivoPush.updateMany({
        data: { ativo: false },
        where: { ativo: true, token: { in: tokens } },
      });
    },
    findActivePushTokens(userIds) {
      return database.dispositivoPush.findMany({
        select: { plataforma: true, token: true, usuario_id: true },
        where: { ativo: true, usuario_id: { in: userIds } },
      });
    },
    removeUserPushToken(userId, token) {
      return database.dispositivoPush.deleteMany({ where: { token, usuario_id: userId } });
    },
    upsertPushToken(token, data) {
      return database.dispositivoPush.upsert({
        create: { token, ...data },
        update: { ...data, ativo: true, ultimo_uso_em: new Date() },
        where: { token },
      });
    },
  };
}

export const notificationsRepository = createNotificationsRepository();
