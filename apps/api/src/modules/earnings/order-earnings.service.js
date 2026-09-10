import { AppError } from "../../utils/errors.js";
import { isQualifiedForNetwork, networkQualificationInclude } from "../network/network.qualification.js";
import { creditUserWallet } from "../wallet/wallet.service.js";
import {
  calculatePaymentPolicyAllocation,
  getOrderEarningsDistribution,
  getPaymentPolicy,
  getSegmentCommissionDistribution,
  resolvePaymentPolicy,
} from "./order-earnings.config.js";
import { createOrderEarningsRepository } from "./order-earnings.repository.js";

const validIndicationStatuses = ["ATIVA", "CONVERTIDA", "PENDENTE"];
export const EARNINGS_HOLD_MS = 24 * 60 * 60 * 1000;

export function shouldHoldServiceEarnings({ conversation = null, paymentMode = null } = {}) {
  if (
    conversation?.id
    || conversation?.loja_solicitante_id
    || conversation?.servico_vendedor
    || conversation?.servico_vendedor_id
  ) {
    return true;
  }

  const isCourierDelivery = Boolean(
    conversation?.loja_solicitante_id
    || conversation?.servico_vendedor?.tipo_servico?.tipo_operacao === "ENTREGA_LOCAL",
  );

  return isCourierDelivery || paymentMode === "ONLINE";
}

function earningsAvailableAt(from = new Date()) {
  return new Date(from.getTime() + EARNINGS_HOLD_MS);
}

function cents(value) {
  return Number(value ?? 0);
}

function percentageOf(valueCents, percent) {
  return Math.round((valueCents * Number(percent ?? 0)) / 100);
}

function percentageFrom(valueCents, totalCents) {
  if (!totalCents) {
    return 0;
  }

  return Math.round((valueCents / totalCents) * 1000000) / 10000;
}

function commissionShareOfFee(feeCents, feePercent, commissionPercent) {
  if (feeCents <= 0 || Number(feePercent) <= 0 || Number(commissionPercent) <= 0) {
    return 0;
  }

  return Math.floor((feeCents * Number(commissionPercent)) / Number(feePercent));
}

function calculateCommissionAmounts({
  commission,
  consumerSponsor,
  feeCents,
  sellerSponsor,
}) {
  const values = {
    cashbackCents: commissionShareOfFee(
      feeCents,
      commission.feePercent,
      commission.cashbackPercent,
    ),
    consumerReferralCents: consumerSponsor
      ? commissionShareOfFee(
          feeCents,
          commission.feePercent,
          commission.consumerReferralPercent,
        )
      : 0,
    networkPoolCents: commissionShareOfFee(
      feeCents,
      commission.feePercent,
      commission.networkPercent,
    ),
    sellerReferralCents: sellerSponsor
      ? commissionShareOfFee(
          feeCents,
          commission.feePercent,
          commission.sellerReferralPercent,
        )
      : 0,
  };

  // Dados antigos podem ter configuracoes acima da taxa. Nunca distribuir mais
  // que a retencao efetiva da venda.
  let overflow = Math.max(
    Object.values(values).reduce((total, value) => total + value, 0) - feeCents,
    0,
  );

  for (const key of [
    "networkPoolCents",
    "sellerReferralCents",
    "consumerReferralCents",
    "cashbackCents",
  ]) {
    if (overflow <= 0) {
      break;
    }

    const reduction = Math.min(values[key], overflow);
    values[key] -= reduction;
    overflow -= reduction;
  }

  return values;
}

export async function getStoreCommissionDistribution(database, store) {
  const globalDistribution = await getOrderEarningsDistribution(database);
  const segment = store.segmento_venda ?? store.categoria?.segmento_venda ?? null;
  const customFeePercent = store.taxa_plataforma_personalizada_percentual;
  const feePercentOverride =
    customFeePercent != null
      ? Number(customFeePercent)
      : segment
        ? null
        : Number(store.categoria?.taxa_plataforma_percentual ?? 0);

  return {
    commission: getSegmentCommissionDistribution(segment, globalDistribution, {
      feePercentOverride,
    }),
    source: segment ? "SEGMENTO" : "CATEGORIA_LEGADA",
  };
}

function distributeEvenly(valueCents, userIds) {
  if (!valueCents || userIds.length === 0) {
    return [];
  }

  const baseCents = Math.floor(valueCents / userIds.length);
  let remainderCents = valueCents % userIds.length;

  return userIds.map((userId) => {
    const receivesRemainder = remainderCents > 0;
    const value = baseCents + (receivesRemainder ? 1 : 0);

    if (receivesRemainder) {
      remainderCents -= 1;
    }

    return { userId, valueCents: value };
  }).filter((award) => award.valueCents > 0);
}

async function findDirectSponsor(database, userId) {
  const indication = await createOrderEarningsRepository(database).findIndication({
    include: {
      indicador: {
        select: {
          id: true,
          status: true,
        },
      },
    },
    where: { indicado_usuario_id: userId },
  });

  if (
    !indication ||
    !validIndicationStatuses.includes(indication.status) ||
    indication.indicador.status !== "ATIVO" ||
    indication.indicador.id === userId
  ) {
    return null;
  }

  return {
    indicationId: indication.id,
    sponsorUserId: indication.indicador_usuario_id,
  };
}

