import { AppError } from "../../utils/errors.js";
import { isQualifiedForNetwork, networkQualificationInclude } from "../network/network.qualification.js";
import { creditUserWallet } from "../wallet/wallet.service.js";
import {
  getOrderEarningsDistribution,
  getSegmentCommissionDistribution,
} from "./order-earnings.config.js";

const validIndicationStatuses = ["ATIVA", "CONVERTIDA", "PENDENTE"];

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

async function getStoreCommissionDistribution(database, store) {
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
  const indication = await database.indicacao.findUnique({
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
    const position = await database.indicacao.findUnique({
      select: { alocado_sob_usuario_id: true },
      where: { indicado_usuario_id: currentUserId },
    });
    const parentUserId = position?.alocado_sob_usuario_id;

    if (!parentUserId || visited.has(parentUserId)) {
      break;
    }

    visited.add(parentUserId);
    currentUserId = parentUserId;

    const parentUser = await database.usuario.findUnique({
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

  const reward = await database.recompensa.create({
    data: {
      liberado_em: new Date(),
      motivo: description,
      percentual: null,
      status: "LIBERADA",
      tipo_recompensa: rewardType,
      transacao_comercial_id: transactionId,
      usuario_beneficiado_id: userId,
      valor_centavos: BigInt(valueCents),
    },
  });

  await creditUserWallet({
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

  const account = await database.contaPlataforma.upsert({
    create: {
      nome: "Receita da empresa",
      status: "ATIVA",
      tipo_conta: "RECEITA_EMPRESA",
    },
    update: { status: "ATIVA" },
    where: { tipo_conta: "RECEITA_EMPRESA" },
  });

  await database.contaPlataforma.update({
    data: { saldo_centavos: { increment: BigInt(valueCents) } },
    where: { id: account.id },
  });

  return database.lancamentoPlataforma.create({
    data: {
      conta_plataforma_id: account.id,
      descricao: "Receita retida da taxa da venda concluida.",
      status: "PROCESSADO",
      tipo_lancamento: "CREDITO",
      transacao_comercial_id: transactionId,
      valor_centavos: BigInt(valueCents),
    },
  });
}

async function markIndicationConverted(database, indicationId, field) {
  if (!indicationId) {
    return;
  }

  await database.indicacao.updateMany({
    data: {
      [field]: new Date(),
      status: "CONVERTIDA",
    },
    where: {
      id: indicationId,
      status: { in: validIndicationStatuses },
    },
  });
}

export async function settleCompletedStoreOrderEarnings(database, orderId) {
  const order = await database.pedidoLoja.findUnique({
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

  const existingTransaction = await database.transacaoComercial.findUnique({
    where: { pagamento_id: order.pagamento_id },
  });

  if (existingTransaction?.status === "LIQUIDADA") {
    return { alreadySettled: true, transactionId: existingTransaction.id };
  }

  const grossCents = cents(order.subtotal_centavos);
  const storeCommission = await getStoreCommissionDistribution(database, order.loja);
  const feePercent = storeCommission.commission.feePercent;
  const feeCents = percentageOf(grossCents, feePercent);
  const merchantNetCents = grossCents - feeCents;
  const transaction = await database.transacaoComercial.upsert({
    create: {
      comprador_usuario_id: order.usuario_id,
      loja_id: order.loja_id,
      lojista_id: order.loja.lojista_id,
      pagamento_id: order.pagamento_id,
      percentual_empresa: 0,
      percentual_pool: 0,
      percentual_taxa_plataforma: feePercent,
      status: "PENDENTE",
      valor_bruto_centavos: BigInt(grossCents),
      valor_empresa_centavos: 0,
      valor_liquido_lojista_centavos: BigInt(merchantNetCents),
      valor_pool_recompensas_centavos: 0,
      taxa_plataforma_centavos: BigInt(feeCents),
    },
    update: {},
    where: { pagamento_id: order.pagamento_id },
  });
  const claim = await database.transacaoComercial.updateMany({
    data: {
      status: "VALIDADA",
      validada_em: new Date(),
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
    feeCents,
    sellerSponsor,
  });
  const networkAwards = distributeEvenly(networkPoolCents, networkUplines);
  const networkCents = networkAwards.reduce((total, award) => total + award.valueCents, 0);
  const rewardsPoolCents =
    cashbackCents + consumerReferralCents + sellerReferralCents + networkCents;
  const companyCents = feeCents - rewardsPoolCents;

  await database.recebivel.create({
    data: {
      disponivel_em: new Date(),
      loja_id: order.loja_id,
      status: "DISPONIVEL",
      taxa_plataforma_centavos: BigInt(feeCents),
      tipo_recebedor: "LOJISTA",
      transacao_comercial_id: transaction.id,
      usuario_recebedor_id: order.loja.lojista.usuario_id,
      valor_bruto_centavos: BigInt(grossCents),
      valor_liquido_centavos: BigInt(merchantNetCents),
    },
  });

  await creditUserWallet({
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
    await markIndicationConverted(database, consumerSponsor.indicationId, "primeira_compra_em");
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
    await markIndicationConverted(database, sellerSponsor.indicationId, "primeira_venda_em");
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

  await creditCompanyRevenue(database, transaction.id, companyCents);

  await database.transacaoComercial.update({
    data: {
      liquidada_em: new Date(),
      percentual_empresa: percentageFrom(companyCents, grossCents),
      percentual_pool: percentageFrom(rewardsPoolCents, grossCents),
      status: "LIQUIDADA",
      valor_empresa_centavos: BigInt(companyCents),
      valor_pool_recompensas_centavos: BigInt(rewardsPoolCents),
    },
    where: { id: transaction.id },
  });

  await database.eventoFinanceiro.create({
    data: {
      dados_json: {
        cashbackCents,
        companyCents,
        commissionSource: storeCommission.source,
        consumerReferralCents,
        effectiveFeePercent: feePercent,
        feeCents,
        grossCents,
        networkCents,
        networkRecipients: networkAwards.length,
        sellerReferralCents,
      },
      descricao: `Ganhos distribuidos no pedido ${order.codigo}.`,
      pagamento_id: order.pagamento_id,
      tipo_evento: "PAGAMENTO_LIQUIDADO",
      transacao_comercial_id: transaction.id,
    },
  });

  return {
    alreadySettled: false,
    companyCents,
    feeCents,
    merchantNetCents,
    rewardsPoolCents,
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
  const charge = await database.cobranca.findUnique({
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

  const existingTransaction = await database.transacaoComercial.findUnique({
    where: { pagamento_id: charge.pagamento_id },
  });

  if (existingTransaction?.status === "LIQUIDADA") {
    return { alreadySettled: true, transactionId: existingTransaction.id, walletUserIds: [] };
  }

  const grossCents = cents(charge.valor_centavos);
  const storeCommission = await getStoreCommissionDistribution(database, charge.loja);
  const feePercent = storeCommission.commission.feePercent;
  const feeCents = percentageOf(grossCents, feePercent);
  const merchantNetCents = grossCents - feeCents;
  const transaction = await database.transacaoComercial.upsert({
    create: {
      comprador_usuario_id: charge.pagamento.usuario_pagador_id,
      loja_id: charge.loja_id,
      lojista_id: charge.loja.lojista_id,
      pagamento_id: charge.pagamento_id,
      percentual_empresa: 0,
      percentual_pool: 0,
      percentual_taxa_plataforma: feePercent,
      status: "PENDENTE",
      valor_bruto_centavos: BigInt(grossCents),
      valor_empresa_centavos: 0,
      valor_liquido_lojista_centavos: BigInt(merchantNetCents),
      valor_pool_recompensas_centavos: 0,
      taxa_plataforma_centavos: BigInt(feeCents),
    },
    update: {},
    where: { pagamento_id: charge.pagamento_id },
  });
  const claim = await database.transacaoComercial.updateMany({
    data: { status: "VALIDADA", validada_em: new Date() },
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
    feeCents,
    sellerSponsor,
  });
  const networkAwards = distributeEvenly(networkPoolCents, networkUplines);
  const networkCents = networkAwards.reduce((total, award) => total + award.valueCents, 0);
  const rewardsPoolCents = cashbackCents + consumerReferralCents + sellerReferralCents + networkCents;
  const companyCents = feeCents - rewardsPoolCents;
  const reference = `cobranca ${charge.codigo_publico}`;

  await database.recebivel.create({
    data: {
      disponivel_em: new Date(),
      loja_id: charge.loja_id,
      status: "DISPONIVEL",
      taxa_plataforma_centavos: BigInt(feeCents),
      tipo_recebedor: "LOJISTA",
      transacao_comercial_id: transaction.id,
      usuario_recebedor_id: charge.loja.lojista.usuario_id,
      valor_bruto_centavos: BigInt(grossCents),
      valor_liquido_centavos: BigInt(merchantNetCents),
    },
  });
  await creditUserWallet({
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
    valueCents: cashbackCents,
    walletCode: "cashback",
  });

  if (consumerSponsor) {
    await markIndicationConverted(database, consumerSponsor.indicationId, "primeira_compra_em");
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
    await markIndicationConverted(database, sellerSponsor.indicationId, "primeira_venda_em");
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

  await creditCompanyRevenue(database, transaction.id, companyCents);
  await database.transacaoComercial.update({
    data: {
      liquidada_em: new Date(),
      percentual_empresa: percentageFrom(companyCents, grossCents),
      percentual_pool: percentageFrom(rewardsPoolCents, grossCents),
      status: "LIQUIDADA",
      valor_empresa_centavos: BigInt(companyCents),
      valor_pool_recompensas_centavos: BigInt(rewardsPoolCents),
    },
    where: { id: transaction.id },
  });
  await database.eventoFinanceiro.create({
    data: {
      dados_json: {
        cashbackCents,
        companyCents,
        commissionSource: storeCommission.source,
        consumerReferralCents,
        effectiveFeePercent: feePercent,
        feeCents,
        grossCents,
        networkCents,
        networkRecipients: networkAwards.length,
        sellerReferralCents,
      },
      descricao: `Ganhos distribuidos na ${reference}.`,
      pagamento_id: charge.pagamento_id,
      tipo_evento: "PAGAMENTO_LIQUIDADO",
      transacao_comercial_id: transaction.id,
    },
  });

  return {
    alreadySettled: false,
    companyCents,
    feeCents,
    merchantNetCents,
    rewardsPoolCents,
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
  const charge = await database.cobranca.findUnique({
    include: {
      pagamento: { select: { id: true, status: true, usuario_pagador_id: true } },
      proposta_servico: {
        include: {
          conversa_servico: { include: { segmento_venda: true } },
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

  const existingTransaction = await database.transacaoComercial.findUnique({
    where: { pagamento_id: charge.pagamento_id },
  });

  if (existingTransaction?.status === "LIQUIDADA") {
    return { alreadySettled: true, transactionId: existingTransaction.id, walletUserIds: [] };
  }

  const grossCents = cents(charge.valor_centavos);
  const globalDistribution = await getOrderEarningsDistribution(database);
  const segmentDistribution = getSegmentCommissionDistribution(
    charge.proposta_servico?.conversa_servico?.segmento_venda
      ?? charge.venda_autonoma?.segmento_venda
      ?? charge.vendedor.segmento_venda,
    globalDistribution,
  );
  const feePercent = segmentDistribution.feePercent;
  const feeCents = percentageOf(grossCents, feePercent);
  const sellerNetCents = grossCents - feeCents;
  const transaction = await database.transacaoComercial.upsert({
    create: {
      comprador_usuario_id: charge.pagamento.usuario_pagador_id,
      pagamento_id: charge.pagamento_id,
      percentual_empresa: 0,
      percentual_pool: 0,
      percentual_taxa_plataforma: feePercent,
      status: "PENDENTE",
      valor_bruto_centavos: BigInt(grossCents),
      valor_empresa_centavos: 0,
      valor_liquido_lojista_centavos: BigInt(sellerNetCents),
      valor_pool_recompensas_centavos: 0,
      taxa_plataforma_centavos: BigInt(feeCents),
      vendedor_id: charge.vendedor_id,
    },
    update: {},
    where: { pagamento_id: charge.pagamento_id },
  });
  const claim = await database.transacaoComercial.updateMany({
    data: { status: "VALIDADA", validada_em: new Date() },
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
    feeCents,
    sellerSponsor,
  });
  const networkAwards = distributeEvenly(networkPoolCents, networkUplines);
  const networkCents = networkAwards.reduce((total, award) => total + award.valueCents, 0);
  const rewardsPoolCents = cashbackCents + consumerReferralCents + sellerReferralCents + networkCents;
  const companyCents = feeCents - rewardsPoolCents;
  const reference = `cobranca ${charge.codigo_publico}`;

  await database.recebivel.create({
    data: {
      disponivel_em: new Date(),
      status: "DISPONIVEL",
      taxa_plataforma_centavos: BigInt(feeCents),
      tipo_recebedor: "VENDEDOR",
      transacao_comercial_id: transaction.id,
      usuario_recebedor_id: charge.vendedor.usuario_id,
      valor_bruto_centavos: BigInt(grossCents),
      valor_liquido_centavos: BigInt(sellerNetCents),
    },
  });
  await creditUserWallet({
    database,
    description: `Venda autonoma da ${reference}.`,
    origin: "VENDA",
    originId: transaction.id,
    userId: charge.vendedor.usuario_id,
    valueCents: sellerNetCents,
    walletCode: "vendas",
  });
  await creditReward(database, {
    description: `Cashback da ${reference}.`,
    origin: "CASHBACK",
    rewardType: "CASHBACK_COMPRADOR",
    transactionId: transaction.id,
    userId: charge.pagamento.usuario_pagador_id,
    valueCents: cashbackCents,
    walletCode: "cashback",
  });

  if (consumerSponsor) {
    await markIndicationConverted(database, consumerSponsor.indicationId, "primeira_compra_em");
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
    await markIndicationConverted(database, sellerSponsor.indicationId, "primeira_venda_em");
    await creditReward(database, {
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
      description: `Bonus de rede da ${reference}.`,
      origin: "BONUS_REDE",
      rewardType: "BONUS_REDE",
      transactionId: transaction.id,
      userId: award.userId,
      valueCents: award.valueCents,
      walletCode: "rede",
    });
  }

  await creditCompanyRevenue(database, transaction.id, companyCents);
  await database.transacaoComercial.update({
    data: {
      liquidada_em: new Date(),
      percentual_empresa: percentageFrom(companyCents, grossCents),
      percentual_pool: percentageFrom(rewardsPoolCents, grossCents),
      status: "LIQUIDADA",
      valor_empresa_centavos: BigInt(companyCents),
      valor_pool_recompensas_centavos: BigInt(rewardsPoolCents),
    },
    where: { id: transaction.id },
  });
  await database.eventoFinanceiro.create({
    data: {
      dados_json: {
        cashbackCents,
        companyCents,
        commissionSource: "SEGMENTO",
        consumerReferralCents,
        effectiveFeePercent: feePercent,
        feeCents,
        grossCents,
        networkCents,
        networkRecipients: networkAwards.length,
        sellerReferralCents,
      },
      descricao: `Ganhos distribuidos na ${reference}.`,
      pagamento_id: charge.pagamento_id,
      tipo_evento: "PAGAMENTO_LIQUIDADO",
      transacao_comercial_id: transaction.id,
    },
  });

  return {
    alreadySettled: false,
    companyCents,
    feeCents,
    merchantNetCents: sellerNetCents,
    rewardsPoolCents,
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
