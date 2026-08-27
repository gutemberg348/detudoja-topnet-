import { createOrderEarningsRepository } from "./order-earnings.repository.js";

export const orderEarningsConfigKey = "financial.order_earnings_distribution";
export const defaultSegmentFeePercent = 10;

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
