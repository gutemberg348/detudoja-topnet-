import {
  emitOrderMessageCreated,
  emitOrderStatusUpdated,
  emitWalletUpdated,
} from "../../realtime/socket.server.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { processAsaasTransferWebhook } from "../payouts/payout.service.js";
import { processAsaasWithdrawalWebhook } from "../withdrawals/withdrawal.service.js";
import { asaasRepository, createAsaasRepository } from "./asaas.repository.js";
import { reverseCommercialSettlement } from "../earnings/order-earnings.service.js";
import { assertPaymentMonthlyCpfLimit } from "../earnings/commercial-limit.service.js";
import { releaseReservedOrderStock } from "../orders/order-stock.service.js";
import { serializeOrder, serializeOrderMessage } from "../orders/orders.serializer.js";
import { ensureAsaasCustomer } from "./asaas-customer.service.js";
import { emitWalletDepositUpdate, settleWalletDepositPayment } from "../wallet-deposits/wallet-deposit.service.js";
import {
  cancelChargePayment,
  publishChargePaymentResult,
  settleConfirmedChargePayment,
} from "../charges/charge.service.js";
import {
  createAsaasPixPayment,
  deleteAsaasPayment,
  getAsaasPaymentStatus,
  getAsaasPixQrCode,
  isAsaasEnabled,
  listAsaasPayments,
  refundAsaasPayment,
} from "./asaas.client.js";

const orderInclude = {
  _count: {
    select: {
      mensagens: {
        where: {
          lido_cliente_em: null,
          origem: { in: ["LOJA", "ADMIN"] },
        },
      },
    },
  },
  comprador: { select: { email: true, id: true, nome: true, telefone: true } },
  itens: { orderBy: { criado_em: "asc" } },
  loja: { select: { id: true, nome: true } },
  pagamento: true,
  propostas: { orderBy: { criado_em: "asc" } },
};

const orderMessageInclude = {
  autor: { select: { id: true, nome: true } },
};

function asaasValue(cents) {
  return Number((Number(cents) / 100).toFixed(2));
}

function dueDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .filter((part) => part.type !== "literal");
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function pixQrDataUrl(encodedImage) {
  return encodedImage ? `data:image/png;base64,${encodedImage}` : null;
}

function asaasPaymentReference(paymentId) {
  return `DTJ:PAYMENT:${paymentId}`;
}

function asaasWalletDepositReference(depositId) {
  return `DTJ:WALLET_DEPOSIT:${depositId}`;
}

function asaasReferenceForPayment(payment) {
  return payment.deposito_carteira
    ? asaasWalletDepositReference(payment.deposito_carteira.id)
    : asaasPaymentReference(payment.id);
}

