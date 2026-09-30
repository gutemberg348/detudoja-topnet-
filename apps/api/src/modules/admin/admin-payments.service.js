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
  processVerifiedPaymentEvent,
  cancelPendingAsaasOrderPayment,
} from "../payments/asaas.service.js";
import { gatewayAvailability, selectPaymentGateway } from "../payments/payment-gateway.js";
import { assertSandboxApproval, sandboxApprovalEnabled } from "../payments/sandbox-approval.js";
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
  "EM_RECONCILIACAO",
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
    gatewayEnvironment: payment.gateway_ambiente,
    sandboxSimulated: Boolean(payment.gateway_dados_json?.sandboxManualApproval),
    sandboxApprovable: sandboxApprovalEnabled() && payment.gateway_ambiente === "sandbox"
      && ["ASAAS", "SICREDI"].includes(payment.gateway) && Number(payment.valor_pago_pix_centavos) > 0
      && ["AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"].includes(payment.status),
    sandboxRefundable: sandboxApprovalEnabled() && payment.gateway_ambiente === "sandbox"
      && Boolean(payment.gateway_dados_json?.sandboxManualApproval) && payment.status === "EM_DISPUTA",
    archivedAt: asIso(payment.arquivado_admin_em),
    cancelable: Boolean(payment.pedido_loja
      && payment.pedido_loja.status === "AGUARDANDO_PAGAMENTO"
      && payment.status === "AGUARDANDO_PAGAMENTO"
      && payment.gateway_pagamento_id
      && ["ASAAS", "SICREDI"].includes(payment.gateway)),
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
    refundDestination: ["ASAAS", "SICREDI"].includes(payment.gateway) ? "PIX_ORIGEM" : "CARTEIRAS_ORIGEM",
    settlementStatus: payment.transacao_comercial?.status ?? null,
    status: payment.status,
    store: payment.loja ? { id: payment.loja.id, name: payment.loja.nome } : null,
    totalCents: cents(payment.valor_total_centavos),
    walletCents: cents(payment.valor_pago_saldo_centavos),
  };
}

const asIso = (value) => value?.toISOString() ?? null;

