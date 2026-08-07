import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSegmentFeePercent,
  getEffectiveSegmentFeePercent,
  getSegmentCommissionDistribution,
} from "../src/modules/earnings/order-earnings.config.js";

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