async function findQualifiedMatrixUplines(database, sellerUserId) {
  const qualifiedUserIds = [];
  const visited = new Set([sellerUserId]);
  let currentUserId = sellerUserId;

  for (let depth = 0; depth < 20; depth += 1) {
    const position = await createOrderEarningsRepository(database).findIndication({
      select: { alocado_sob_usuario_id: true },
      where: { indicado_usuario_id: currentUserId },
    });
    const parentUserId = position?.alocado_sob_usuario_id;

    if (!parentUserId || visited.has(parentUserId)) {
      break;
    }

    visited.add(parentUserId);
    currentUserId = parentUserId;

    const parentUser = await createOrderEarningsRepository(database).findUser({
      include: networkQualificationInclude,
      where: { id: parentUserId },
    });

    if (isQualifiedForNetwork(parentUser)) {
      qualifiedUserIds.push(parentUserId);
    }
  }

  return qualifiedUserIds;
}

async function creditReward(database, {
  availableAt = earningsAvailableAt(),
  description,
  origin,
  rewardType,
  transactionId,
  userId,
  valueCents,
  walletCode,
}) {
  if (valueCents <= 0) {
    return null;
  }

  const reward = await createOrderEarningsRepository(database).createReward({
    data: {
      liberado_em: null,
      motivo: description,
      percentual: null,
      status: "PENDENTE",
      tipo_recompensa: rewardType,
      transacao_comercial_id: transactionId,
      usuario_beneficiado_id: userId,
      valor_centavos: BigInt(valueCents),
    },
  });

  await creditUserWallet({
    availableAt,
    database,
    description,
    origin,
    originId: transactionId,
    userId,
    valueCents,
    walletCode,
  });

  return reward;
}

async function creditCompanyRevenue(database, transactionId, valueCents) {
  if (valueCents <= 0) {
    return null;
  }

  const account = await createOrderEarningsRepository(database).upsertPlatformAccount({
    create: {
      nome: "Receita da empresa",
      status: "ATIVA",
      tipo_conta: "RECEITA_EMPRESA",
    },
    update: { status: "ATIVA" },
    where: { tipo_conta: "RECEITA_EMPRESA" },
  });

  return createOrderEarningsRepository(database).createPlatformEntry({
    data: {
      conta_plataforma_id: account.id,
      descricao: "Receita retida da taxa da venda concluida.",
      status: "PENDENTE",
      tipo_lancamento: "CREDITO",
      transacao_comercial_id: transactionId,
      valor_centavos: BigInt(valueCents),
    },
  });
}

async function creditProcessingReserve(database, transactionId, valueCents) {
  if (valueCents <= 0) {
    return null;
  }

  const account = await createOrderEarningsRepository(database).upsertPlatformAccount({
    create: {
      nome: "Taxas de processamento",
      status: "ATIVA",
      tipo_conta: "TAXAS_PAGAMENTO",
    },
    update: { status: "ATIVA" },
    where: { tipo_conta: "TAXAS_PAGAMENTO" },
  });

  return createOrderEarningsRepository(database).createPlatformEntry({
    data: {
      conta_plataforma_id: account.id,
      descricao: "Valor reservado para o custo de processamento do pagamento.",
      status: "PENDENTE",
      tipo_lancamento: "CREDITO",
      transacao_comercial_id: transactionId,
      valor_centavos: BigInt(valueCents),
    },
  });
}

const reversibleWalletOrigins = [
  "VENDA",
  "CASHBACK",
  "BONUS_INDICACAO",
  "BONUS_VENDEDOR",
  "BONUS_REDE",
];

async function debitSettlementWalletCredit(database, credit, { paymentId, reason }) {
  const amount = cents(credit.valor_centavos);
  const pending = credit.status === "PENDENTE";
  const claimed = await createOrderEarningsRepository(database).updateWallets({
    data: pending
      ? { saldo_pendente_centavos: { decrement: BigInt(amount) } }
      : { saldo_disponivel_centavos: { decrement: BigInt(amount) } },
    where: {
      id: credit.carteira_id,
      ...(pending
        ? { saldo_pendente_centavos: { gte: BigInt(amount) } }
        : { saldo_disponivel_centavos: { gte: BigInt(amount) } }),
    },
  });

  if (claimed.count !== 1) {
    throw new AppError(
      "Um dos ganhos desta venda ja foi usado. O estorno precisa de revisao financeira para nao criar saldo sem lastro.",
      409,
    );
  }

  const wallet = await createOrderEarningsRepository(database).findWallet({
    select: { saldo_disponivel_centavos: true },
    where: { id: credit.carteira_id },
  });
  const balanceAfter = cents(wallet.saldo_disponivel_centavos);

  await createOrderEarningsRepository(database).updateWalletEntry({
    data: { estornado_em: new Date(), status: "ESTORNADO" },
    where: { id: credit.id },
  });

  await createOrderEarningsRepository(database).createWalletEntry({
    data: {
      carteira_id: credit.carteira_id,
      descricao: `Estorno do pagamento ${paymentId}. ${reason}`,
      origem: "ESTORNO",
      origem_id: credit.origem_id,
      saldo_anterior_centavos: BigInt(pending ? balanceAfter : balanceAfter + amount),
      saldo_posterior_centavos: BigInt(balanceAfter),
      status: "PROCESSADO",
      tipo_lancamento: "DEBITO",
      usuario_id: credit.usuario_id,
      valor_centavos: BigInt(amount),
    },
  });
}

