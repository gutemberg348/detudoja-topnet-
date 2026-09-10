import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adjustAdminUserWalletSchema,
  moveAdminNetworkPlacementSchema,
  updateAdminWalletTypeSchema,
} from "../src/modules/admin/admin.validator.js";

test("admin wallet adjustment requires an explicit operation and reason", () => {
  const debit = adjustAdminUserWalletSchema.safeParse({
    description: "Correcao autorizada do saldo duplicado",
    operation: "DEBIT",
    valueCents: 1500,
    walletCode: "vendas",
  });
  const invalid = adjustAdminUserWalletSchema.safeParse({
    description: "ajuste",
    operation: "REMOVE",
    valueCents: 1500,
    walletCode: "vendas",
  });

  assert.equal(debit.success, true);
  assert.equal(invalid.success, false);
});

test("wallet withdrawal policy accepts only a boolean flag", () => {
  assert.equal(updateAdminWalletTypeSchema.safeParse({ canWithdraw: true }).success, true);
  assert.equal(updateAdminWalletTypeSchema.safeParse({ canWithdraw: "yes" }).success, false);
});

test("network movement accepts only binary positions with a reason", () => {
  const valid = moveAdminNetworkPlacementSchema.safeParse({
    parentUserId: 10,
    position: 2,
    reason: "Correcao operacional aprovada",
  });
  const invalid = moveAdminNetworkPlacementSchema.safeParse({
    parentUserId: 10,
    position: 3,
    reason: "curto",
  });

  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});
