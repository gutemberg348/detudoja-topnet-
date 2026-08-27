import {
  emitOrderMessageCreated,
  emitOrderStatusUpdated,
  emitWalletUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { asaasRepository, createAsaasRepository } from "./asaas.repository.js";
import { reverseCommercialSettlement } from "../earnings/order-earnings.service.js";
import { assertPaymentMonthlyCpfLimit } from "../earnings/commercial-limit.service.js";
import { releaseReservedOrderStock } from "../orders/order-stock.service.js";
import { serializeOrder, serializeOrderMessage } from "../orders/orders.serializer.js";
import {
  createAsaasCustomer,
  createAsaasPixPayment,
  deleteAsaasPayment,
  getAsaasPaymentStatus,
  getAsaasPixQrCode,
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

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

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

async function ensureAsaasCustomer(userId) {
  const user = await asaasRepository.findUser({
    include: {
      enderecos: {
        orderBy: [{ principal: "desc" }, { atualizado_em: "desc" }],
        take: 1,
        where: { excluido_em: null },
      },
    },
    where: { id: userId },
  });

  if (!user?.cpf) {
    throw new AppError("Informe e valide seu CPF antes de usar o Pix", 409);
  }

  if (user.asaas_cliente_id) {
    return user.asaas_cliente_id;
  }

  const address = user.enderecos[0];
  const customer = await createAsaasCustomer({
    ...(address
      ? {
          address: address.rua,
          addressNumber: address.numero,
          complement: address.complemento || undefined,
          postalCode: onlyDigits(address.cep),
          province: address.bairro,
        }
      : {}),
    cpfCnpj: onlyDigits(user.cpf),
    email: user.email,
    externalReference: `DTJ:USER:${user.id}`,
    mobilePhone: onlyDigits(user.telefone),
    name: user.nome,
    notificationDisabled: true,
  });

  await asaasRepository.updateUser({
    data: { asaas_cliente_id: customer.id },
    where: { id: user.id },
  });

  return customer.id;
}

export function shouldUseAsaasPix({ pixComplementCents, walletUsedCents }) {
  return Number(pixComplementCents) > 0 && Number(walletUsedCents) === 0;
}

export async function createPendingAsaasPix({ description, paymentId, userId }) {
  const payment = await asaasRepository.findPayment({
    select: {
      gateway: true,
      id: true,
      status: true,
      usuario_pagador_id: true,
      valor_pago_pix_centavos: true,
    },
    where: { id: paymentId },
  });

  if (!payment || payment.usuario_pagador_id !== userId || payment.gateway !== "ASAAS") {
    throw new AppError("Pagamento externo nao encontrado", 404);
  }

  if (payment.status !== "AGUARDANDO_PAGAMENTO") {
    throw new AppError("Este pagamento nao esta aguardando Pix", 409);
  }

  const customerId = await ensureAsaasCustomer(userId);
  const remotePayment = await createAsaasPixPayment({
    billingType: "PIX",
    customer: customerId,
    description,
    dueDate: dueDate(),
    externalReference: `DTJ:PAYMENT:${payment.id}`,
    value: asaasValue(payment.valor_pago_pix_centavos),
  });
  const pix = await getAsaasPixQrCode(remotePayment.id);

  const updated = await asaasRepository.updatePayment({
    data: {
      copia_cola_pix: pix.payload ?? null,
      expira_em: pix.expirationDate ? new Date(pix.expirationDate) : null,
      gateway_pagamento_id: remotePayment.id,
      qr_code: pixQrDataUrl(pix.encodedImage),
    },
    where: { id: payment.id },
  });

  return {
    expiresAt: updated.expira_em?.toISOString() ?? null,
    gateway: "ASAAS",
    id: updated.id,
    pixCopyPaste: updated.copia_cola_pix,
    qrImageDataUrl: updated.qr_code,
    status: updated.status,
  };
}

export async function failPendingAsaasPayment(paymentId) {
  await asaasRepository.transaction(async (database) => {
    const repository = createAsaasRepository(database);
    const payment = await repository.findPayment({
      select: { id: true },
      where: { id: paymentId },
    });

    if (!payment) {
      return;
    }

    await repository.updatePayments({
      data: { status: "FALHOU" },
      where: { id: payment.id, status: "AGUARDANDO_PAGAMENTO" },
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
  });
}

function isPaymentConfirmed(event) {
  return event === "PAYMENT_RECEIVED";
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
    REFUNDED: "PAYMENT_REFUNDED",
  };

  return events[String(status ?? "").trim().toUpperCase()] ?? null;
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
    : ["PENDENTE", "AGUARDANDO_PAGAMENTO"];
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

  const order = await repository.findFirstOrder({
    include: orderInclude,
    where: { pagamento_id: paymentId },
  });

  if (!order) {
    return { message: null, order: null, reversal };
  }

  if (nextStatus === "PAGO") {
    const acceptedAt = new Date();
    await repository.updateProposals({
      data: { pago_em: acceptedAt, status: "PAGA" },
      where: {
        pedido_id: order.id,
        status: "ACEITA",
      },
    });
    const updatedOrder = await repository.updateOrder({
      data: { aceito_em: acceptedAt, status: "ACEITO" },
      include: orderInclude,
      where: { id: order.id },
    });
    const message = await repository.createOrderMessage({
      data: {
        mensagem: "Pix confirmado. A loja ja pode iniciar o preparo do pedido.",
        metadata_json: { gateway: "ASAAS", kind: "payment", status: "ACEITO" },
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
      description: `Estorno DeTudoJa do pagamento ${payment.id}: ${reason}`,
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

  if (!eventId || !event) {
    throw new AppError("Evento do Asaas invalido", 400);
  }

  const result = await asaasRepository.transaction(async (database) => {
    const repository = createAsaasRepository(database);
    const payment = remotePaymentId
      ? await repository.findFirstPayment({
          select: { id: true },
          where: { gateway: "ASAAS", gateway_pagamento_id: remotePaymentId },
        })
      : null;

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

    const settled = payment ? await settleAsaasPayment(database, payment.id, event) : null;

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

  return { duplicate: Boolean(result.duplicate), processed: true };
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
    || currentOrder.pagamento?.status !== "AGUARDANDO_PAGAMENTO"
  ) {
    throw new AppError("Este pedido nao esta aguardando pagamento", 409);
  }

  if (
    currentOrder.pagamento.gateway !== "ASAAS"
    || !currentOrder.pagamento.gateway_pagamento_id
  ) {
    throw new AppError("Pagamento Asaas nao disponivel para consulta", 409);
  }

  const remotePayment = await getAsaasPaymentStatus(
    currentOrder.pagamento.gateway_pagamento_id,
  );
  const gatewayStatus = String(remotePayment?.status ?? "UNKNOWN").toUpperCase();
  const event = eventForAsaasPaymentStatus(gatewayStatus);

  if (event) {
    await processAsaasWebhook({
      event,
      id: `manual:${currentOrder.pagamento.gateway_pagamento_id}:${gatewayStatus}`,
      payment: {
        id: currentOrder.pagamento.gateway_pagamento_id,
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