export async function assertCommercialSettlementReversible(
  database,
  paymentId,
  { now = new Date() } = {},
) {
  const transaction = await createOrderEarningsRepository(database).findCommercialTransaction({
    where: { pagamento_id: paymentId },
  });

  if (!transaction || ["PENDENTE", "PAGA"].includes(transaction.status)) {
    return { transactionId: transaction?.id ?? null, reversible: true };
  }

  const deadline = transaction.validada_em
    ? earningsAvailableAt(transaction.validada_em)
    : null;

  if (transaction.status !== "VALIDADA" || !deadline || now.getTime() >= deadline.getTime()) {
    throw new AppError(
      "O prazo automatico de estorno de 24 horas terminou. Encaminhe o caso para revisao financeira.",
      409,
    );
  }

  return { deadline, transactionId: transaction.id, reversible: true };
}

export async function reverseCommercialSettlement(database, paymentId, { reason }) {
  const transaction = await createOrderEarningsRepository(database).findCommercialTransaction({
    include: {
      lancamentos_plataforma: {
        where: { status: { in: ["PENDENTE", "PROCESSADO"] }, tipo_lancamento: "CREDITO" },
      },
    },
    where: { pagamento_id: paymentId },
  });

  if (!transaction || ["PENDENTE", "PAGA", "CANCELADA"].includes(transaction.status)) {
    return { alreadyReversed: false, transactionId: transaction?.id ?? null, walletUserIds: [] };
  }

  if (transaction.status === "ESTORNADA") {
    return { alreadyReversed: true, transactionId: transaction.id, walletUserIds: [] };
  }

  const claimed = await createOrderEarningsRepository(database).updateCommercialTransactions({
    data: { estornada_em: new Date(), status: "ESTORNADA" },
    where: { id: transaction.id, status: { in: ["VALIDADA", "LIQUIDADA"] } },
  });

  if (claimed.count !== 1) {
    throw new AppError("A distribuicao financeira desta venda mudou durante o estorno", 409);
  }

  const walletCredits = await createOrderEarningsRepository(database).findWalletEntries({
    where: {
      origem: { in: reversibleWalletOrigins },
      origem_id: transaction.id,
      status: { in: ["PENDENTE", "PROCESSADO"] },
      tipo_lancamento: "CREDITO",
    },
  });

  for (const credit of walletCredits) {
    await debitSettlementWalletCredit(database, credit, { paymentId, reason });
  }

  for (const entry of transaction.lancamentos_plataforma) {
    const amount = cents(entry.valor_centavos);
    const pending = entry.status === "PENDENTE";
    const claimedPlatformBalance = pending
      ? { count: 1 }
      : await createOrderEarningsRepository(database).updatePlatformAccounts({
          data: { saldo_centavos: { decrement: BigInt(amount) } },
          where: {
            id: entry.conta_plataforma_id,
            saldo_centavos: { gte: BigInt(amount) },
          },
        });

    if (claimedPlatformBalance.count !== 1) {
      throw new AppError(
        "A receita da plataforma desta venda ja foi movimentada. Encaminhe para revisao financeira.",
        409,
      );
    }

    await createOrderEarningsRepository(database).updatePlatformEntries({
      data: { status: "ESTORNADO" },
      where: { id: entry.id, status: entry.status },
    });

    if (!pending) {
      await createOrderEarningsRepository(database).createPlatformEntry({
        data: {
          conta_plataforma_id: entry.conta_plataforma_id,
          descricao: `Estorno do pagamento ${paymentId}. ${reason}`,
          status: "PROCESSADO",
          tipo_lancamento: "ESTORNO",
          transacao_comercial_id: transaction.id,
          valor_centavos: BigInt(amount),
        },
      });
    }
  }

  await Promise.all([
    createOrderEarningsRepository(database).updateRewards({
      data: { estornado_em: new Date(), status: "ESTORNADA" },
      where: {
        status: { in: ["PENDENTE", "LIBERADA", "BLOQUEADA"] },
        transacao_comercial_id: transaction.id,
      },
    }),
    createOrderEarningsRepository(database).updateReceivables({
      data: {
        bloqueado_em: new Date(),
        motivo_bloqueio: `Estorno do pagamento ${paymentId}. ${reason}`,
        status: "ESTORNADO",
      },
      where: { status: { not: "ESTORNADO" }, transacao_comercial_id: transaction.id },
    }),
    createOrderEarningsRepository(database).createFinancialEvent({
      data: {
        dados_json: {
          paymentId,
          reversedPlatformEntries: transaction.lancamentos_plataforma.length,
          reversedWalletCredits: walletCredits.length,
        },
        descricao: `Ganhos revertidos no estorno do pagamento ${paymentId}. ${reason}`,
        pagamento_id: paymentId,
        tipo_evento: "ESTORNO_REALIZADO",
        transacao_comercial_id: transaction.id,
      },
    }),
  ]);

  return {
    alreadyReversed: false,
    transactionId: transaction.id,
    walletUserIds: [...new Set(walletCredits.map((credit) => credit.usuario_id))],
  };
}

