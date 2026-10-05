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
        select: { id: true, plataforma: true, canais_notificacao: true, token: true, usuario_id: true },
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
    enqueuePushJobs(data) {
      return database.notificacaoPush.createMany({ data });
    },
    async findActionableCallJobIds(jobs, now) {
      const courierCalls = jobs.filter(job => job.conteudo.data?.type === "courier_request");
      const serviceCalls = jobs.filter(job => job.conteudo.data?.reason === "service-request-created");
      const [courier, service] = await Promise.all([
        courierCalls.length ? database.solicitacaoMotoboy.findMany({ select: { id: true }, where: { id: { in: courierCalls.map(job => Number(job.conteudo.data.requestId)) }, status: "PENDENTE", expira_em: { gt: now } } }) : [],
        serviceCalls.length ? database.conversaServico.findMany({ select: { id: true }, where: { id: { in: serviceCalls.map(job => Number(job.conteudo.data.conversationId)) }, status: "ABERTA" } }) : [],
      ]);
      const courierIds = new Set(courier.map(item => item.id)), serviceIds = new Set(service.map(item => item.id));
      return new Set(jobs.filter(job => {
        const data = job.conteudo.data;
        if (data?.type === "courier_request") return courierIds.has(Number(data.requestId));
        if (data?.reason === "service-request-created") return serviceIds.has(Number(data.conversationId));
        return true;
      }).map(job => job.id));
    },
    async claimDuePushJobs(now, limit = 100) {
      const due = { status: { in: ["PENDENTE", "AGUARDANDO_RECIBO"] }, proxima_tentativa_em: { lte: now }, OR: [{ bloqueado_ate: null }, { bloqueado_ate: { lte: now } }] };
      const candidates = await database.notificacaoPush.findMany({ orderBy: { proxima_tentativa_em: "asc" }, take: limit, where: due });
      const claimed = [];
      for (const job of candidates) {
        const lease = new Date(now.getTime() + 60_000);
        const result = await database.notificacaoPush.updateMany({
          data: { bloqueado_ate: lease }, where: { ...due, id: job.id, tentativas: job.tentativas, status: job.status },
        });
        if (result.count) claimed.push({ ...job, bloqueado_ate: lease });
      }
      return claimed;
    },
    updatePushJob(job, data) {
      return database.notificacaoPush.updateMany({ data: { bloqueado_ate: null, ...data }, where: { id: job.id, bloqueado_ate: job.bloqueado_ate } });
    },
    async pushStatus(userId) {
      const [registeredDevices, lastDelivery] = await Promise.all([
        database.dispositivoPush.count({ where: { ativo: true, usuario_id: userId } }),
        database.notificacaoPush.findFirst({ orderBy: { criado_em: "desc" }, select: { status: true, ultimo_erro: true, atualizado_em: true }, where: { destinatario_usuario_id: userId, status: { in: ["CONFIRMADA", "FALHOU"] } } }),
      ]);
      return { registeredDevices, lastDelivery: lastDelivery ? { status: lastDelivery.status, errorCode: lastDelivery.ultimo_erro, checkedAt: lastDelivery.atualizado_em.toISOString() } : null };
    },
    deleteOldPushJobs(before) {
      return database.notificacaoPush.deleteMany({ where: { criado_em: { lt: before }, status: { in: ["CONFIRMADA", "FALHOU", "EXPIRADA", "CANCELADA"] } } });
    },
  };
}

export const notificationsRepository = createNotificationsRepository();
