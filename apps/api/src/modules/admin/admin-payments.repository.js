import { prisma } from "../../config/prisma.js";
import { assertCommercialSettlementReversible } from "../earnings/order-earnings.service.js";

const refundableStatuses = ["PAGO", "LIQUIDADO"];
const paymentInclude = {
  composicoes: { include: { carteira: { include: { tipo_carteira: true } } } },
  cobranca: { select: { id: true, codigo_publico: true } },
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
  transacao_comercial: { select: { id: true, status: true } },
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

    createWalletMovement(data) {
      return database.lancamentoCarteira.create({ data });
    },

    findPayment(id) {
      return database.pagamento.findUnique({
        include: paymentInclude,
        where: { id },
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
  };
}

export const adminPaymentsRepository = createAdminPaymentsRepository();
