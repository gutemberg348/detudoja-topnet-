import {
  emitOrderMessageCreated,
  emitOrderStatusUpdated,
  emitServiceChatUpdated,
  emitWalletUpdated,
} from "../../realtime/socket.server.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { reverseCommercialSettlement } from "../earnings/order-earnings.service.js";
import { releaseReservedOrderStock } from "../orders/order-stock.service.js";
import { serializeOrder, serializeOrderMessage } from "../orders/orders.serializer.js";
import {
  refreshAsaasRefundPayment,
  requestAsaasPaymentRefund,
} from "../payments/asaas.service.js";
import {
  creditPaymentRefundToBalance,
  restorePaymentWalletCompositions,
} from "../payments/payment-refund-wallet.service.js";
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

async function refundInternalPayment(repository, database, payment, adminId, reason) {
  const claimed = await repository.claimInternalRefund(payment.id);

  if (claimed.count !== 1) {
    throw new AppError("Este pagamento ja foi processado", 409);
  }

  return restorePaymentWalletCompositions(database, payment, {
    reason: `Autorizado por ${adminId ?? "sistema"}. ${reason}`,
    requireFullAmount: true,
  });
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

function canCustomerCancelPaidOrder(payment, userId) {
  const order = payment?.pedido_loja;
  const availableAt = payment?.pago_em
    ? payment.pago_em.getTime() + (env.orders.unattendedTimeoutMinutes * 60 * 1_000)
    : null;

  return Boolean(
    order
    && order.usuario_id === Number(userId)
    && order.status === "RECEBIDO"
    && !order.aceito_em
    && !order.preparando_em
    && refundableStatuses.includes(payment.status)
    && availableAt
    && Date.now() >= availableAt,
  );
}

async function createCustomerCancellationMessage(repository, payment, destination) {
  const toBalance = destination === "BALANCE";
  return repository.createOrderMessage({
    mensagem: toBalance
      ? "Cancelamento confirmado. O valor total foi creditado no seu Saldo Pix do aplicativo."
      : payment.gateway === "ASAAS"
        ? "Cancelamento confirmado. Solicitamos ao Asaas o estorno para a conta Pix de origem. A confirmacao aparecera aqui quando o gateway concluir."
        : "Cancelamento confirmado. O valor voltou para as carteiras usadas no pagamento.",
    metadata_json: {
      kind: "customer-refund",
      paymentId: payment.id,
      refundDestination: destination,
      status: toBalance || payment.gateway !== "ASAAS" ? "ESTORNADO" : "EM_DISPUTA",
    },
    origem: "SISTEMA",
    pedido_id: payment.pedido_loja.id,
    titulo: toBalance || payment.gateway !== "ASAAS"
      ? "Cancelado e devolvido"
      : "Estorno solicitado",
  });
}

export async function refundCustomerOrderPayment(userId, orderId, {
  destination = "ORIGINAL",
} = {}) {
  const parsedOrderId = parsePositiveId(orderId, "Pedido invalido");
  const normalizedDestination = String(destination).trim().toUpperCase();

  if (!["ORIGINAL", "BALANCE"].includes(normalizedDestination)) {
    throw new AppError("Escolha devolver para a origem ou para o Saldo Pix", 400);
  }

  const payment = await adminPaymentsRepository.findPaymentByOrderId(parsedOrderId);

  if (!payment || payment.pedido_loja?.usuario_id !== Number(userId)) {
    throw new AppError("Pedido nao encontrado", 404);
  }

  if (!canCustomerCancelPaidOrder(payment, userId)) {
    throw new AppError(
      "O cancelamento pago fica disponivel se a loja nao aceitar dentro do prazo. Atualize o pedido ou fale com o suporte.",
      409,
    );
  }

  const reason = "Cancelamento solicitado pelo cliente porque a loja nao aceitou o pedido no prazo.";

  if (normalizedDestination === "ORIGINAL" && payment.gateway === "ASAAS") {
    const canceledPayment = await adminPaymentsRepository.transaction(async (repository) => {
      const currentPayment = await repository.findPayment(payment.id);
      if (!canCustomerCancelPaidOrder(currentPayment, userId)) return null;
      await repository.assertSettlementReversible(currentPayment.id);
      const canceled = await repository.cancelUnattendedOrder(currentPayment.pedido_loja.id, ["RECEBIDO"]);
      return canceled.count === 1 ? repository.findPayment(currentPayment.id) : null;
    });

    if (!canceledPayment) {
      throw new AppError("O pedido mudou antes do cancelamento. Atualize a tela.", 409);
    }

    try {
      await requestAsaasPaymentRefund(canceledPayment.id, { reason });
    } catch (error) {
      await adminPaymentsRepository.restoreUnattendedOrder(canceledPayment.pedido_loja.id, "RECEBIDO");
      throw error;
    }

    const message = await adminPaymentsRepository.transaction(async (repository, database) => {
      await releaseReservedOrderStock(database, canceledPayment.pedido_loja.id);
      return createCustomerCancellationMessage(repository, canceledPayment, normalizedDestination);
    });
    const updatedPayment = await adminPaymentsRepository.findPayment(canceledPayment.id);
    const serializedOrder = serializeOrder(updatedPayment.pedido_loja);
    const serializedMessage = serializeOrderMessage(message);

    emitOrderMessageCreated({
      customerId: updatedPayment.pedido_loja.usuario_id,
      message: serializedMessage,
      orderId: updatedPayment.pedido_loja.id,
      storeId: updatedPayment.pedido_loja.loja_id,
    });
    emitOrderStatusUpdated(serializedOrder);

    return {
      message: serializedMessage,
      order: serializedOrder,
      payment: serializePayment(updatedPayment),
      refundDestination: "PIX_ORIGEM",
      refundPending: true,
    };
  }

  const result = await adminPaymentsRepository.transaction(async (repository, database) => {
    const currentPayment = await repository.findPayment(payment.id);
    if (!canCustomerCancelPaidOrder(currentPayment, userId)) return null;
    await repository.assertSettlementReversible(currentPayment.id);
    const canceled = await repository.cancelUnattendedOrder(currentPayment.pedido_loja.id, ["RECEBIDO"]);
    if (canceled.count !== 1) return null;

    const reversal = await reverseCommercialSettlement(database, currentPayment.id, { reason });
    let walletResult;

    if (normalizedDestination === "BALANCE") {
      const claimed = await repository.claimInternalRefund(currentPayment.id);
      if (claimed.count !== 1) throw new AppError("Este pagamento ja foi processado", 409);
      walletResult = await creditPaymentRefundToBalance(database, currentPayment, reason);
    } else {
      walletResult = await refundInternalPayment(
        repository,
        database,
        currentPayment,
        null,
        reason,
      );
    }

    await releaseReservedOrderStock(database, currentPayment.pedido_loja.id);
    const message = await createCustomerCancellationMessage(
      repository,
      currentPayment,
      normalizedDestination,
    );

    return {
      message,
      payment: await repository.findPayment(currentPayment.id),
      reversal,
      walletResult,
    };
  });

  if (!result) {
    throw new AppError("O pedido mudou antes do cancelamento. Atualize a tela.", 409);
  }

  const serializedOrder = serializeOrder(result.payment.pedido_loja);
  const serializedMessage = serializeOrderMessage(result.message);
  emitWalletUpdated({
    transactionId: result.reversal.transactionId ?? result.payment.id,
    userIds: [...new Set([
      result.payment.usuario_pagador_id,
      ...result.reversal.walletUserIds,
      ...(result.walletResult?.userIds ?? []),
    ])],
  });
  emitOrderMessageCreated({
    customerId: result.payment.pedido_loja.usuario_id,
    message: serializedMessage,
    orderId: result.payment.pedido_loja.id,
    storeId: result.payment.pedido_loja.loja_id,
  });
  emitOrderStatusUpdated(serializedOrder);

  return {
    message: serializedMessage,
    order: serializedOrder,
    payment: serializePayment(result.payment),
    refundDestination: normalizedDestination === "BALANCE" ? "SALDO_PIX" : "CARTEIRAS_ORIGEM",
    refundPending: false,
  };
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
    await refundInternalPayment(repository, database, currentPayment, null, reason);
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

  const result = await adminPaymentsRepository.transaction(async (repository, database) => {
    const currentPayment = await repository.findPayment(parsedPaymentId);
    if (!canRefundUnattendedService(currentPayment)) return null;
    await repository.assertSettlementReversible(currentPayment.id);
    const canceledPayment = await cancelUnattendedService(repository, currentPayment, reason);
    if (!canceledPayment) return null;
    await refundInternalPayment(repository, database, currentPayment, null, reason);
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
    await refundInternalPayment(repository, database, payment, adminId, reason);
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
