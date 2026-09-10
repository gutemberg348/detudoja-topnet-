import { createOrderEarningsRepository } from "./order-earnings.repository.js";

export const orderEarningsConfigKey = "financial.order_earnings_distribution";
export const paymentPolicyConfigKey = "financial.payment_policy";
export const defaultSegmentFeePercent = 10;
export const defaultPaymentPolicy = Object.freeze({
  localPriorityCashbackLimitCents: 100,
  localProcessingFeeCents: 99,
  onlineServiceFeeCents: 99,
});

const defaultDistributionBasisPoints = {
  cashback: 3000,
  consumerReferral: 1000,
  network: 2000,
  sellerReferral: 1000,
};

function toBasisPoints(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return fallback;
  }

  return Math.round(parsed * 100);
}

function normalizeDistribution(value = {}) {
  const distribution = {
    cashback: toBasisPoints(value.cashbackPercent, defaultDistributionBasisPoints.cashback),
    consumerReferral: toBasisPoints(
      value.consumerReferralPercent,
      defaultDistributionBasisPoints.consumerReferral,
    ),
    network: toBasisPoints(value.networkPercent, defaultDistributionBasisPoints.network),
    sellerReferral: toBasisPoints(
      value.sellerReferralPercent,
      defaultDistributionBasisPoints.sellerReferral,
    ),
  };
  const total = Object.values(distribution).reduce((sum, item) => sum + item, 0);

  if (total > 10000) {
    return { ...defaultDistributionBasisPoints };
  }

  return distribution;
}

function normalizeCents(value, fallback, maximum = 100000) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum) {
    return fallback;
  }

  return parsed;
}

function optionalCents(value, maximum = 100000) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null;
}

export function serializePaymentPolicyOverrides(entity = {}) {
  const source = entity ?? {};

  return {
    localPriorityCashbackLimitCents: optionalCents(
      source.limite_cashback_prioritario_centavos,
    ),
    localProcessingFeeCents: optionalCents(source.taxa_processamento_local_centavos),
    onlineServiceFeeCents: optionalCents(source.taxa_servico_online_centavos),
  };
}

export function resolvePaymentPolicy({ globalPolicy, segment = null, store = null } = {}) {
  const global = normalizePaymentPolicy(globalPolicy);
  const resolvedSegment = segment ?? store?.segmento_venda ?? store?.categoria?.segmento_venda ?? null;
  const segmentOverrides = serializePaymentPolicyOverrides(resolvedSegment);
  const storeOverrides = serializePaymentPolicyOverrides(store);
  const keys = Object.keys(defaultPaymentPolicy);
  const effective = {};
  const sources = {};

  for (const key of keys) {
    if (storeOverrides[key] != null) {
      effective[key] = storeOverrides[key];
      sources[key] = "LOJA";
    } else if (segmentOverrides[key] != null) {
      effective[key] = segmentOverrides[key];
      sources[key] = "SEGMENTO";
    } else {
      effective[key] = global[key];
      sources[key] = "GLOBAL";
    }
  }

  return {
    ...effective,
    overrides: {
      segment: segmentOverrides,
      store: storeOverrides,
    },
    sources,
  };
}

export function normalizePaymentPolicy(value = {}) {
  return {
    localPriorityCashbackLimitCents: normalizeCents(
      value.localPriorityCashbackLimitCents,
      defaultPaymentPolicy.localPriorityCashbackLimitCents,
    ),
    localProcessingFeeCents: normalizeCents(
      value.localProcessingFeeCents,
      defaultPaymentPolicy.localProcessingFeeCents,
    ),
    onlineServiceFeeCents: normalizeCents(
      value.onlineServiceFeeCents,
      defaultPaymentPolicy.onlineServiceFeeCents,
    ),
  };
}

