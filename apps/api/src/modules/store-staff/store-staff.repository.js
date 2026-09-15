import { prisma } from "../../config/prisma.js";

const personSelect = {
  email: true,
  foto_url: true,
  id: true,
  identificador_publico: true,
  nome: true,
};

const storeSelect = {
  banner_url: true,
  id: true,
  logo_url: true,
  nome: true,
  slug: true,
  status: true,
};

export function createStoreStaffRepository(database = prisma) {
  return {
    createInvite(args) { return database.conviteFuncionarioLoja.create(args); },
    deletePendingInvites(args) { return database.conviteFuncionarioLoja.updateMany(args); },
    findInvite(args) { return database.conviteFuncionarioLoja.findFirst(args); },
    findMember(args) { return database.usuarioLoja.findFirst(args); },
    findOwnerStore(storeId, userId) {
      return database.loja.findFirst({
        select: storeSelect,
        where: {
          excluido_em: null,
          id: storeId,
          lojista: { usuario_id: userId },
        },
      });
    },
    findUserByPublicIdentifier(identifier) {
      const numericId = /^\d+$/.test(identifier) ? Number(identifier) : null;
      return database.usuario.findFirst({
        select: personSelect,
        where: {
          excluido_em: null,
          status: { in: ["ATIVO", "PENDENTE"] },
          OR: [
            ...(numericId ? [{ id: numericId }] : []),
            { identificador_publico: { equals: identifier, mode: "insensitive" } },
          ],
        },
      });
    },
    listInvitesForStore(storeId) {
      return database.conviteFuncionarioLoja.findMany({
        include: {
          convidado: { select: personSelect },
          criado_por: { select: personSelect },
        },
        orderBy: { criado_em: "desc" },
        where: { loja_id: storeId, status: "PENDENTE" },
      });
    },
    listMembersForStore(storeId) {
      return database.usuarioLoja.findMany({
        include: { usuario: { select: personSelect } },
        orderBy: [{ cargo: "asc" }, { criado_em: "asc" }],
        where: { loja_id: storeId, status: "ATIVO" },
      });
    },
    listReceivedInvites(userId) {
      return database.conviteFuncionarioLoja.findMany({
        include: { loja: { select: storeSelect } },
        orderBy: { criado_em: "desc" },
        where: { convidado_usuario_id: userId, status: "PENDENTE" },
      });
    },
    listWorkplaces(userId) {
      return database.usuarioLoja.findMany({
        include: { loja: { select: storeSelect } },
        orderBy: { atualizado_em: "desc" },
        where: {
          status: "ATIVO",
          usuario_id: userId,
          loja: { excluido_em: null },
        },
      });
    },
    async sendPersonalInvitationMessage({ recipientId, senderId, storeName }) {
      const userAId = Math.min(recipientId, senderId);
      const userBId = Math.max(recipientId, senderId);
      const now = new Date();
      const existing = await database.conversaPessoal.findUnique({
        where: { usuario_a_id_usuario_b_id: { usuario_a_id: userAId, usuario_b_id: userBId } },
      });
      if (existing?.status === "BLOQUEADA") return null;
      const recipientSide = recipientId === userAId ? "a" : "b";
      const conversation = existing
        ? await database.conversaPessoal.update({
            data: {
              ...(recipientSide === "a" ? { nao_lidas_usuario_a: { increment: 1 } } : { nao_lidas_usuario_b: { increment: 1 } }),
              status: "ATIVA",
              ultima_mensagem_em: now,
            },
            where: { id: existing.id },
          })
        : await database.conversaPessoal.create({
            data: {
              aceito_em: now,
              nao_lidas_usuario_a: recipientSide === "a" ? 1 : 0,
              nao_lidas_usuario_b: recipientSide === "b" ? 1 : 0,
              solicitado_por_id: senderId,
              status: "ATIVA",
              ultima_mensagem_em: now,
              usuario_a_id: userAId,
              usuario_b_id: userBId,
            },
          });
      return database.conversaPessoalMensagem.create({
        data: {
          autor_usuario_id: senderId,
          conversa_id: conversation.id,
          mensagem: `Convite para trabalhar como atendente da ${storeName}. Abra seu Perfil no Brasil Cashback para aceitar ou recusar.`,
        },
      });
    },
    transaction(work) { return database.$transaction(work); },
    updateInvite(args) { return database.conviteFuncionarioLoja.update(args); },
    updateInvites(args) { return database.conviteFuncionarioLoja.updateMany(args); },
    updateMember(args) { return database.usuarioLoja.updateMany(args); },
    upsertMember(args) { return database.usuarioLoja.upsert(args); },
  };
}

export const storeStaffRepository = createStoreStaffRepository();
