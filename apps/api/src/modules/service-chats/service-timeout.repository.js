import { prisma } from "../../config/prisma.js";

const refundablePaymentStatuses = ["PAGO", "LIQUIDADO"];

export function createServiceTimeoutRepository(database = prisma) {
  return {
    createMessage(args) { return database.conversaServicoMensagem.create(args); },
    findIdleServiceConversations(cutoff) {
      return database.conversaServico.findMany({
        select: {
          cliente_usuario_id: true,
          id: true,
          solicitacao_motoboy: { select: { id: true } },
          status: true,
          vendedor: { select: { usuario_id: true } },
        },
        take: 50,
        where: {
          atualizado_em: { lte: cutoff },
          propostas: {
            none: {
              status: { in: ["PENDENTE", "ACEITA", "PAGA", "CONCLUIDA"] },
            },
          },
          status: { in: ["ABERTA", "ACORDADA"] },
        },
      });
    },
    findConversationsAwaitingConfirmation(cutoff) {
      return database.conversaServico.findMany({
        select: {
          cliente_usuario_id: true,
          id: true,
          vendedor: { select: { usuario_id: true } },
        },
        take: 25,
        where: {
          atualizado_em: { lte: cutoff },
          propostas: {
            some: {
              cobranca: {
                is: {
                  pagamento: { is: { status: { in: refundablePaymentStatuses } } },
                },
              },
              status: "PAGA",
            },
          },
          status: "AGUARDANDO_CONFIRMACAO",
        },
      });
    },
    findUnattendedServicePayments(cutoff) {
      return database.pagamento.findMany({
        select: { id: true },
        take: 25,
        where: {
          cobranca: {
            is: {
              proposta_servico: {
                is: {
                  conversa_servico: { is: { status: "ACORDADA" } },
                  status: "PAGA",
                },
              },
            },
          },
          pago_em: { lte: cutoff },
          status: { in: refundablePaymentStatuses },
        },
      });
    },
    transaction(work) { return database.$transaction(work); },
    updateCourierRequests(args) { return database.solicitacaoMotoboy.updateMany(args); },
    updateConversations(args) { return database.conversaServico.updateMany(args); },
  };
}

export const serviceTimeoutRepository = createServiceTimeoutRepository();