export function calculatePaymentPolicyAllocation({
  channel,
  commissionCents,
  onlineServiceFeeCents = 0,
  policy = defaultPaymentPolicy,
}) {
  const normalizedPolicy = normalizePaymentPolicy(policy);
  const retainedCents = Math.max(Number(commissionCents) || 0, 0);

  if (channel === "ONLINE") {
    return {
      distributablePoolCents: retainedCents,
      priorityCashbackCents: 0,
      processingFeeCents: Math.max(Number(onlineServiceFeeCents) || 0, 0),
    };
  }

  const processingFeeCents = Math.min(
    retainedCents,
    normalizedPolicy.localProcessingFeeCents,
  );
  const afterProcessingCents = retainedCents - processingFeeCents;
  const priorityCashbackCents = Math.min(
    afterProcessingCents,
    normalizedPolicy.localPriorityCashbackLimitCents,
  );

  return {
    distributablePoolCents: afterProcessingCents - priorityCashbackCents,
    priorityCashbackCents,
    processingFeeCents,
  };
}

function percentageOf(valueCents, percent) {
  return Math.round((Number(valueCents) * Number(percent ?? 0)) / 100);
}

export function minimumGrossForCommission(targetCommissionCents, feePercent) {
  const target = Math.max(Number(targetCommissionCents) || 0, 0);
  const percent = Number(feePercent);
  if (target === 0) return 0;
  if (!Number.isFinite(percent) || percent <= 0) return null;

  let grossCents = Math.max(Math.ceil(((target - 0.5) * 100) / percent), 1);
  while (grossCents > 1 && percentageOf(grossCents - 1, percent) >= target) grossCents -= 1;
  while (percentageOf(grossCents, percent) < target) grossCents += 1;
  return grossCents;
}

export function calculateLocalPaymentPreview({ grossCents, feePercent, policy }) {
  const normalizedPolicy = normalizePaymentPolicy(policy);
  const commissionCents = percentageOf(grossCents, feePercent);
  const allocation = calculatePaymentPolicyAllocation({
    channel: "LOCAL",
    commissionCents,
    policy: normalizedPolicy,
  });

  return {
    cashbackStartsAtCents: minimumGrossForCommission(
      normalizedPolicy.localProcessingFeeCents + 1,
      feePercent,
    ),
    commissionCents,
    feePercent: Number(feePercent),
    poolStartsAtCents: minimumGrossForCommission(
      normalizedPolicy.localProcessingFeeCents
        + normalizedPolicy.localPriorityCashbackLimitCents
        + 1,
      feePercent,
    ),
    priorityCashbackCents: allocation.priorityCashbackCents,
    processingCovered: commissionCents >= normalizedPolicy.localProcessingFeeCents,
    processingFeeCents: allocation.processingFeeCents,
    processingTargetCents: normalizedPolicy.localProcessingFeeCents,
    retainedForPoolCents: allocation.distributablePoolCents,
  };
}

export async function getPaymentPolicy(database) {
  const config = await createOrderEarningsRepository(database).findSystemConfiguration({
    where: { chave: paymentPolicyConfigKey },
  });

  return normalizePaymentPolicy(config?.valor_json ?? {});
}

export async function updatePaymentPolicy(database, adminId, value) {
  const policy = normalizePaymentPolicy(value);
  const config = await createOrderEarningsRepository(database).upsertSystemConfiguration({
    create: {
      atualizado_por_admin_id: adminId,
      chave: paymentPolicyConfigKey,
      descricao: "Taxa de servico online e prioridade financeira das vendas locais.",
      valor_json: policy,
    },
    update: {
      atualizado_por_admin_id: adminId,
      valor_json: policy,
    },
    where: { chave: paymentPolicyConfigKey },
  });

  return normalizePaymentPolicy(config.valor_json);
}

export function serializeOrderEarningsDistribution(value = {}) {
  const distribution = normalizeDistribution(value);
  const cashbackPercent = distribution.cashback / 100;
  const networkPercent = distribution.network / 100;
  const consumerReferralPercent = distribution.consumerReferral / 100;
  const sellerReferralPercent = distribution.sellerReferral / 100;

  return {
    cashbackPercent,
    companyPercent:
      100 -
      cashbackPercent -
      networkPercent -
      consumerReferralPercent -
      sellerReferralPercent,
    consumerReferralPercent,
    networkPercent,
    sellerReferralPercent,
  };
}

