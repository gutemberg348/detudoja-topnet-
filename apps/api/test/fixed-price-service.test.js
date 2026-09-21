import assert from "node:assert/strict";
import test from "node:test";
import { updateSellerServiceSchema } from "../src/modules/service-chats/service-chats.validator.js";

test("prestador pode informar preco fixo ao ativar um servico", () => {
  const result = updateSellerServiceSchema.safeParse({
    available: true,
    priceCents: 2590,
    serviceTypeId: 4,
  });

  assert.equal(result.success, true);
  assert.equal(result.data.priceCents, 2590);
});

test("API rejeita preco de servico menor que um real", () => {
  const result = updateSellerServiceSchema.safeParse({
    available: true,
    priceCents: 99,
    serviceTypeId: 4,
  });

  assert.equal(result.success, false);
});