export async function settleCompletedStoreOrderEarnings(database, orderId) {
  const order = await createOrderEarningsRepository(database).findOrder({
    include: {
      loja: {
        include: {
          categoria: { include: { segmento_venda: true } },
          segmento_venda: true,
          lojista: { select: { id: true, usuario_id: true } },
        },
      },
      pagamento: { select: { id: true, status: true } },
    },
    where: { id: orderId },
  });

  if (!order) {
    throw new AppError("Pedido nao encontrado para distribuir ganhos", 404);
  }

  if (order.status !== "CONCLUIDO") {
    throw new AppError("Ganhos so podem ser distribuidos em pedido concluido", 409);
  }

  if (!['PAGO', 'LIQUIDADO'].includes(order.pagamento.status)) {
    throw new AppError("Pagamento precisa estar confirmado para distribuir ganhos", 409);
  }

  const existingTransaction = await createOrderEarningsRepository(database).findCommercialTransaction({
    where: { pagamento_id: order.pagamento_id },
  });

  if (existingTransaction?.status === "LIQUIDADA") {
    return { alreadySettled: true, transactionId: existingTransaction.id };
  }

  const commissionBaseCents = cents(order.subtotal_centavos);
  const deliveryCents = cents(order.taxa_entrega_centavos);
  const merchantGrossCents = commissionBaseCents + deliveryCents;
  const storeCommission = await getStoreCommissionDistribution(database, order.loja);
  const paymentPolicy = await getPaymentPolicy(database);
  const feePercent = storeCommission.commission.feePercent;
  const feeCents = percentageOf(commissionBaseCents, feePercent);
  const policyAllocation = calculatePaymentPolicyAllocation({
    channel: "ONLINE",
    commissionCents: feeCents,
    onlineServiceFeeCents: cents(order.taxa_servico_centavos),
    policy: paymentPolicy,
  });
  const merchantNetCents = merchantGrossCents - feeCents;
  const transaction = await createOrderEarningsRepository(database).upsertCommercialTransaction({
    create: {
      comprador_usuario_id: order.usuario_id,
      base_comissao_centavos: BigInt(commissionBaseCents),
      loja_id: order.loja_id,
      lojista_id: order.loja.lojista_id,
      pagamento_id: order.pagamento_id,
      percentual_empresa: 0,
      percentual_pool: 0,
      percentual_taxa_plataforma: feePercent,
      status: "PENDENTE",
      valor_bruto_centavos: BigInt(merchantGrossCents),
      valor_entrega_lojista_centavos: BigInt(deliveryCents),
      valor_empresa_centavos: 0,
      valor_liquido_lojista_centavos: BigInt(merchantNetCents),
      valor_pool_recompensas_centavos: 0,
      taxa_plataforma_centavos: BigInt(feeCents),
      taxa_processamento_centavos: BigInt(policyAllocation.processingFeeCents),
      cashback_prioritario_centavos: 0,
    },
    update: {},
    where: { pagamento_id: order.pagamento_id },
  });
  const settlementAt = new Date();
  const availableAt = earningsAvailableAt(settlementAt);
  const claim = await createOrderEarningsRepository(database).updateCommercialTransactions({
    data: {
      status: "VALIDADA",
      validada_em: settlementAt,
    },
    where: {
      id: transaction.id,
      status: "PENDENTE",
    },
  });

  if (claim.count === 0) {
    return { alreadySettled: true, transactionId: transaction.id };
  }

  const [consumerSponsor, sellerSponsor, networkUplines] = await Promise.all([
    findDirectSponsor(database, order.usuario_id),
    findDirectSponsor(database, order.loja.lojista.usuario_id),
    findQualifiedMatrixUplines(database, order.loja.lojista.usuario_id),
  ]);
  const {
    cashbackCents,
    consumerReferralCents,
    networkPoolCents,
    sellerReferralCents,
  } = calculateCommissionAmounts({
    commission: storeCommission.commission,
    consumerSponsor,
    feeCents: policyAllocation.distributablePoolCents,
    sellerSponsor,
  });
  const networkAwards = distributeEvenly(networkPoolCents, networkUplines);
  const networkCents = networkAwards.reduce((total, award) => total + award.valueCents, 0);
  const rewardsPoolCents =
    cashbackCents + consumerReferralCents + sellerReferralCents + networkCents;
  const companyCents = policyAllocation.distributablePoolCents - rewardsPoolCents;

  await createOrderEarningsRepository(database).createReceivable({
    data: {
      disponivel_em: availableAt,
      loja_id: order.loja_id,
      status: "PENDENTE",
      taxa_plataforma_centavos: BigInt(feeCents),
      tipo_recebedor: "LOJISTA",
      transacao_comercial_id: transaction.id,
      usuario_recebedor_id: order.loja.lojista.usuario_id,
      valor_bruto_centavos: BigInt(merchantGrossCents),
      valor_liquido_centavos: BigInt(merchantNetCents),
    },
  });

  await creditUserWallet({
    availableAt,
    database,
    description: `Venda concluida do pedido ${order.codigo}.`,
    origin: "VENDA",
    originId: transaction.id,
    userId: order.loja.lojista.usuario_id,
    valueCents: merchantNetCents,
    walletCode: "vendas",
  });

  await creditReward(database, {
    description: `Cashback do pedido ${order.codigo}.`,
    origin: "CASHBACK",
    rewardType: "CASHBACK_COMPRADOR",
    transactionId: transaction.id,
    userId: order.usuario_id,
    valueCents: cashbackCents,
    walletCode: "cashback",
  });

  if (consumerSponsor) {
    await creditReward(database, {
      description: `Indicacao direta de consumidor no pedido ${order.codigo}.`,
      origin: "BONUS_INDICACAO",
      rewardType: "BONUS_INDICACAO_CONSUMIDOR",
      transactionId: transaction.id,
      userId: consumerSponsor.sponsorUserId,
      valueCents: consumerReferralCents,
      walletCode: "cashback",
    });
  }

  if (sellerSponsor) {
    await creditReward(database, {
      description: `Indicacao direta do vendedor no pedido ${order.codigo}.`,
      origin: "BONUS_VENDEDOR",
      rewardType: "BONUS_VENDEDOR",
      transactionId: transaction.id,
      userId: sellerSponsor.sponsorUserId,
      valueCents: sellerReferralCents,
      walletCode: "vendas",
    });
  }

  for (const award of networkAwards) {
    await creditReward(database, {
      description: `Bonus de rede do pedido ${order.codigo}.`,
      origin: "BONUS_REDE",
      rewardType: "BONUS_REDE",
      transactionId: transaction.id,
      userId: award.userId,
      valueCents: award.valueCents,
      walletCode: "rede",
    });
  }

  await creditProcessingReserve(
    database,
    transaction.id,
    policyAllocation.processingFeeCents,
  );
  await creditCompanyRevenue(database, transaction.id, companyCents);

  await createOrderEarningsRepository(database).updateCommercialTransaction({
    data: {
      percentual_empresa: percentageFrom(companyCents, commissionBaseCents),
      percentual_pool: percentageFrom(rewardsPoolCents, commissionBaseCents),
      status: "VALIDADA",
      valor_empresa_centavos: BigInt(companyCents),
      valor_pool_recompensas_centavos: BigInt(rewardsPoolCents),
    },
    where: { id: transaction.id },
  });

  await createOrderEarningsRepository(database).createFinancialEvent({
    data: {
      dados_json: {
        cashbackCents,
        companyCents,
        commissionBaseCents,
        commissionSource: storeCommission.source,
        consumerReferralCents,
        deliveryCents,
        effectiveFeePercent: feePercent,
        feeCents,
        merchantGrossCents,
        networkCents,
        networkRecipients: networkAwards.length,
        processingFeeCents: policyAllocation.processingFeeCents,
        priorityCashbackCents: 0,
        distributablePoolCents: policyAllocation.distributablePoolCents,
        sellerReferralCents,
      },
      descricao: `Ganhos calculados e retidos por 24 horas no pedido ${order.codigo}.`,
      pagamento_id: order.pagamento_id,
      tipo_evento: "BLOQUEIO_FINANCEIRO",
      transacao_comercial_id: transaction.id,
    },
  });

  return {
    alreadySettled: false,
    companyCents,
    commissionBaseCents,
    deliveryCents,
    feeCents,
    merchantGrossCents,
    merchantNetCents,
    rewardsPoolCents,
    availableAt,
    transactionId: transaction.id,
    walletUserIds: [
      order.usuario_id,
      order.loja.lojista.usuario_id,
      consumerSponsor?.sponsorUserId,
      sellerSponsor?.sponsorUserId,
      ...networkAwards.map((award) => award.userId),
    ].filter(Boolean),
  };
}