export async function getAdminPaymentDetails(paymentId) {
  const id = parsePositiveId(paymentId, "Pagamento invalido");
  const payment = await adminPaymentsRepository.findPaymentDetails(id);
  if (!payment) throw new AppError("Pagamento nao encontrado", 404);
  const settlement = payment.transacao_comercial;
  const [walletEntries, audits] = await Promise.all([
    adminPaymentsRepository.findWalletEntriesForTransaction(settlement?.id),
    adminPaymentsRepository.findPaymentAudits(id),
  ]);
  return {
    payment: {
      ...serializePayment(payment),
      gatewayPaymentId: payment.gateway_pagamento_id,
      expiresAt: asIso(payment.expira_em),
      canceledAt: asIso(payment.cancelado_em),
      refundedAt: asIso(payment.estornado_em),
      cardCents: cents(payment.valor_pago_cartao_centavos),
    },
    recipient: payment.deposito_carteira ? payment.usuario_pagador
      : payment.loja?.lojista?.usuario ?? payment.vendedor?.usuario ?? null,
    items: payment.itens.map((item) => ({
      id: item.id, name: item.nome_item, quantity: item.quantidade,
      unitCents: cents(item.valor_unitario_centavos), totalCents: cents(item.valor_total_centavos),
    })),
    sources: payment.composicoes.map((item) => ({
      id: item.id, type: item.tipo_origem, walletType: item.carteira?.tipo_carteira?.nome ?? null,
      amountCents: cents(item.valor_centavos), status: item.status,
    })),
    deposit: payment.deposito_carteira ? {
      status: payment.deposito_carteira.status,
      walletType: payment.deposito_carteira.carteira?.tipo_carteira?.nome ?? null,
      creditedCents: cents(payment.deposito_carteira.valor_liquido_centavos),
      creditedAt: asIso(payment.deposito_carteira.creditado_em),
      feeCents: cents(payment.deposito_carteira.taxa_processamento_centavos),
    } : null,
    settlement: settlement ? {
      id: settlement.id, status: settlement.status,
      validatedAt: asIso(settlement.validada_em), settledAt: asIso(settlement.liquidada_em),
      grossCents: cents(settlement.valor_bruto_centavos),
      platformFeeCents: cents(settlement.taxa_plataforma_centavos),
      processingFeeCents: cents(settlement.taxa_processamento_centavos),
      cashbackCents: cents(settlement.cashback_prioritario_centavos),
      sellerNetCents: cents(settlement.valor_liquido_lojista_centavos),
      rewardsPoolCents: cents(settlement.valor_pool_recompensas_centavos),
      companyCents: cents(settlement.valor_empresa_centavos),
      commissionBaseCents: cents(settlement.base_comissao_centavos),
      deliveryCents: cents(settlement.valor_entrega_lojista_centavos),
      feePercent: Number(settlement.percentual_taxa_plataforma ?? 0),
      receivables: settlement.recebiveis.map((item) => ({
        id: item.id, type: item.tipo_recebedor, status: item.status,
        grossCents: cents(item.valor_bruto_centavos), netCents: cents(item.valor_liquido_centavos),
        availableAt: asIso(item.disponivel_em), paidAt: asIso(item.pago_em),
        blockedAt: asIso(item.bloqueado_em), blockReason: item.motivo_bloqueio,
        recipient: item.usuario_recebedor,
      })),
      rewards: settlement.recompensas.map((item) => ({
        id: item.id, type: item.tipo_recompensa, status: item.status,
        amountCents: cents(item.valor_centavos), recipient: item.usuario_beneficiado,
        releasedAt: asIso(item.liberado_em), reversedAt: asIso(item.estornado_em),
        description: item.motivo, createdAt: asIso(item.criado_em),
      })),
      platformEntries: settlement.lancamentos_plataforma.map((item) => ({
        id: item.id, account: item.conta_plataforma?.nome, accountType: item.conta_plataforma?.tipo_conta,
        type: item.tipo_lancamento, status: item.status, amountCents: cents(item.valor_centavos),
        description: item.descricao, at: asIso(item.criado_em),
      })),
      transfer: settlement.repasse_pix ? {
        id: settlement.repasse_pix.id, gateway: settlement.repasse_pix.gateway,
        status: settlement.repasse_pix.status, amountCents: cents(settlement.repasse_pix.valor_centavos),
        requestedAt: asIso(settlement.repasse_pix.solicitado_em), paidAt: asIso(settlement.repasse_pix.pago_em),
        failureReason: settlement.repasse_pix.motivo_falha,
      } : null,
    } : null,
    events: payment.eventos_financeiros.map((item) => ({
      id: item.id, type: item.tipo_evento, description: item.descricao, at: asIso(item.criado_em),
    })),
    gatewayEvents: (payment.eventos_gateway ?? []).map((item) => ({
      id: item.id, type: item.tipo_evento, at: asIso(item.criado_em), processedAt: asIso(item.processado_em),
    })),
    adminEvents: audits.map((item) => ({
      id: item.id, type: item.acao, at: asIso(item.criado_em), actor: item.administrador,
      reason: typeof item.dados_json?.reason === "string" ? item.dados_json.reason : null,
      event: typeof item.dados_json?.event === "string" ? item.dados_json.event : null,
    })),
    walletEntries: walletEntries.map((item) => ({
      id: item.id, origin: item.origem, type: item.tipo_lancamento, status: item.status,
      amountCents: cents(item.valor_centavos), recipient: item.usuario,
      walletType: item.carteira?.tipo_carteira?.nome ?? null,
      description: item.descricao, at: asIso(item.criado_em),
      releasedAt: asIso(item.liberado_em), reversedAt: asIso(item.estornado_em),
    })),
  };
}

export async function cancelAdminPendingPayment(adminId, paymentId, { reason }) {
  const id = parsePositiveId(paymentId, "Pagamento invalido");
  const payment = await adminPaymentsRepository.findPayment(id);
  if (!payment) throw new AppError("Pagamento nao encontrado", 404);
  if (!payment.pedido_loja || payment.pedido_loja.status !== "AGUARDANDO_PAGAMENTO"
    || payment.status !== "AGUARDANDO_PAGAMENTO" || !payment.gateway_pagamento_id
    || !["ASAAS", "SICREDI"].includes(payment.gateway)) {
    throw new AppError("Somente cobranca Pix de pedido ainda nao pago pode ser cancelada aqui", 409);
  }
  await cancelPendingAsaasOrderPayment(payment.pedido_loja.usuario_id, payment.pedido_loja.id);
  const updated = await adminPaymentsRepository.findPayment(id);
  if (updated.status !== "CANCELADO") {
    throw new AppError("A cobranca mudou durante o cancelamento; consulte o gateway e revise o pedido", 409);
  }
  await adminPaymentsRepository.createAudit({
    administrador_id: adminId, usuario_alvo_id: payment.usuario_pagador_id,
    acao: "PAGAMENTO_CANCELADO_ADMIN",
    dados_json: { paymentId: id, orderId: payment.pedido_loja.id, reason },
  });
  return { payment: serializePayment(updated) };
}