function asaasReferenceTarget(reference) {
  const match = /^DTJ:(PAYMENT|WALLET_DEPOSIT):(\d+)$/.exec(String(reference ?? "").trim());
  const id = Number(match?.[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { id, type: match[1] };
}

function serializePendingAsaasPayment(payment) {
  return {
    expiresAt: payment.expira_em?.toISOString() ?? null,
    gateway: "ASAAS",
    id: payment.id,
    pixCopyPaste: payment.copia_cola_pix,
    qrImageDataUrl: payment.qr_code,
    status: payment.status,
  };
}

function remotePaymentFromList(response, reference) {
  const matches = (response?.data ?? []).filter(
    (payment) => payment?.externalReference === reference,
  );

  if (matches.length > 1) {
    throw new AppError("Foram encontradas cobrancas externas duplicadas; o suporte financeiro foi avisado", 409);
  }

  return matches[0] ?? null;
}

export async function markPendingAsaasPaymentForReconciliation(paymentId) {
  await asaasRepository.updatePayments({
    data: { status: "EM_RECONCILIACAO" },
    where: {
      gateway: "ASAAS",
      id: Number(paymentId),
      status: { in: ["AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"] },
    },
  });
}

export function shouldUseAsaasPix({ pixComplementCents, walletUsedCents }) {
  return Number(pixComplementCents) > 0 && Number(walletUsedCents) === 0;
}

export async function createPendingAsaasPix({ description, paymentId, userId }) {
  const payment = await asaasRepository.findPayment({
    select: {
      copia_cola_pix: true,
      expira_em: true,
      gateway: true,
      id: true,
      qr_code: true,
      status: true,
      usuario_pagador_id: true,
      valor_pago_pix_centavos: true,
    },
    where: { id: paymentId },
  });

  if (!payment || payment.usuario_pagador_id !== userId || payment.gateway !== "ASAAS") {
    throw new AppError("Pagamento externo nao encontrado", 404);
  }

  if (payment.status === "EM_RECONCILIACAO") {
    return serializePendingAsaasPayment(payment);
  }

  if (payment.status !== "AGUARDANDO_PAGAMENTO") {
    throw new AppError("Este pagamento nao esta aguardando Pix", 409);
  }

  let remotePayment = null;

  try {
    const customerId = await ensureAsaasCustomer(userId);
    remotePayment = await createAsaasPixPayment({
      billingType: "PIX",
      customer: customerId,
      description,
      dueDate: dueDate(),
      externalReference: asaasPaymentReference(payment.id),
      value: asaasValue(payment.valor_pago_pix_centavos),
    });

    await asaasRepository.updatePayment({
      data: { gateway_pagamento_id: remotePayment.id },
      where: { id: payment.id },
    });

    const pix = await getAsaasPixQrCode(remotePayment.id);
    const updated = await asaasRepository.updatePayment({
      data: {
        copia_cola_pix: pix.payload ?? null,
        expira_em: pix.expirationDate ? new Date(pix.expirationDate) : null,
        qr_code: pixQrDataUrl(pix.encodedImage),
      },
      where: { id: payment.id },
    });

    return serializePendingAsaasPayment(updated);
  } catch (error) {
    // A requisicao pode ter chegado ao Asaas mesmo sem resposta. Nunca cancele
    // localmente antes de procurar a referencia externa criada por este pagamento.
    if (remotePayment?.id) {
      await asaasRepository.updatePayment({
        data: { gateway_pagamento_id: remotePayment.id },
        where: { id: payment.id },
      });
    }
    await markPendingAsaasPaymentForReconciliation(payment.id);

    if (error.providerStateUnknown || remotePayment?.id) {
      const pending = await asaasRepository.findPayment({ where: { id: payment.id } });
      return serializePendingAsaasPayment(pending);
    }

    throw error;
  }
}

export async function failPendingAsaasPayment(paymentId) {
  const result = await asaasRepository.transaction(async (database) => {
    const repository = createAsaasRepository(database);
    const payment = await repository.findPayment({
      select: { id: true },
      where: { id: paymentId },
    });

    if (!payment) {
      return null;
    }

    const claimed = await repository.updatePayments({
      data: { status: "FALHOU" },
      where: { id: payment.id, status: { in: ["AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"] } },
    });
    if (claimed.count !== 1) return null;
    await repository.updateWalletDeposits({
      data: { status: "FALHOU" },
      where: { pagamento_id: payment.id, status: "PENDENTE" },
    });
    await repository.updatePaymentCompositions({
      data: { status: "CANCELADO" },
      where: { pagamento_id: payment.id, status: "PENDENTE", tipo_origem: "PIX" },
    });
    const order = await repository.findFirstOrder({
      select: { id: true },
      where: { pagamento_id: payment.id },
    });

    await repository.updateOrders({
      data: { cancelado_em: new Date(), status: "CANCELADO" },
      where: { pagamento_id: payment.id, status: "AGUARDANDO_PAGAMENTO" },
    });
    if (order) {
      await releaseReservedOrderStock(database, order.id);
      await repository.updateProposals({
        data: { status: "CANCELADA" },
        where: { pedido_id: order.id, status: "ACEITA" },
      });
    }
    return cancelChargePayment(database, payment.id);
  });
  await publishChargePaymentResult(result);
  return result;
}

function isPaymentConfirmed(event) {
  return ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event);
}

function mapPaymentStatus(event) {
  if (isPaymentConfirmed(event)) {
    return "PAGO";
  }

  if (event === "PAYMENT_REFUNDED") {
    return "ESTORNADO";
  }

  // Este fluxo so executa estorno integral. Um evento parcial precisa de
  // conciliacao financeira com valores proporcionais antes de mexer nos ganhos.
  if (event === "PAYMENT_PARTIALLY_REFUNDED") {
    return null;
  }

  if (["PAYMENT_DELETED", "PAYMENT_OVERDUE"].includes(event)) {
    return "CANCELADO";
  }

  if (["PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", "PAYMENT_REPROVED_BY_RISK_ANALYSIS"].includes(event)) {
    return "FALHOU";
  }

  return null;
}

function eventForAsaasPaymentStatus(status) {
  const events = {
    DELETED: "PAYMENT_DELETED",
    OVERDUE: "PAYMENT_OVERDUE",
    RECEIVED: "PAYMENT_RECEIVED",
    RECEIVED_IN_CASH: "PAYMENT_RECEIVED",
    CONFIRMED: "PAYMENT_CONFIRMED",
    REFUNDED: "PAYMENT_REFUNDED",
  };

  return events[String(status ?? "").trim().toUpperCase()] ?? null;
}

export async function reconcilePendingAsaasPayment(paymentId) {
  const payment = await asaasRepository.findPayment({
    select: {
      criado_em: true,
      deposito_carteira: { select: { id: true } },
      gateway: true,
      gateway_pagamento_id: true,
      id: true,
      status: true,
    },
    where: { id: Number(paymentId) },
  });

  if (
    !payment
    || payment.gateway !== "ASAAS"
    || payment.status !== "EM_RECONCILIACAO"
  ) {
    return { reconciled: false, state: "NOT_PENDING" };
  }

  let remotePayment;
  if (payment.gateway_pagamento_id) {
    remotePayment = await getAsaasPaymentStatus(payment.gateway_pagamento_id);
    remotePayment = { ...remotePayment, id: payment.gateway_pagamento_id };
  } else {
    const reference = asaasReferenceForPayment(payment);
    const response = await listAsaasPayments({
      externalReference: reference,
      limit: 2,
    });
    remotePayment = remotePaymentFromList(
      response,
      reference,
    );
  }

  if (!remotePayment?.id) {
    const expiresAt = payment.criado_em.getTime()
      + (env.asaas.reconciliationGraceSeconds * 1_000);
    if (Date.now() >= expiresAt) {
      await failPendingAsaasPayment(payment.id);
      return { reconciled: true, state: "NOT_FOUND_AFTER_GRACE" };
    }
    return { reconciled: false, state: "WAITING_FOR_GATEWAY" };
  }

  await asaasRepository.updatePayment({
    data: {
      gateway_pagamento_id: remotePayment.id,
      status: "AGUARDANDO_PAGAMENTO",
    },
    where: { id: payment.id },
  });

  const gatewayStatus = String(remotePayment.status ?? "PENDING").toUpperCase();
  const event = eventForAsaasPaymentStatus(gatewayStatus);
  if (event) {
    await processAsaasWebhook({
      event,
      id: `payment-reconciliation:${remotePayment.id}:${gatewayStatus}`,
      payment: { id: remotePayment.id, status: gatewayStatus },
    });
  }

  return {
    gatewayPaymentId: remotePayment.id,
    gatewayStatus,
    reconciled: true,
    state: "LINKED",
  };
}

export async function reconcilePendingAsaasPayments({ batchSize = 25 } = {}) {
  if (!isAsaasEnabled()) return { failed: [], reconciled: 0, scanned: 0, waiting: 0 };

  const payments = await asaasRepository.findPayments({
    orderBy: { atualizado_em: "asc" },
    select: { id: true },
    take: batchSize,
    where: {
      gateway: "ASAAS",
      status: "EM_RECONCILIACAO",
    },
  });
  const failed = [];
  let reconciled = 0;
  let waiting = 0;

  for (const payment of payments) {
    try {
      const result = await reconcilePendingAsaasPayment(payment.id);
      if (result.reconciled) reconciled += 1;
      else waiting += 1;
    } catch (error) {
      failed.push({ error, paymentId: payment.id });
    }
  }

  return { failed, reconciled, scanned: payments.length, waiting };
}

async function settleAsaasPayment(database, paymentId, event) {
  const repository = createAsaasRepository(database);
  const nextStatus = mapPaymentStatus(event);

  if (!nextStatus) {
    return null;
  }

  if (nextStatus === "PAGO") {
    await assertPaymentMonthlyCpfLimit(database, paymentId);
  }

  const allowedCurrentStatuses = nextStatus === "ESTORNADO"
    ? ["PAGO", "LIQUIDADO", "EM_DISPUTA"]
    : ["PENDENTE", "AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"];
  const claimed = await repository.updatePayments({
    data: {
      cancelado_em: ["CANCELADO", "FALHOU"].includes(nextStatus) ? new Date() : null,
      estornado_em: nextStatus === "ESTORNADO" ? new Date() : null,
      pago_em: nextStatus === "PAGO" ? new Date() : null,
      status: nextStatus,
    },
    where: {
      id: paymentId,
      status: { in: allowedCurrentStatuses },
    },
  });

  if (claimed.count === 0) {
    return null;
  }

  await repository.updatePaymentCompositions({
    data: {
      status: nextStatus === "PAGO"
        ? "CONFIRMADO"
        : nextStatus === "ESTORNADO"
          ? "ESTORNADO"
          : "CANCELADO",
    },
    where: { pagamento_id: paymentId, tipo_origem: "PIX" },
  });

  const reversal = nextStatus === "ESTORNADO"
    ? await reverseCommercialSettlement(database, paymentId, {
        reason: "Estorno Pix confirmado pelo Asaas.",
      })
    : null;

  const chargeSettlement = nextStatus === "PAGO"
    ? await settleConfirmedChargePayment(database, paymentId)
    : await cancelChargePayment(database, paymentId, {
        refunded: nextStatus === "ESTORNADO",
      });
  if (chargeSettlement) {
    return { ...chargeSettlement, reversal };
  }

  const order = await repository.findFirstOrder({
    include: orderInclude,
    where: { pagamento_id: paymentId },
  });

  if (!order) {
    return { message: null, order: null, reversal };
  }

  if (nextStatus === "PAGO") {
    const paidAt = new Date();
    await repository.updateProposals({
      data: { pago_em: paidAt, status: "PAGA" },
      where: {
        pedido_id: order.id,
        status: "ACEITA",
      },
    });
    const movedOrder = await repository.updateOrders({
      data: { status: "RECEBIDO" },
      where: {
        id: order.id,
        status: "AGUARDANDO_PAGAMENTO",
      },
    });

    if (movedOrder.count !== 1) {
      throw new AppError(
        "O pedido mudou antes da confirmacao do Pix; atualize a tela e contate o suporte se necessario",
        409,
      );
    }

    const updatedOrder = await repository.findUniqueOrder({
      include: orderInclude,
      where: { id: order.id },
    });
    const message = await repository.createOrderMessage({
      data: {
        mensagem: "Pix confirmado. Aguarde a loja aceitar o pedido para iniciar o atendimento.",
        metadata_json: { gateway: "ASAAS", kind: "payment", status: "RECEBIDO" },
        origem: "SISTEMA",
        pedido_id: order.id,
        titulo: "Pagamento confirmado",
      },
      include: orderMessageInclude,
    });

    return { message, order: updatedOrder, reversal };
  }

  await repository.updateProposals({
    data: { status: "CANCELADA" },
    where: {
      pedido_id: order.id,
      status: "ACEITA",
    },
  });
  const updatedOrder = await repository.updateOrder({
    data: { cancelado_em: new Date(), status: "CANCELADO" },
    include: orderInclude,
    where: { id: order.id },
  });
  if (["CANCELADO", "FALHOU"].includes(nextStatus)) {
    await releaseReservedOrderStock(database, order.id);
  }

  const refundMessage = nextStatus === "ESTORNADO"
    ? await repository.createOrderMessage({
        data: {
          mensagem: "O estorno Pix foi confirmado. Os valores e ganhos vinculados a esta compra foram revertidos.",
          metadata_json: { gateway: "ASAAS", kind: "refund", status: "ESTORNADO" },
          origem: "SISTEMA",
          pedido_id: order.id,
          titulo: "Estorno confirmado",
        },
        include: orderMessageInclude,
      })
    : null;

  return { message: refundMessage, order: updatedOrder, reversal };
}

export async function requestAsaasPaymentRefund(paymentId, { reason }) {
  const payment = await asaasRepository.findPayment({
    select: {
      deposito_carteira: { select: { id: true } },
      gateway: true,
      gateway_pagamento_id: true,
      id: true,
      status: true,
    },
    where: { id: Number(paymentId) },
  });

  if (!payment || payment.gateway !== "ASAAS" || !payment.gateway_pagamento_id) {
    throw new AppError("Pagamento Asaas nao encontrado", 404);
  }

  if (payment.deposito_carteira) {
    throw new AppError("Depositos de carteira nao podem ser estornados automaticamente", 409);
  }

  if (!["PAGO", "LIQUIDADO"].includes(payment.status)) {
    throw new AppError("Este pagamento nao pode ser estornado", 409);
  }

  const claimed = await asaasRepository.updatePayments({
    data: { status: "EM_DISPUTA" },
    where: { id: payment.id, status: { in: ["PAGO", "LIQUIDADO"] } },
  });

  if (claimed.count !== 1) {
    throw new AppError("O estorno deste pagamento ja foi solicitado", 409);
  }

  try {
    return await refundAsaasPayment(payment.gateway_pagamento_id, {
      description: `Estorno Brasil Cashback do pagamento ${payment.id}: ${reason}`,
    });
  } catch (error) {
    await asaasRepository.updatePayments({
      data: { status: payment.status },
      where: { id: payment.id, status: "EM_DISPUTA" },
    });
    throw error;
  }
}

export async function refreshAsaasRefundPayment(paymentId) {
  const payment = await asaasRepository.findPayment({
    select: {
      gateway: true,
      gateway_pagamento_id: true,
      id: true,
      status: true,
    },
    where: { id: Number(paymentId) },
  });

  if (!payment || payment.gateway !== "ASAAS" || !payment.gateway_pagamento_id) {
    throw new AppError("Pagamento Asaas nao encontrado", 404);
  }

  if (payment.status !== "EM_DISPUTA") {
    throw new AppError("Este estorno nao esta aguardando confirmacao do Asaas", 409);
  }

  const remotePayment = await getAsaasPaymentStatus(payment.gateway_pagamento_id);
  const gatewayStatus = String(remotePayment?.status ?? "UNKNOWN").toUpperCase();
  const event = eventForAsaasPaymentStatus(gatewayStatus);

  if (event) {
    await processAsaasWebhook({
      event,
      id: `refund-manual:${payment.gateway_pagamento_id}:${gatewayStatus}`,
      payment: { id: payment.gateway_pagamento_id, status: gatewayStatus },
    });
  }

  return { gatewayStatus };
}

export async function cancelPendingAsaasOrderPayment(userId, orderId) {
  const order = await asaasRepository.findFirstOrder({
    select: {
      id: true,
      pagamento: {
        select: { gateway: true, gateway_pagamento_id: true, id: true, status: true },
      },
    },
    where: { id: Number(orderId), usuario_id: userId },
  });

  if (!order?.pagamento || order.pagamento.gateway !== "ASAAS") {
    return false;
  }

  if (order.pagamento.status !== "AGUARDANDO_PAGAMENTO") {
    throw new AppError("A cobranca Pix nao pode mais ser cancelada diretamente", 409);
  }

  await deleteAsaasPayment(order.pagamento.gateway_pagamento_id);
  await processAsaasWebhook({
    event: "PAYMENT_DELETED",
    id: `cancel:${order.pagamento.gateway_pagamento_id}:${Date.now()}`,
    payment: { id: order.pagamento.gateway_pagamento_id },
  });

  return true;
}

export async function processAsaasWebhook(payload) {
  const eventId = String(payload?.id ?? "").trim();
  const event = String(payload?.event ?? "").trim();
  const remotePaymentId = String(payload?.payment?.id ?? "").trim();
  const externalReference = String(payload?.payment?.externalReference ?? "").trim();
  const referenceTarget = asaasReferenceTarget(externalReference);

  if (event.startsWith("TRANSFER_")) {
    const withdrawalResult = await processAsaasWithdrawalWebhook(payload);
    return withdrawalResult.handled
      ? withdrawalResult
      : processAsaasTransferWebhook(payload);
  }

  if (!eventId || !event) {
    throw new AppError("Evento do Asaas invalido", 400);
  }

  const result = await asaasRepository.transaction(async (database) => {
    const repository = createAsaasRepository(database);
    const paymentByGatewayId = remotePaymentId
      ? await repository.findFirstPayment({
          select: { gateway_pagamento_id: true, id: true },
          where: { gateway: "ASAAS", gateway_pagamento_id: remotePaymentId },
        })
      : null;
    const paymentByReference = referenceTarget?.type === "PAYMENT"
      ? await repository.findFirstPayment({
          select: { gateway_pagamento_id: true, id: true },
          where: { gateway: "ASAAS", id: referenceTarget.id },
        })
      : referenceTarget?.type === "WALLET_DEPOSIT"
        ? (await repository.findFirstWalletDeposit({
            select: { pagamento: { select: { gateway_pagamento_id: true, id: true } } },
            where: { id: referenceTarget.id },
          }))?.pagamento ?? null
        : null;
    const payment = paymentByGatewayId ?? paymentByReference;

    if (payment && remotePaymentId && !payment.gateway_pagamento_id) {
      await repository.updatePayment({
        data: { gateway_pagamento_id: remotePaymentId },
        where: { id: payment.id },
      });
    }

    try {
      await repository.createGatewayEvent({
        data: {
          gateway: "ASAAS",
          gateway_evento_id: eventId,
          pagamento_id: payment?.id ?? null,
          payload_json: payload,
          tipo_evento: event,
        },
      });
    } catch (error) {
      if (error.code === "P2002") {
        return { duplicate: true };
      }

      throw error;
    }

    const walletDepositSettlement = payment
      ? await settleWalletDepositPayment(database, payment.id, event)
      : null;
    const settled = walletDepositSettlement ?? (payment
      ? await settleAsaasPayment(database, payment.id, event)
      : null);

    await repository.updateGatewayEvent({
      data: { processado_em: new Date() },
      where: { gateway_evento_id: eventId },
    });

    return { duplicate: false, settled };
  });

  if (result.settled?.order) {
    const order = serializeOrder(result.settled.order);
    emitOrderStatusUpdated(order);

    if (result.settled.message) {
      emitOrderMessageCreated({
        customerId: order.customer?.id,
        message: serializeOrderMessage(result.settled.message),
        orderId: order.id,
        storeId: order.storeId,
      });
    }
  }

  if (result.settled?.reversal?.walletUserIds?.length) {
    emitWalletUpdated({
      transactionId: result.settled.reversal.transactionId,
      userIds: result.settled.reversal.walletUserIds,
    });
  }

  if (result.settled?.walletUserIds?.length && !result.settled?.charge) {
    emitWalletDepositUpdate(result.settled.walletUserIds);
  }

  if (result.settled?.charge) {
    await publishChargePaymentResult(result.settled);
  }

  return { duplicate: Boolean(result.duplicate), processed: true };
}

export async function refreshPendingAsaasWalletDeposit(userId, depositId) {
  const parsedDepositId = Number(depositId);
  if (!Number.isSafeInteger(parsedDepositId) || parsedDepositId <= 0) {
    throw new AppError("Deposito invalido", 400);
  }

  const deposit = await asaasRepository.findFirstWalletDeposit({
    include: { pagamento: true },
    where: { id: parsedDepositId, usuario_id: userId },
  });
  if (!deposit) throw new AppError("Deposito nao encontrado", 404);
  if (
    deposit.status !== "PENDENTE"
    || !["AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"].includes(deposit.pagamento.status)
  ) {
    throw new AppError("Este deposito nao esta aguardando pagamento", 409);
  }
  if (deposit.pagamento.gateway !== "ASAAS") {
    throw new AppError("Pagamento Asaas nao disponivel para consulta", 409);
  }

  if (deposit.pagamento.status === "EM_RECONCILIACAO") {
    await reconcilePendingAsaasPayment(deposit.pagamento.id);
  }

  const refreshedDeposit = await asaasRepository.findFirstWalletDeposit({
    include: { pagamento: true },
    where: { id: parsedDepositId, usuario_id: userId },
  });
  if (!refreshedDeposit?.pagamento?.gateway_pagamento_id) {
    return {
      checkedAt: new Date().toISOString(),
      gatewayStatus: "RECONCILING",
      reconciliation: "WAITING_FOR_GATEWAY",
    };
  }

  const remotePayment = await getAsaasPaymentStatus(refreshedDeposit.pagamento.gateway_pagamento_id);
  const gatewayStatus = String(remotePayment?.status ?? "UNKNOWN").toUpperCase();
  const event = eventForAsaasPaymentStatus(gatewayStatus);
  if (event) {
    await processAsaasWebhook({
      event,
      id: `wallet-deposit-manual:${refreshedDeposit.pagamento.gateway_pagamento_id}:${gatewayStatus}`,
      payment: { id: refreshedDeposit.pagamento.gateway_pagamento_id, status: gatewayStatus },
    });
  }

  return { checkedAt: new Date().toISOString(), gatewayStatus };
}

export async function refreshPendingAsaasOrderPayment(userId, orderId) {
  const parsedOrderId = Number(orderId);

  if (!Number.isSafeInteger(parsedOrderId) || parsedOrderId <= 0) {
    throw new AppError("Pedido invalido", 400);
  }

  const currentOrder = await asaasRepository.findFirstOrder({
    select: {
      id: true,
      pagamento: {
        select: {
          gateway: true,
          gateway_pagamento_id: true,
          id: true,
          status: true,
        },
      },
      status: true,
    },
    where: { id: parsedOrderId, usuario_id: userId },
  });

  if (!currentOrder) {
    throw new AppError("Pedido nao encontrado", 404);
  }

  if (
    currentOrder.status !== "AGUARDANDO_PAGAMENTO"
    || !["AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"].includes(currentOrder.pagamento?.status)
  ) {
    throw new AppError("Este pedido nao esta aguardando pagamento", 409);
  }

  if (
    currentOrder.pagamento.gateway !== "ASAAS"
  ) {
    throw new AppError("Pagamento Asaas nao disponivel para consulta", 409);
  }

  if (currentOrder.pagamento.status === "EM_RECONCILIACAO") {
    await reconcilePendingAsaasPayment(currentOrder.pagamento.id);
  }

  const orderAfterReconciliation = await asaasRepository.findUniqueOrder({
    include: orderInclude,
    where: { id: currentOrder.id },
  });
  const paymentAfterReconciliation = orderAfterReconciliation.pagamento;
  if (!paymentAfterReconciliation?.gateway_pagamento_id) {
    return {
      checkedAt: new Date().toISOString(),
      gatewayStatus: "RECONCILING",
      order: serializeOrder(orderAfterReconciliation),
      paymentConfirmed: false,
    };
  }

  const remotePayment = await getAsaasPaymentStatus(
    paymentAfterReconciliation.gateway_pagamento_id,
  );
  const gatewayStatus = String(remotePayment?.status ?? "UNKNOWN").toUpperCase();
  const event = eventForAsaasPaymentStatus(gatewayStatus);

  if (event) {
    await processAsaasWebhook({
      event,
      id: `manual:${paymentAfterReconciliation.gateway_pagamento_id}:${gatewayStatus}`,
      payment: {
        id: paymentAfterReconciliation.gateway_pagamento_id,
        status: gatewayStatus,
      },
    });
  }

  const order = await asaasRepository.findUniqueOrder({
    include: orderInclude,
    where: { id: currentOrder.id },
  });

  return {
    checkedAt: new Date().toISOString(),
    gatewayStatus,
    order: serializeOrder(order),
    paymentConfirmed: order.pagamento?.status === "PAGO",
  };
}