export async function settlePaidStoreChargeEarnings(database, chargeId) {
  const charge = await createOrderEarningsRepository(database).findCharge({
    include: {
      loja: {
        include: {
          categoria: { include: { segmento_venda: true } },
          segmento_venda: true,
          lojista: { select: { id: true, usuario_id: true } },
        },
      },
      pagamento: { select: { id: true, status: true, usuario_pagador_id: true } },
    },
    where: { id: chargeId },
  });

  if (!charge?.loja || !charge.pagamento) {
    throw new AppError("Cobranca presencial nao encontrada para distribuir ganhos", 404);
  }

  if (charge.status !== "PAGA" || !["PAGO", "LIQUIDADO"].includes(charge.pagamento.status)) {
    throw new AppError("A cobranca precisa estar paga para distribuir ganhos", 409);
  }
  if (
    charge.proposta_servico
    && (charge.proposta_servico.status !== "CONCLUIDA" || !charge.proposta_servico.concluido_em)
  ) {
    throw new AppError("O servico precisa ser confirmado pelo cliente antes de distribuir ganhos", 409);
  }

  const existingTransaction = await createOrderEarningsRepository(database).findCommercialTransaction({
    where: { pagamento_id: charge.pagamento_id },
  });

  if (existingTransaction?.status === "LIQUIDADA") {
    return { alreadySettled: true, transactionId: existingTransaction.id, walletUserIds: [] };
  }

  const grossCents = cents(charge.valor_centavos);
  const storeCommission = await getStoreCommissionDistribution(database, charge.loja);
  const paymentPolicy = resolvePaymentPolicy({
    globalPolicy: await getPaymentPolicy(database),
    store: charge.loja,
  });
  const feePercent = storeCommission.commission.feePercent;
  const feeCents = percentageOf(grossCents, feePercent);
  const immediatePhysical = !charge.proposta_servico
    || charge.proposta_servico.forma_pagamento === "QR_PRESENCIAL";
  const policyAllocation = calculatePaymentPolicyAllocation({
    channel: immediatePhysical ? "LOCAL" : "ONLINE",
    commissionCents: feeCents,
    onlineServiceFeeCents: 0,
    policy: paymentPolicy,
  });
  const merchantNetCents = grossCents - feeCents;
  const transaction = await createOrderEarningsRepository(database).upsertCommercialTransaction({
    create: {
      comprador_usuario_id: charge.pagamento.usuario_pagador_id,
      base_comissao_centavos: BigInt(grossCents),
      loja_id: charge.loja_id,
      lojista_id: charge.loja.lojista_id,
      pagamento_id: charge.pagamento_id,
      percentual_empresa: 0,
      percentual_pool: 0,
      percentual_taxa_plataforma: feePercent,
      status: "PENDENTE",
      valor_bruto_centavos: BigInt(grossCents),
      valor_entrega_lojista_centavos: 0,
      valor_empresa_centavos: 0,
      valor_liquido_lojista_centavos: BigInt(merchantNetCents),
      valor_pool_recompensas_centavos: 0,
      taxa_plataforma_centavos: BigInt(feeCents),
      taxa_processamento_centavos: BigInt(policyAllocation.processingFeeCents),
      cashback_prioritario_centavos: BigInt(policyAllocation.priorityCashbackCents),
    },
    update: {},
    where: { pagamento_id: charge.pagamento_id },
  });
  const settlementAt = new Date();
  const availableAt = immediatePhysical
    ? settlementAt
    : earningsAvailableAt(settlementAt);
  const claim = await createOrderEarningsRepository(database).updateCommercialTransactions({
    data: { status: "VALIDADA", validada_em: settlementAt },
    where: { id: transaction.id, status: "PENDENTE" },
  });

  if (claim.count === 0) {
    return { alreadySettled: true, transactionId: transaction.id, walletUserIds: [] };
  }

  const [consumerSponsor, sellerSponsor, networkUplines] = await Promise.all([
    findDirectSponsor(database, charge.pagamento.usuario_pagador_id),
    findDirectSponsor(database, charge.loja.lojista.usuario_id),
    findQualifiedMatrixUplines(database, charge.loja.lojista.usuario_id),
  ]);
  const {
    cashbackCents,
    consumerReferralCents,
    networkPoolCents,
    sellerReferralCents,
  } = calculateCommissionAmounts({
    commission: storeCommission.commission,
    consumerSponsor,
    feeCents: policyAllocation.distributablePoolCents,
    sellerSponsor,
  });
  const totalCashbackCents = cashbackCents + policyAllocation.priorityCashbackCents;
  const networkAwards = distributeEvenly(networkPoolCents, networkUplines);
  const networkCents = networkAwards.reduce((total, award) => total + award.valueCents, 0);
  const rewardsPoolCents = totalCashbackCents + consumerReferralCents + sellerReferralCents + networkCents;
  const companyCents = policyAllocation.distributablePoolCents
    - (cashbackCents + consumerReferralCents + sellerReferralCents + networkCents);
  const reference = `cobranca ${charge.codigo_publico}`;

  await createOrderEarningsRepository(database).createReceivable({
    data: {
      disponivel_em: availableAt,
      loja_id: charge.loja_id,
      status: "PENDENTE",
      taxa_plataforma_centavos: BigInt(feeCents),
      tipo_recebedor: "LOJISTA",
      transacao_comercial_id: transaction.id,
      usuario_recebedor_id: charge.loja.lojista.usuario_id,
      valor_bruto_centavos: BigInt(grossCents),
      valor_liquido_centavos: BigInt(merchantNetCents),
    },
  });
  await creditUserWallet({
    availableAt,
    database,
    description: `Venda presencial da ${reference}.`,
    origin: "VENDA",
    originId: transaction.id,
    userId: charge.loja.lojista.usuario_id,
    valueCents: merchantNetCents,
    walletCode: "vendas",
  });
  await creditReward(database, {
    description: `Cashback da ${reference}.`,
    origin: "CASHBACK",
    rewardType: "CASHBACK_COMPRADOR",
    transactionId: transaction.id,
    userId: charge.pagamento.usuario_pagador_id,
    valueCents: totalCashbackCents,
    walletCode: "cashback",
  });

  if (consumerSponsor) {
    await creditReward(database, {
      description: `Indicacao direta de consumidor na ${reference}.`,
      origin: "BONUS_INDICACAO",
      rewardType: "BONUS_INDICACAO_CONSUMIDOR",
      transactionId: transaction.id,
      userId: consumerSponsor.sponsorUserId,
      valueCents: consumerReferralCents,
      walletCode: "cashback",
    });
  }

  if (sellerSponsor) {
    await creditReward(database, {
      description: `Indicacao direta do lojista na ${reference}.`,
      origin: "BONUS_VENDEDOR",
      rewardType: "BONUS_VENDEDOR",
      transactionId: transaction.id,
      userId: sellerSponsor.sponsorUserId,
      valueCents: sellerReferralCents,
      walletCode: "vendas",
    });
  }

  for (const award of networkAwards) {
    await creditReward(database, {
      description: `Bonus de rede da ${reference}.`,
      origin: "BONUS_REDE",
      rewardType: "BONUS_REDE",
      transactionId: transaction.id,
      userId: award.userId,
      valueCents: award.valueCents,
      walletCode: "rede",
    });
  }

  await creditProcessingReserve(
    database,
    transaction.id,
    policyAllocation.processingFeeCents,
  );
  await creditCompanyRevenue(database, transaction.id, companyCents);
  await createOrderEarningsRepository(database).updateCommercialTransaction({
    data: {
      percentual_empresa: percentageFrom(companyCents, grossCents),
      percentual_pool: percentageFrom(rewardsPoolCents, grossCents),
      status: "VALIDADA",
      valor_empresa_centavos: BigInt(companyCents),
      valor_pool_recompensas_centavos: BigInt(rewardsPoolCents),
    },
    where: { id: transaction.id },
  });
  await createOrderEarningsRepository(database).createFinancialEvent({
    data: {
      dados_json: {
        cashbackCents: totalCashbackCents,
        poolCashbackCents: cashbackCents,
        companyCents,
        commissionSource: storeCommission.source,
        consumerReferralCents,
        effectiveFeePercent: feePercent,
        feeCents,
        grossCents,
        networkCents,
        networkRecipients: networkAwards.length,
        processingFeeCents: policyAllocation.processingFeeCents,
        priorityCashbackCents: policyAllocation.priorityCashbackCents,
        distributablePoolCents: policyAllocation.distributablePoolCents,
        sellerReferralCents,
      },
      descricao: immediatePhysical
        ? `Ganhos calculados para liberacao imediata na venda presencial ${reference}.`
        : `Ganhos calculados e retidos por 24 horas na venda online ${reference}.`,
      pagamento_id: charge.pagamento_id,
      tipo_evento: immediatePhysical ? "PAGAMENTO_LIQUIDADO" : "BLOQUEIO_FINANCEIRO",
      transacao_comercial_id: transaction.id,
    },
  });

  return {
    alreadySettled: false,
    companyCents,
    feeCents,
    merchantNetCents,
    rewardsPoolCents,
    availableAt,
    transactionId: transaction.id,
    walletUserIds: [
      charge.pagamento.usuario_pagador_id,
      charge.loja.lojista.usuario_id,
      consumerSponsor?.sponsorUserId,
      sellerSponsor?.sponsorUserId,
      ...networkAwards.map((award) => award.userId),
    ].filter(Boolean),
  };
}

