import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateLocalPaymentPreview,
  calculatePaymentPolicyAllocation,
  defaultSegmentFeePercent,
  getEffectiveSegmentFeePercent,
  getSegmentCommissionDistribution,
  resolvePaymentPolicy,
} from "../src/modules/earnings/order-earnings.config.js";
import { shouldHoldServiceEarnings } from "../src/modules/earnings/order-earnings.service.js";

const globalDistribution = {
  basisPoints: {
    cashback: 3000,
    consumerReferral: 1000,
    network: 2000,
    sellerReferral: 1000,
  },
};

test("segmento sem configuracao usa retencao inicial de 10%", () => {
  const segment = {
    taxa_plataforma_atualizada_em: null,
    taxa_plataforma_percentual: 0,
  };

  assert.equal(getEffectiveSegmentFeePercent(segment), defaultSegmentFeePercent);
  assert.deepEqual(getSegmentCommissionDistribution(segment, globalDistribution), {
    cashbackPercent: 3,
    consumerReferralPercent: 1,
    feePercent: 10,
    networkPercent: 2,
    platformPercent: 3,
    sellerReferralPercent: 1,
  });
});

test("segmento configurado pelo admin pode ter taxa zero", () => {
  const segment = {
    taxa_plataforma_atualizada_em: new Date(),
    taxa_plataforma_percentual: 0,
  };

  assert.equal(getEffectiveSegmentFeePercent(segment), 0);
  assert.equal(getSegmentCommissionDistribution(segment, globalDistribution).feePercent, 0);
});

test("pedido online envia toda a comissao ao pool e separa a taxa de servico", () => {
  assert.deepEqual(calculatePaymentPolicyAllocation({
    channel: "ONLINE",
    commissionCents: 250,
    onlineServiceFeeCents: 99,
  }), {
    distributablePoolCents: 250,
    priorityCashbackCents: 0,
    processingFeeCents: 99,
  });
});

test("venda local prioriza processamento e cashback antes do pool", () => {
  const cases = [
    [99, { distributablePoolCents: 0, priorityCashbackCents: 0, processingFeeCents: 99 }],
    [115, { distributablePoolCents: 0, priorityCashbackCents: 16, processingFeeCents: 99 }],
    [140, { distributablePoolCents: 0, priorityCashbackCents: 41, processingFeeCents: 99 }],
    [199, { distributablePoolCents: 0, priorityCashbackCents: 100, processingFeeCents: 99 }],
    [200, { distributablePoolCents: 1, priorityCashbackCents: 100, processingFeeCents: 99 }],
    [250, { distributablePoolCents: 51, priorityCashbackCents: 100, processingFeeCents: 99 }],
  ];

  for (const [commissionCents, expected] of cases) {
    assert.deepEqual(calculatePaymentPolicyAllocation({
      channel: "LOCAL",
      commissionCents,
    }), expected);
  }
});

test("venda local nunca distribui mais que a comissao negociada", () => {
  const allocation = calculatePaymentPolicyAllocation({
    channel: "LOCAL",
    commissionCents: 40,
  });

  assert.deepEqual(allocation, {
    distributablePoolCents: 0,
    priorityCashbackCents: 0,
    processingFeeCents: 40,
  });
});

test("preview local informa os limites de taxa, cashback e pool", () => {
  assert.deepEqual(calculateLocalPaymentPreview({
    feePercent: 10,
    grossCents: 500,
  }), {
    cashbackStartsAtCents: 995,
    commissionCents: 50,
    feePercent: 10,
    poolStartsAtCents: 1995,
    priorityCashbackCents: 0,
    processingCovered: false,
    processingFeeCents: 50,
    processingTargetCents: 99,
    retainedForPoolCents: 0,
  });

  const eligible = calculateLocalPaymentPreview({ feePercent: 10, grossCents: 1350 });
  assert.equal(eligible.processingCovered, true);
  assert.equal(eligible.priorityCashbackCents, 36);
  assert.equal(eligible.retainedForPoolCents, 0);
});

test("politica financeira respeita loja, segmento e global nesta ordem", () => {
  const policy = resolvePaymentPolicy({
    globalPolicy: {
      localPriorityCashbackLimitCents: 100,
      localProcessingFeeCents: 99,
      onlineServiceFeeCents: 99,
    },
    segment: {
      limite_cashback_prioritario_centavos: 150n,
      taxa_processamento_local_centavos: 80n,
      taxa_servico_online_centavos: 120n,
    },
    store: {
      limite_cashback_prioritario_centavos: null,
      taxa_processamento_local_centavos: 70n,
      taxa_servico_online_centavos: null,
    },
  });

  assert.equal(policy.onlineServiceFeeCents, 120);
  assert.equal(policy.localProcessingFeeCents, 70);
  assert.equal(policy.localPriorityCashbackLimitCents, 150);
  assert.deepEqual(policy.sources, {
    localPriorityCashbackLimitCents: "SEGMENTO",
    localProcessingFeeCents: "LOJA",
    onlineServiceFeeCents: "SEGMENTO",
  });
});

test("campos vazios herdam a politica financeira global", () => {
  const policy = resolvePaymentPolicy({
    globalPolicy: {
      localPriorityCashbackLimitCents: 130,
      localProcessingFeeCents: 75,
      onlineServiceFeeCents: 105,
    },
    segment: {},
    store: {},
  });

  assert.equal(policy.onlineServiceFeeCents, 105);
  assert.equal(policy.localProcessingFeeCents, 75);
  assert.equal(policy.localPriorityCashbackLimitCents, 130);
  assert.ok(Object.values(policy.sources).every((source) => source === "GLOBAL"));
});

test("ganho de motoboy fica retido por 24 horas em qualquer canal da plataforma", () => {
  const courierConversation = {
    servico_vendedor: {
      tipo_servico: { tipo_operacao: "ENTREGA_LOCAL" },
    },
  };

  assert.equal(shouldHoldServiceEarnings({
    conversation: courierConversation,
    paymentMode: "ONLINE",
  }), true);
  assert.equal(shouldHoldServiceEarnings({
    conversation: courierConversation,
    paymentMode: "QR_PRESENCIAL",
  }), true);
  assert.equal(shouldHoldServiceEarnings({
    conversation: {},
    paymentMode: "QR_PRESENCIAL",
  }), false);
});
