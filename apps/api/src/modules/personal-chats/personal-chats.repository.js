import { prisma } from "../../config/prisma.js";

const personSelect = {
  foto_url: true,
  id: true,
  identificador_publico: true,
  nome: true,
};

const conversationListInclude = {
  mensagens: {
    orderBy: { criado_em: "desc" },
    take: 1,
  },
  usuario_a: { select: personSelect },
  usuario_b: { select: personSelect },
};

const conversationDetailInclude = {
  mensagens: {
    orderBy: { criado_em: "desc" },
    take: 100,
  },
  usuario_a: { select: personSelect },
  usuario_b: { select: personSelect },
};

export const personalChatsRepository = {
  createInvitation({ requesterId, userAId, userBId }) {
    return prisma.conversaPessoal.create({
      data: {
        solicitado_por_id: requesterId,
        usuario_a_id: userAId,
        usuario_b_id: userBId,
      },
    });
  },

  createMessage({ conversationId, recipientSide, text, userId }) {
    const now = new Date();

    return prisma.$transaction(async (transaction) => {
      const message = await transaction.conversaPessoalMensagem.create({
        data: {
          autor_usuario_id: userId,
          conversa_id: conversationId,
          mensagem: text,
        },
      });

      await transaction.conversaPessoal.update({
        data: {
          ...(recipientSide === "a"
            ? { nao_lidas_usuario_a: { increment: 1 } }
            : { nao_lidas_usuario_b: { increment: 1 } }),
          ultima_mensagem_em: now,
        },
        where: { id: conversationId },
      });

      return message;
    });
  },

  findById(id) {
    return prisma.conversaPessoal.findUnique({
      include: conversationDetailInclude,
      where: { id },
    });
  },

  findByPair(userAId, userBId) {
    return prisma.conversaPessoal.findUnique({
      where: {
        usuario_a_id_usuario_b_id: {
          usuario_a_id: userAId,
          usuario_b_id: userBId,
        },
      },
    });
  },

  findUserById(id) {
    return prisma.usuario.findFirst({
      select: personSelect,
      where: { excluido_em: null, id },
    });
  },

  findUserByPublicId(publicId) {
    return prisma.usuario.findFirst({
      select: personSelect,
      where: {
        excluido_em: null,
        identificador_publico: publicId,
        status: { in: ["ATIVO", "PENDENTE"] },
      },
    });
  },

  isClientAvailable() {
    return Boolean(
      prisma.conversaPessoal
      && prisma.conversaPessoalMensagem,
    );
  },

  listForUser(userId) {
    return prisma.conversaPessoal.findMany({
      include: conversationListInclude,
      orderBy: [
        { ultima_mensagem_em: "desc" },
        { atualizado_em: "desc" },
      ],
      where: {
        OR: [{ usuario_a_id: userId }, { usuario_b_id: userId }],
        status: { in: ["ATIVA", "PENDENTE"] },
      },
    });
  },

  markRead(conversationId, viewerId, viewerSide) {
    return prisma.$transaction(async (transaction) => {
      const result = await transaction.conversaPessoalMensagem.updateMany({
        data: { lido_em: new Date() },
        where: {
          autor_usuario_id: { not: viewerId },
          conversa_id: conversationId,
          lido_em: null,
        },
      });

      await transaction.conversaPessoal.update({
        data: viewerSide === "a"
          ? { nao_lidas_usuario_a: 0 }
          : { nao_lidas_usuario_b: 0 },
        where: { id: conversationId },
      });

      return result.count;
    });
  },

  decidePendingInvitation(id, recipientId, status) {
    return prisma.conversaPessoal.updateMany({
      data: {
        ...(status === "ATIVA" ? { aceito_em: new Date() } : {}),
        status,
      },
      where: {
        id,
        solicitado_por_id: { not: recipientId },
        status: "PENDENTE",
        OR: [
          { usuario_a_id: recipientId },
          { usuario_b_id: recipientId },
        ],
      },
    });
  },

  reopenInvitation(id, requesterId) {
    return prisma.conversaPessoal.update({
      data: {
        aceito_em: null,
        solicitado_por_id: requesterId,
        status: "PENDENTE",
      },
      where: { id },
    });
  },

  updateAlias(id, viewerSide, alias) {
    return prisma.conversaPessoal.update({
      data: viewerSide === "a"
        ? { apelido_usuario_a: alias }
        : { apelido_usuario_b: alias },
      where: { id },
    });
  },

  updatePublicId(userId, publicId) {
    return prisma.usuario.update({
      data: { identificador_publico: publicId },
      select: personSelect,
      where: { id: userId },
    });
  },

};