export async function settlePaidAutonomousChargeEarnings(database, chargeId) {
  const charge = await createOrderEarningsRepository(database).findCharge({
    include: {
      pagamento: { select: { id: true, status: true, usuario_pagador_id: true } },
      proposta_servico: {
        include: {
          conversa_servico: {
            include: {
              segmento_venda: true,
              servico_vendedor: {
                include: { tipo_servico: { select: { tipo_operacao: true } } },
              },
            },
          },
        },
      },
      venda_autonoma: { include: { segmento_venda: true } },
      vendedor: {
        include: {
          segmento_venda: true,
        },
      },
    },
    where: { id: chargeId },
  });

  if (!charge?.vendedor || !charge.pagamento) {
    throw new AppError("Cobranca avulsa nao encontrada para distribuir ganhos", 404);
  }

  if (charge.status !== "PAGA" || !["PAGO", "LIQUIDADO"].includes(charge.pagamento.status)) {
    throw new AppError("A cobranca precisa estar paga para distribuir ganhos", 409);
  }

  const existingTransaction = await createOrderEarningsRepository(database).findCommercialTransaction({
    where: { pagamento_id: charge.pagamento_id },
  });

  if (existingTransaction?.status === "LIQUIDADA") {
    return { alreadySettled: true, transactionId: existingTransaction.id, walletUserIds: [] };
  }

  const grossCents = cents(charge.valor_centavos);
  const globalDistribution = await getOrderEarningsDistribution(database);
  const segment = charge.proposta_servico?.conversa_servico?.segmento_venda
    ?? charge.venda_autonoma?.segmento_venda
    ?? charge.vendedor.segmento_venda;
  const paymentPolicy = resolvePaymentPolicy({
    globalPolicy: await getPaymentPolicy(database),
    segment,
  });
  const segmentDistribution = getSegmentCommissionDistribution(
    segment,
    globalDistribution,
  );
  const feePercent = segmentDistribution.feePercent;
  const feeCents = percentageOf(grossCents, feePercent);
  const immediatePhysical = !charge.proposta_servico
    || charge.proposta_servico.forma_pagamento === "QR_PRESENCIAL";
  const holdEarnings = shouldHoldServiceEarnings({
    conversation: charge.proposta_servico?.conversa_servico,
    paymentMode: charge.proposta_servico?.forma_pagamento,
  });
  const policyAllocation = calculatePaymentPolicyAllocation({
    channel: immediatePhysical ? "LOCAL" : "ONLINE",
    commissionCents: feeCents,
    onlineServiceFeeCents: 0,
    policy: paymentPolicy,
  });
  const sellerNetCents = grossCents - feeCents;
  const transaction = await createOrderEarningsRepository(database).upsertCommercialTransaction({
    create: {
      comprador_usuario_id: charge.pagamento.usuario_pagador_id,
      base_comissao_centavos: BigInt(grossCents),
      pagamento_id: charge.pagamento_id,
      percentual_empresa: 0,
      percentual_pool: 0,
      percentual_taxa_plataforma: feePercent,
      status: "PENDENTE",
      valor_bruto_centavos: BigInt(grossCents),
      valor_entrega_lojista_centavos: 0,
      valor_empresa_centavos: 0,
      valor_liquido_lojista_centavos: BigInt(sellerNetCents),
      valor_pool_recompensas_centavos: 0,
      taxa_plataforma_centavos: BigInt(feeCents),
      taxa_processamento_centavos: BigInt(policyAllocation.processingFeeCents),
      cashback_prioritario_centavos: BigInt(policyAllocation.priorityCashbackCents),
      vendedor_id: charge.vendedor_id,
    },
    update: {},
    where: { pagamento_id: charge.pagamento_id },
  });
  const settlementAt = new Date();
  const availableAt = holdEarnings
    ? earningsAvailableAt(settlementAt)
    : settlementAt;
  const claim = await createOrderEarningsRepository(database).updateCommercialTransactions({
    data: { status: "VALIDADA", validada_em: settlementAt },
    where: { id: transaction.id, status: "PENDENTE" },
  });

  if (claim.count === 0) {
    return { alreadySettled: true, transactionId: transaction.id, walletUserIds: [] };
  }

  const [consumerSponsor, sellerSponsor, networkUplines] = await Promise.all([
    findDirectSponsor(database, charge.pagamento.usuario_pagador_id),
    findDirectSponsor(database, charge.vendedor.usuario_id),
    findQualifiedMatrixUplines(database, charge.vendedor.usuario_id),
  ]);
  const {
    cashbackCents,
    consumerReferralCents,
    networkPoolCents,
    sellerReferralCents,
  } = calculateCommissionAmounts({
    commission: segmentDistribution,
    consumerSponsor,
    feeCents: policyAllocation.distributablePoolCents,
    sellerSponsor,
  });
  const totalCashbackCents = cashbackCents + policyAllocation.priorityCashbackCents;
  const networkAwards = distributeEvenly(networkPoolCents, networkUplines);
  const networkCents = networkAwards.reduce((total, award) => total + award.valueCents, 0);
  const rewardsPoolCents = totalCashbackCents + consumerReferralCents + sellerReferralCents + networkCents;
  const companyCents = policyAllocation.distributablePoolCents
    - (cashbackCents + consumerReferralCents + sellerReferralCents + networkCents);
  const reference = `cobranca ${charge.codigo_publico}`;

  await createOrderEarningsRepository(database).createReceivable({
    data: {
      disponivel_em: availableAt,
      status: "PENDENTE",
      taxa_plataforma_centavos: BigInt(feeCents),
      tipo_recebedor: "VENDEDOR",
      transacao_comercial_id: transaction.id,
      usuario_recebedor_id: charge.vendedor.usuario_id,
      valor_bruto_centavos: BigInt(grossCents),
      valor_liquido_centavos: BigInt(sellerNetCents),
    },
  });
  await creditUserWallet({
    availableAt,
    database,
    description: `Venda autonoma da ${reference}.`,
    origin: "VENDA",
    originId: transaction.id,
    userId: charge.vendedor.usuario_id,
    valueCents: sellerNetCents,
    walletCode: "vendas",
  });
  await creditReward(database, {
    availableAt,
    description: `Cashback da ${reference}.`,
    origin: "CASHBACK",
    rewardType: "CASHBACK_COMPRADOR",
    transactionId: transaction.id,
    userId: charge.pagamento.usuario_pagador_id,
    valueCents: totalCashbackCents,
    walletCode: "cashback",
  });

  if (consumerSponsor) {
    await creditReward(database, {
      availableAt,
      description: `Indicacao direta de consumidor na ${reference}.`,
      origin: "BONUS_INDICACAO",
      rewardType: "BONUS_INDICACAO_CONSUMIDOR",
      transactionId: transaction.id,
      userId: consumerSponsor.sponsorUserId,
      valueCents: consumerReferralCents,
      walletCode: "cashback",
    });
  }

  if (sellerSponsor) {
    await creditReward(database, {
      availableAt,
      description: `Indicacao direta do vendedor na ${reference}.`,
      origin: "BONUS_VENDEDOR",
      rewardType: "BONUS_VENDEDOR",
      transactionId: transaction.id,
      userId: sellerSponsor.sponsorUserId,
      valueCents: sellerReferralCents,
      walletCode: "vendas",
    });
  }

  for (const award of networkAwards) {
    await creditReward(database, {
      availableAt,
      description: `Bonus de rede da ${reference}.`,
      origin: "BONUS_REDE",
      rewardType: "BONUS_REDE",
      transactionId: transaction.id,
      userId: award.userId,
      valueCents: award.valueCents,
      walletCode: "rede",
    });
  }

  await creditProcessingReserve(
    database,
    transaction.id,
    policyAllocation.processingFeeCents,
  );
  await creditCompanyRevenue(database, transaction.id, companyCents);
  await createOrderEarningsRepository(database).updateCommercialTransaction({
    data: {
      percentual_empresa: percentageFrom(companyCents, grossCents),
      percentual_pool: percentageFrom(rewardsPoolCents, grossCents),
      status: "VALIDADA",
      valor_empresa_centavos: BigInt(companyCents),
      valor_pool_recompensas_centavos: BigInt(rewardsPoolCents),
    },
    where: { id: transaction.id },
  });
  await createOrderEarningsRepository(database).createFinancialEvent({
    data: {
      dados_json: {
        cashbackCents: totalCashbackCents,
        poolCashbackCents: cashbackCents,
        companyCents,
        commissionSource: "SEGMENTO",
        consumerReferralCents,
        effectiveFeePercent: feePercent,
        feeCents,
        grossCents,
        networkCents,
        networkRecipients: networkAwards.length,
        processingFeeCents: policyAllocation.processingFeeCents,
        priorityCashbackCents: policyAllocation.priorityCashbackCents,
        distributablePoolCents: policyAllocation.distributablePoolCents,
        sellerReferralCents,
      },
      descricao: holdEarnings
        ? `Ganhos calculados e retidos por 24 horas no servico ${reference}.`
        : `Ganhos calculados para liberacao imediata na venda presencial ${reference}.`,
      pagamento_id: charge.pagamento_id,
      tipo_evento: holdEarnings ? "BLOQUEIO_FINANCEIRO" : "PAGAMENTO_LIQUIDADO",
      transacao_comercial_id: transaction.id,
    },
  });

  return {
    alreadySettled: false,
    companyCents,
    feeCents,
    merchantNetCents: sellerNetCents,
    rewardsPoolCents,
    availableAt,
    transactionId: transaction.id,
    walletUserIds: [
      charge.pagamento.usuario_pagador_id,
      charge.vendedor.usuario_id,
      consumerSponsor?.sponsorUserId,
      sellerSponsor?.sponsorUserId,
      ...networkAwards.map((award) => award.userId),
    ].filter(Boolean),
  };
}
