import { prisma } from "../../config/prisma.js";
import { assertCommercialSettlementReversible } from "../earnings/order-earnings.service.js";

const refundableStatuses = ["PAGO", "LIQUIDADO"];
const paymentInclude = {
  composicoes: { include: { carteira: { include: { tipo_carteira: true } } } },
  cobranca: {
    include: {
      proposta_servico: {
        include: {
          conversa_servico: {
            include: {
              vendedor: { select: { usuario_id: true } },
            },
          },
        },
      },
    },
  },
  loja: { select: { id: true, nome: true } },
  pedido_loja: {
    include: {
      _count: { select: { mensagens: true } },
      comprador: { select: { email: true, id: true, nome: true, telefone: true } },
      itens: { orderBy: { criado_em: "asc" } },
      loja: { select: { id: true, nome: true } },
      pagamento: true,
      propostas: { orderBy: { criado_em: "asc" } },
    },
  },
  transacao_comercial: { select: { id: true, status: true, validada_em: true } },
  usuario_pagador: { select: { email: true, id: true, nome: true } },
};

export function createAdminPaymentsRepository(database = prisma) {
  return {
    assertSettlementReversible(paymentId) {
      return assertCommercialSettlementReversible(database, paymentId);
    },

    cancelOrder(orderId) {
      return database.pedidoLoja.update({
        data: { cancelado_em: new Date(), status: "CANCELADO" },
        include: paymentInclude.pedido_loja.include,
        where: { id: orderId },
      });
    },

    cancelUnattendedOrder(orderId, statuses) {
      return database.pedidoLoja.updateMany({
        data: { cancelado_em: new Date(), status: "CANCELADO" },
        where: {
          id: orderId,
          preparando_em: null,
          status: { in: statuses },
        },
      });
    },

    cancelUnattendedServiceConversation(conversationId) {
      return database.conversaServico.updateMany({
        data: { encerrado_em: new Date(), status: "CANCELADA" },
        where: { id: conversationId, status: "ACORDADA" },
      });
    },

    claimInternalRefund(paymentId) {
      return database.pagamento.updateMany({
        data: { estornado_em: new Date(), status: "ESTORNADO" },
        where: { id: paymentId, status: { in: refundableStatuses } },
      });
    },

    count(where) {
      return database.pagamento.count({ where });
    },

    createOrderMessage(data) {
      return database.pedidoLojaMensagem.create({ data });
    },

    createServiceMessage(args) { return database.conversaServicoMensagem.create(args); },

    createWalletMovement(data) {
      return database.lancamentoCarteira.create({ data });
    },

    findPayment(id) {
      return database.pagamento.findUnique({
        include: paymentInclude,
        where: { id },
      });
    },

    findPaymentByOrderId(orderId) {
      return database.pagamento.findFirst({
        include: paymentInclude,
        where: { pedido_loja: { is: { id: orderId } } },
      });
    },

    list({ page, pageSize, where }) {
      return database.pagamento.findMany({
        include: paymentInclude,
        orderBy: { criado_em: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      });
    },

    markCompositionsRefunded(paymentId) {
      return database.pagamentoComposicao.updateMany({
        data: { status: "ESTORNADO" },
        where: { pagamento_id: paymentId, status: "CONFIRMADO" },
      });
    },

    restoreUnattendedOrder(orderId, status) {
      return database.pedidoLoja.updateMany({
        data: { cancelado_em: null, status },
        where: { id: orderId, status: "CANCELADO" },
      });
    },

    restoreUnattendedServiceConversation(conversationId) {
      return database.conversaServico.updateMany({
        data: { encerrado_em: null, status: "ACORDADA" },
        where: { id: conversationId, status: "CANCELADA" },
      });
    },

    restoreWalletBalance(walletId, amount) {
      return database.carteira.update({
        data: { saldo_disponivel_centavos: { increment: BigInt(amount) } },
        select: { saldo_disponivel_centavos: true, usuario_id: true },
        where: { id: walletId },
      });
    },

    transaction(work) {
      return database.$transaction(async (transaction) =>
        work(createAdminPaymentsRepository(transaction), transaction),
      );
    },
    updateCharges(args) { return database.cobranca.updateMany(args); },
    updateServiceProposals(args) { return database.propostaServico.updateMany(args); },
  };
}

export const adminPaymentsRepository = createAdminPaymentsRepository();
