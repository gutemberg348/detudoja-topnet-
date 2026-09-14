import assert from "node:assert/strict";
import { test } from "node:test";
import { createSellerStoreSchema } from "../src/modules/seller/seller.validator.js";

const validStore = {
  address: {
    city: "Patos",
    complement: "",
    district: "Centro",
    number: "10",
    reference: "",
    state: "PB",
    street: "Rua da Loja",
    zipCode: "58700000",
  },
  categoryId: 1,
  document: "",
  name: "Loja com entrega configurada",
  segmentId: 1,
  type: "FISICA",
};

test("cadastro de loja exige uma taxa de entrega informada", () => {
  const result = createSellerStoreSchema.safeParse(validStore);
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((issue) => issue.path[0] === "deliveryFeeCents"));
});

test("cadastro de loja aceita entrega gratis informada explicitamente", () => {
  const result = createSellerStoreSchema.safeParse({ ...validStore, deliveryFeeCents: 0 });
  assert.equal(result.success, true);
  assert.equal(result.data.deliveryFeeCents, 0);
});
