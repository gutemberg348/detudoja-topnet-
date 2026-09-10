import {
  emitOrderStatusUpdated,
  emitServiceChatUpdated,
  emitWalletUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { reverseCommercialSettlement } from "../earnings/order-earnings.service.js";
import { releaseReservedOrderStock } from "../orders/order-stock.service.js";
import { serializeOrder } from "../orders/orders.serializer.js";
import {
  refreshAsaasRefundPayment,
  requestAsaasPaymentRefund,
} from "../payments/asaas.service.js";
import {
  adminPaymentsRepository,
} from "./admin-payments.repository.js";

const refundableStatuses = ["PAGO", "LIQUIDADO"];
const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;
const paymentStatuses = new Set([
  "PENDENTE",
  "AGUARDANDO_PAGAMENTO",
  "PAGO",
  "LIQUIDADO",
  "CANCELADO",
  "ESTORNADO",
  "FALHOU",
  "EM_DISPUTA",
]);

function cents(value) {
  return Number(value ?? 0);
}

function refundDeadline(payment) {
  const start = payment.transacao_comercial?.validada_em ?? payment.pago_em;
  return start ? new Date(start.getTime() + REFUND_WINDOW_MS) : null;
}

function serializePayment(payment) {
  const deadline = refundDeadline(payment);

  return {
    createdAt: payment.criado_em.toISOString(),
    gateway: payment.gateway,
    id: payment.id,
    method: payment.metodo_principal,
    orderCode: payment.pedido_loja?.codigo ?? null,
    orderId: payment.pedido_loja?.id ?? null,
    orderStatus: payment.pedido_loja?.status ?? null,
    paidAt: payment.pago_em?.toISOString() ?? null,
    payer: payment.usuario_pagador
      ? {
          email: payment.usuario_pagador.email,
          id: payment.usuario_pagador.id,
          name: payment.usuario_pagador.nome,
        }
      : null,
    pixCents: cents(payment.valor_pago_pix_centavos),
    refundable:
      refundableStatuses.includes(payment.status)
      && Boolean(deadline)
      && deadline.getTime() > Date.now()
      && payment.transacao_comercial?.status !== "LIQUIDADA",
    refundDeadline: deadline?.toISOString() ?? null,
    refundDestination: payment.gateway === "ASAAS" ? "PIX_ORIGEM" : "CARTEIRAS_ORIGEM",
    settlementStatus: payment.transacao_comercial?.status ?? null,
    status: payment.status,
    store: payment.loja ? { id: payment.loja.id, name: payment.loja.nome } : null,
    totalCents: cents(payment.valor_total_centavos),
    walletCents: cents(payment.valor_pago_saldo_centavos),
  };
}

export async function listAdminPayments(query = {}) {
  const search = String(query.search ?? "").trim();
  const status = String(query.status ?? "").trim().toUpperCase();

  if (status && !paymentStatuses.has(status)) {
    throw new AppError("Status de pagamento invalido", 400);
  }
  const page = Math.max(Number(query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 30, 1), 100);
  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { pedido_loja: { codigo: { contains: search, mode: "insensitive" } } },
            { usuario_pagador: { email: { contains: search, mode: "insensitive" } } },
            { usuario_pagador: { nome: { contains: search, mode: "insensitive" } } },
            { loja: { nome: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [payments, total] = await Promise.all([
    adminPaymentsRepository.list({ page, pageSize, where }),
    adminPaymentsRepository.count(where),
  ]);

  return {
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    payments: payments.map(serializePayment),
  };
}

async function refundInternalPayment(repository, payment, adminId, reason) {
  const walletCompositions = payment.composicoes.filter((composition) =>
    composition.carteira_id && composition.status === "CONFIRMADO",
  );
  const walletTotal = walletCompositions.reduce(
    (total, composition) => total + cents(composition.valor_centavos),
    0,
  );

  if (walletTotal !== cents(payment.valor_total_centavos)) {
    throw new AppError(
      "Pagamento antigo sem origem completa de carteira; encaminhe para revisao financeira manual",
      409,
    );
  }

  const claimed = await repository.claimInternalRefund(payment.id);

  if (claimed.count !== 1) {
    throw new AppError("Este pagamento ja foi processado", 409);
  }

  for (const composition of walletCompositions) {
    const amount = cents(composition.valor_centavos);
    const wallet = await repository.restoreWalletBalance(
      composition.carteira_id,
      amount,
    );
    const balanceAfter = cents(wallet.saldo_disponivel_centavos);

    await repository.createWalletMovement({
      carteira_id: composition.carteira_id,
      descricao: `Estorno do pagamento ${payment.id}, autorizado por ${adminId ?? "sistema"}. ${reason}`,
      origem: "ESTORNO",
      origem_id: payment.id,
      saldo_anterior_centavos: BigInt(balanceAfter - amount),
      saldo_posterior_centavos: BigInt(balanceAfter),
      status: "PROCESSADO",
      tipo_lancamento: "ESTORNO",
      usuario_id: wallet.usuario_id,
      valor_centavos: BigInt(amount),
    });
  }

  await repository.markCompositionsRefunded(payment.id);
}

async function cancelOrderAfterRefund(repository, payment, message, title) {
  if (!payment.pedido_loja) {
    return null;
  }

  const order = await repository.cancelOrder(payment.pedido_loja.id);
  await repository.createOrderMessage({
    mensagem: message,
    metadata_json: { kind: "refund", paymentId: payment.id },
    origem: "ADMIN",
    pedido_id: order.id,
    titulo: title,
  });

  return order;
}

function canRefundUnattendedOrder(payment) {
  const order = payment?.pedido_loja;

  return Boolean(
    order
    && ["RECEBIDO", "ACEITO"].includes(order.status)
    && !order.preparando_em
    && refundableStatuses.includes(payment.status),
  );
}

function serviceConversationForPayment(payment) {
  return payment?.cobranca?.proposta_servico?.conversa_servico ?? null;
}

function canRefundUnattendedService(payment) {
  const conversation = serviceConversationForPayment(payment);
  const proposal = payment?.cobranca?.proposta_servico;

  return Boolean(
    conversation
    && proposal?.status === "PAGA"
    && conversation.status === "ACORDADA"
    && refundableStatuses.includes(payment.status),
  );
}

function emitServiceTimeoutUpdate(payment, reason) {
  const conversation = serviceConversationForPayment(payment);
  if (!conversation) return;

  emitServiceChatUpdated({
    conversationId: conversation.id,
    customerUserId: conversation.cliente_usuario_id,
    reason,
    sellerUserId: conversation.vendedor?.usuario_id ?? null,
  });
}

async function cancelUnattendedService(repository, payment, reason) {
  const conversation = serviceConversationForPayment(payment);
  const proposal = payment.cobranca.proposta_servico;
  const canceled = await repository.cancelUnattendedServiceConversation(conversation.id);
  if (canceled.count !== 1) return null;

  await Promise.all([
    repository.updateServiceProposals({
      data: { status: "CANCELADA" },
      where: { id: proposal.id, status: "PAGA" },
    }),
    repository.updateCharges({
      data: { cancelada_em: new Date(), status: "CANCELADA" },
      where: { id: payment.cobranca.id, pagamento_id: payment.id, status: "PAGA" },
    }),
    repository.createServiceMessage({
      data: {
        conversa_servico_id: conversation.id,
        lido_cliente_em: new Date(),
        lido_vendedor_em: new Date(),
        mensagem: "O prestador nao confirmou o inicio dentro do prazo. O atendimento foi cancelado e o estorno sera feito na origem do pagamento.",
        origem: "SISTEMA",
      },
    }),
  ]);

  return repository.findPayment(payment.id);
}

async function cancelUnattendedOrder(repository, payment, reason) {
  const order = payment.pedido_loja;
  const canceled = await repository.cancelUnattendedOrder(order.id, [order.status]);

  if (canceled.count !== 1) {
    return null;
  }

  await repository.createOrderMessage({
    mensagem: "A loja nao iniciou o atendimento dentro do prazo. O pedido foi cancelado e o estorno sera feito na origem do pagamento.",
    metadata_json: {
      kind: "automatic-refund",
      paymentId: payment.id,
      reason,
    },
    origem: "SISTEMA",
    pedido_id: order.id,
    titulo: "Cancelamento automatico",
  });

  return repository.findPayment(payment.id);
}

export async function refundUnattendedOrderPayment(paymentId, {
  reason = "Loja nao iniciou o atendimento dentro do prazo operacional.",
} = {}) {
  const parsedPaymentId = parsePositiveId(paymentId, "Pagamento invalido");
  const payment = await adminPaymentsRepository.findPayment(parsedPaymentId);

  if (!canRefundUnattendedOrder(payment)) {
    return { processed: false, reason: "NOT_ELIGIBLE" };
  }

  if (payment.gateway === "ASAAS") {
    const canceledPayment = await adminPaymentsRepository.transaction(async (repository) => {
      const currentPayment = await repository.findPayment(parsedPaymentId);
      if (!canRefundUnattendedOrder(currentPayment)) {
        return null;
      }

      await repository.assertSettlementReversible(currentPayment.id);
      return cancelUnattendedOrder(repository, currentPayment, reason);
    });

    if (!canceledPayment) {
      return { processed: false, reason: "ORDER_CHANGED" };
    }

    try {
      await requestAsaasPaymentRefund(canceledPayment.id, { reason });
    } catch (error) {
      await adminPaymentsRepository.restoreUnattendedOrder(
        canceledPayment.pedido_loja.id,
        payment.pedido_loja.status,
      );
      throw error;
    }

    await adminPaymentsRepository.transaction(async (_repository, database) => {
      await releaseReservedOrderStock(database, canceledPayment.pedido_loja.id);
    });

    const updatedPayment = await adminPaymentsRepository.findPayment(canceledPayment.id);
    emitOrderStatusUpdated(serializeOrder(updatedPayment.pedido_loja));

    return {
      processed: true,
      payment: serializePayment(updatedPayment),
      pendingGateway: true,
    };
  }

  const result = await adminPaymentsRepository.transaction(async (repository, database) => {
    const currentPayment = await repository.findPayment(parsedPaymentId);
    if (!canRefundUnattendedOrder(currentPayment)) {
      return null;
    }

    const canceledPayment = await cancelUnattendedOrder(repository, currentPayment, reason);
    if (!canceledPayment) {
      return null;
    }

    const reversal = await reverseCommercialSettlement(database, currentPayment.id, { reason });
    await refundInternalPayment(repository, currentPayment, null, reason);
    await releaseReservedOrderStock(database, currentPayment.pedido_loja.id);

    return {
      payment: await repository.findPayment(currentPayment.id),
      reversal,
    };
  });

  if (!result) {
    return { processed: false, reason: "ORDER_CHANGED" };
  }

  emitWalletUpdated({
    transactionId: result.reversal.transactionId ?? result.payment.id,
    userIds: [...new Set([
      result.payment.usuario_pagador_id,
      ...result.reversal.walletUserIds,
    ])],
  });
  emitOrderStatusUpdated(serializeOrder(result.payment.pedido_loja));

  return {
    processed: true,
    payment: serializePayment(result.payment),
    pendingGateway: false,
  };
}

export async function refundUnattendedServicePayment(paymentId, {
  reason = "Prestador nao confirmou a execucao do servico dentro do prazo operacional.",
} = {}) {
  const parsedPaymentId = parsePositiveId(paymentId, "Pagamento invalido");
  const payment = await adminPaymentsRepository.findPayment(parsedPaymentId);
  if (!canRefundUnattendedService(payment)) {
    return { processed: false, reason: "NOT_ELIGIBLE" };
  }

  if (payment.gateway === "ASAAS") {
    const canceledPayment = await adminPaymentsRepository.transaction(async (repository) => {
      const currentPayment = await repository.findPayment(parsedPaymentId);
      if (!canRefundUnattendedService(currentPayment)) return null;
      await repository.assertSettlementReversible(currentPayment.id);
      return cancelUnattendedService(repository, currentPayment, reason);
    });
    if (!canceledPayment) return { processed: false, reason: "SERVICE_CHANGED" };

    try {
      await requestAsaasPaymentRefund(canceledPayment.id, { reason });
    } catch (error) {
      const conversation = serviceConversationForPayment(canceledPayment);
      await adminPaymentsRepository.transaction(async (repository) => {
        await Promise.all([
          repository.restoreUnattendedServiceConversation(conversation.id),
          repository.updateServiceProposals({
            data: { status: "PAGA" },
            where: { id: canceledPayment.cobranca.proposta_servico.id, status: "CANCELADA" },
          }),
          repository.updateCharges({
            data: { cancelada_em: null, status: "PAGA" },
            where: { id: canceledPayment.cobranca.id, pagamento_id: canceledPayment.id, status: "CANCELADA" },
          }),
        ]);
      });
      throw error;
    }

    const updatedPayment = await adminPaymentsRepository.findPayment(canceledPayment.id);
    emitServiceTimeoutUpdate(updatedPayment, "service-timeout-refund-requested");
    return { processed: true, payment: serializePayment(updatedPayment), pendingGateway: true };
  }

  const result = await adminPaymentsRepository.transaction(async (repository) => {
    const currentPayment = await repository.findPayment(parsedPaymentId);
    if (!canRefundUnattendedService(currentPayment)) return null;
    await repository.assertSettlementReversible(currentPayment.id);
    const canceledPayment = await cancelUnattendedService(repository, currentPayment, reason);
    if (!canceledPayment) return null;
    await refundInternalPayment(repository, currentPayment, null, reason);
    return repository.findPayment(currentPayment.id);
  });
  if (!result) return { processed: false, reason: "SERVICE_CHANGED" };

  emitWalletUpdated({ transactionId: result.id, userIds: [result.usuario_pagador_id] });
  emitServiceTimeoutUpdate(result, "service-timeout-refunded");
  return { processed: true, payment: serializePayment(result), pendingGateway: false };
}

export async function refundAdminPayment(adminId, paymentId, { reason }) {
  const parsedPaymentId = parsePositiveId(paymentId, "Pagamento invalido");
  const payment = await adminPaymentsRepository.findPayment(parsedPaymentId);

  if (!payment) {
    throw new AppError("Pagamento nao encontrado", 404);
  }

  if (!refundableStatuses.includes(payment.status)) {
    throw new AppError("Pagamento ja cancelado, estornado ou sem confirmacao", 409);
  }

  const deadline = refundDeadline(payment);

  if (!deadline || Date.now() >= deadline.getTime()) {
    throw new AppError(
      "O prazo automatico de estorno de 24 horas terminou. Encaminhe o caso para revisao financeira.",
      409,
    );
  }

  if (payment.gateway === "ASAAS") {
    await adminPaymentsRepository.assertSettlementReversible(payment.id);
    await requestAsaasPaymentRefund(payment.id, { reason });

    return {
      message: "Estorno Pix solicitado ao Asaas. Os ganhos serao revertidos quando o gateway confirmar a devolucao.",
      payment: serializePayment(await adminPaymentsRepository.findPayment(payment.id)),
    };
  }

  const result = await adminPaymentsRepository.transaction(async (repository, database) => {
    await repository.assertSettlementReversible(payment.id);
    const reversal = await reverseCommercialSettlement(database, payment.id, { reason });
    await refundInternalPayment(repository, payment, adminId, reason);
    const order = await cancelOrderAfterRefund(
      repository,
      payment,
      "Cancelamento aprovado. O valor usado das carteiras ja esta disponivel novamente.",
      "Estorno concluido",
    );

    return { order, reversal };
  });

  emitWalletUpdated({
    transactionId: result.reversal.transactionId ?? payment.id,
    userIds: [...new Set([payment.usuario_pagador_id, ...result.reversal.walletUserIds])],
  });
  if (result.order) {
    emitOrderStatusUpdated(serializeOrder(result.order));
  }

  const updatedPayment = await adminPaymentsRepository.findPayment(payment.id);

  return {
    message: "Saldo devolvido as carteiras de origem e ganhos da venda revertidos",
    payment: serializePayment(updatedPayment),
  };
}

export async function refreshAdminAsaasRefundPayment(paymentId) {
  const parsedPaymentId = parsePositiveId(paymentId, "Pagamento invalido");
  await refreshAsaasRefundPayment(parsedPaymentId);

  const payment = await adminPaymentsRepository.findPayment(parsedPaymentId);

  return {
    message: payment.status === "ESTORNADO"
      ? "Estorno confirmado pelo Asaas"
      : "O Asaas ainda esta processando o estorno",
    payment: serializePayment(payment),
  };
}
