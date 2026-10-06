import { prisma } from "../../config/prisma.js";

const refundablePaymentStatuses = ["PAGO", "LIQUIDADO"];

export function createServiceTimeoutRepository(database = prisma) {
  return {
    findLegacyDeliveredServices() {
      return database.conversaServico.findMany({
        select: { id: true },
        take: 25,
        orderBy: { id: "asc" },
        where: {
          status: "AGUARDANDO_CONFIRMACAO", loja_solicitante_id: null, pedido_loja_id: null,
          propostas: { some: { status: "PAGA", cobranca: { is: {
            status: "PAGA", pagamento: { is: {
              status: { in: refundablePaymentStatuses },
              OR: [{ transacao_comercial: { is: null } }, { transacao_comercial: { is: { status: { in: ["PENDENTE", "VALIDADA"] } } } }],
            } },
          } } } },
        },
      });
    },
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
          OR: [{ loja_solicitante_id: { not: null } }, { pedido_loja_id: { not: null } }],
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
