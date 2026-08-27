import {
  emitOrderStatusUpdated,
  emitWalletUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { reverseCommercialSettlement } from "../earnings/order-earnings.service.js";
import { serializeOrder } from "../orders/orders.serializer.js";
import {
  refreshAsaasRefundPayment,
  requestAsaasPaymentRefund,
} from "../payments/asaas.service.js";
import {
  adminPaymentsRepository,
} from "./admin-payments.repository.js";

const refundableStatuses = ["PAGO", "LIQUIDADO"];
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

function serializePayment(payment) {
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
      refundableStatuses.includes(payment.status),
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
      descricao: `Estorno do pagamento ${payment.id}, autorizado pelo admin ${adminId}. ${reason}`,
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
    titulo,
  });

  return order;
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

  if (payment.gateway === "ASAAS") {
    await adminPaymentsRepository.assertSettlementReversible(payment.id);
    await requestAsaasPaymentRefund(payment.id, { reason });

    return {
      message: "Estorno Pix solicitado ao Asaas. Os ganhos serao revertidos quando o gateway confirmar a devolucao.",
      payment: serializePayment(await adminPaymentsRepository.findPayment(payment.id)),
    };
  }

  const result = await adminPaymentsRepository.transaction(async (repository, database) => {
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