export async function archiveAdminPayment(adminId, paymentId, { archived, reason }) {
  const id = parsePositiveId(paymentId, "Pagamento invalido");
  const payment = await adminPaymentsRepository.findPayment(id);
  if (!payment) throw new AppError("Pagamento nao encontrado", 404);
  if (!["CANCELADO", "ESTORNADO", "FALHOU"].includes(payment.status)) {
    throw new AppError("So e possivel arquivar transacoes encerradas", 409);
  }
  const updated = await adminPaymentsRepository.transaction(async (repository) => {
    const claim = await repository.updatePaymentArchive(id, archived);
    if (claim.count !== 1) throw new AppError("Estado do pagamento mudou; atualize a lista", 409);
    await repository.createAudit({
      administrador_id: adminId,
      usuario_alvo_id: payment.usuario_pagador_id,
      acao: archived ? "PAGAMENTO_ARQUIVADO_ADMIN" : "PAGAMENTO_RESTAURADO_ADMIN",
      dados_json: { paymentId: id, reason },
    });
    return repository.findPayment(id);
  });
  return { payment: serializePayment(updated) };
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
    arquivado_admin_em: String(query.archived ?? "false") === "true" ? { not: null } : null,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            ...(/^#?\d+$/.test(search) && Number(search.replace("#", "")) <= 2147483647
              ? [{ id: Number(search.replace("#", "")) }] : []),
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
    sandboxApprovalEnabled: sandboxApprovalEnabled(),
    receiveGateway: (() => { try { return selectPaymentGateway("receive"); } catch { return null; } })(),
    sicrediReceiveAvailable: gatewayAvailability("receive").SICREDI,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    payments: payments.map(serializePayment),
  };
}

export async function approveAdminSandboxPayment(adminId, paymentId, { reason, action }) {
  const id = parsePositiveId(paymentId, "Pagamento invalido");
  const payment = await adminPaymentsRepository.findPayment(id);
  const event = action === "refund" ? "PAYMENT_REFUNDED" : "PAYMENT_RECEIVED";
  assertSandboxApproval(payment, event);
  await processVerifiedPaymentEvent({
    id: `sandbox-manual:${payment.gateway}:${id}:${event}`,
    event,
    simulation: { manual: true, adminId, reason },
    payment: { id: payment.gateway_pagamento_id, externalReference: `DTJ:PAYMENT:${id}` },
  }, payment.gateway, { sandboxApproval: { adminId, reason } });
  return { payment: serializePayment(await adminPaymentsRepository.findPayment(id)), simulated: true };
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
      : ["ASAAS", "SICREDI"].includes(payment.gateway)
        ? "Cancelamento confirmado. Solicitamos ao banco o estorno para a conta Pix de origem. A confirmacao aparecera aqui quando o gateway concluir."
        : "Cancelamento confirmado. O valor voltou para as carteiras usadas no pagamento.",
    metadata_json: {
      kind: "customer-refund",
      paymentId: payment.id,
      refundDestination: destination,
      status: toBalance || !["ASAAS", "SICREDI"].includes(payment.gateway) ? "ESTORNADO" : "EM_DISPUTA",
    },
    origem: "SISTEMA",
    pedido_id: payment.pedido_loja.id,
    titulo: toBalance || !["ASAAS", "SICREDI"].includes(payment.gateway)
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

  if (normalizedDestination === "ORIGINAL" && ["ASAAS", "SICREDI"].includes(payment.gateway)) {
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

  if (["ASAAS", "SICREDI"].includes(payment.gateway)) {
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

  if (["ASAAS", "SICREDI"].includes(payment.gateway)) {
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

  if (["ASAAS", "SICREDI"].includes(payment.gateway)) {
    await adminPaymentsRepository.assertSettlementReversible(payment.id);
    await requestAsaasPaymentRefund(payment.id, { reason });

    return {
      message: payment.gateway_dados_json?.sandboxManualApproval
        ? "Estorno de teste solicitado. Confirme a simulacao no admin para reverter os ganhos. Nenhuma devolucao foi enviada ao banco."
        : "Estorno Pix solicitado ao banco. Os ganhos serao revertidos quando o gateway confirmar a devolucao.",
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
      ? "Estorno confirmado pelo banco"
      : "O banco ainda esta processando o estorno",
    payment: serializePayment(payment),
  };
}
