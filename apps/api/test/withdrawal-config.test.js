import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultWithdrawalSettings,
  normalizeWithdrawalSettings,
} from "../src/modules/withdrawals/withdrawal.config.js";
import {
  requestWithdrawalSchema,
  updateWithdrawalSettingsSchema,
} from "../src/modules/withdrawals/withdrawal.validator.js";

test("withdrawal settings use safe defaults", () => {
  assert.deepEqual(normalizeWithdrawalSettings(), defaultWithdrawalSettings);
});

test("withdrawal settings never keep inconsistent maximum and daily limits", () => {
  const settings = normalizeWithdrawalSettings({
    dailyLimitCents: 1000,
    maximumCents: 2000,
    minimumCents: 3000,
  });

  assert.equal(settings.minimumCents, 3000);
  assert.equal(settings.maximumCents, 3000);
  assert.equal(settings.dailyLimitCents, 3000);
});

test("withdrawal request accepts known wallet codes and delegates policy to the database", () => {
  const valid = requestWithdrawalSchema.safeParse({
    amountCents: 2500,
    idempotencyKey: "withdrawal-test-0001",
    walletCode: "vendas",
  });
  const configurable = requestWithdrawalSchema.safeParse({
    amountCents: 2500,
    idempotencyKey: "withdrawal-test-0002",
    walletCode: "cashback",
  });

  assert.equal(valid.success, true);
  assert.equal(configurable.success, true);
});

test("withdrawal policy rejects fee at or above minimum", () => {
  const result = updateWithdrawalSettingsSchema.safeParse({
    dailyLimitCents: 100000,
    enabled: true,
    fixedFeeCents: 1000,
    manualApproval: true,
    maximumCents: 50000,
    minimumCents: 1000,
  });

  assert.equal(result.success, false);
});