export async function getOrderEarningsDistribution(database) {
  const config = await createOrderEarningsRepository(database).findSystemConfiguration({
    where: { chave: orderEarningsConfigKey },
  });

  return {
    basisPoints: normalizeDistribution(config?.valor_json ?? {}),
    public: serializeOrderEarningsDistribution(config?.valor_json ?? {}),
  };
}

export function getEffectiveSegmentFeePercent(segment) {
  const storedFeePercent = Number(segment?.taxa_plataforma_percentual ?? 0);
  const wasConfiguredByAdmin = Boolean(segment?.taxa_plataforma_atualizada_em);

  if (!wasConfiguredByAdmin && storedFeePercent === 0) {
    return defaultSegmentFeePercent;
  }

  return storedFeePercent;
}

export function getSegmentCommissionDistribution(
  segment,
  globalDistribution,
  { feePercentOverride = null } = {},
) {
  const segmentFeePercent = getEffectiveSegmentFeePercent(segment);
  const feePercent =
    feePercentOverride == null ? segmentFeePercent : Number(feePercentOverride);
  const configuredValues = {
    cashbackPercent: segment?.percentual_cashback,
    consumerReferralPercent: segment?.percentual_indicacao_consumidor,
    networkPercent: segment?.percentual_rede,
    sellerReferralPercent: segment?.percentual_indicacao_vendedor,
  };
  const hasCustomDistribution = Object.values(configuredValues).some(
    (value) => value !== null && value !== undefined,
  );
  const fallbackBasisPoints = globalDistribution?.basisPoints ?? defaultDistributionBasisPoints;
  const configuredDistribution = hasCustomDistribution
    ? {
        cashbackPercent: Number(configuredValues.cashbackPercent ?? 0),
        consumerReferralPercent: Number(configuredValues.consumerReferralPercent ?? 0),
        networkPercent: Number(configuredValues.networkPercent ?? 0),
        sellerReferralPercent: Number(configuredValues.sellerReferralPercent ?? 0),
      }
    : {
        cashbackPercent: (feePercent * fallbackBasisPoints.cashback) / 10000,
        consumerReferralPercent: (feePercent * fallbackBasisPoints.consumerReferral) / 10000,
        networkPercent: (feePercent * fallbackBasisPoints.network) / 10000,
        sellerReferralPercent: (feePercent * fallbackBasisPoints.sellerReferral) / 10000,
      };
  const distribution =
    hasCustomDistribution && segmentFeePercent > 0 && feePercent !== segmentFeePercent
      ? Object.fromEntries(
          Object.entries(configuredDistribution).map(([key, value]) => [
            key,
            (value * feePercent) / segmentFeePercent,
          ]),
        )
      : configuredDistribution;
  const distributedPercent = Object.values(distribution).reduce(
    (total, value) => total + Number(value ?? 0),
    0,
  );

  return {
    ...distribution,
    feePercent,
    platformPercent: Math.max(feePercent - distributedPercent, 0),
  };
}

export async function updateOrderEarningsDistribution(database, adminId, value) {
  const publicDistribution = serializeOrderEarningsDistribution(value);
  const config = await createOrderEarningsRepository(database).upsertSystemConfiguration({
    create: {
      atualizado_por_admin_id: adminId,
      chave: orderEarningsConfigKey,
      descricao: "Divisao percentual da taxa de cada pedido concluido.",
      valor_json: publicDistribution,
    },
    update: {
      atualizado_por_admin_id: adminId,
      valor_json: publicDistribution,
    },
    where: { chave: orderEarningsConfigKey },
  });

  return serializeOrderEarningsDistribution(config.valor_json);
}
