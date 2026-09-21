import assert from "node:assert/strict";
import test from "node:test";
import { assertUserIsNotStoreOperator } from "../src/modules/charges/charge.service.js";

test("proprietario nao pode pagar QR ou cobranca da propria loja", async () => {
  const repository = { findStoreMember: async () => null };

  await assert.rejects(
    assertUserIsNotStoreOperator(repository, { id: 10, lojista: { usuario_id: 7 } }, 7),
    (error) => error.statusCode === 409,
  );
});

test("funcionario ativo nao pode pagar QR ou cobranca da loja em que trabalha", async () => {
  const repository = { findStoreMember: async () => ({ id: 99 }) };

  await assert.rejects(
    assertUserIsNotStoreOperator(repository, { id: 10, lojista: { usuario_id: 7 } }, 8),
    (error) => error.statusCode === 409,
  );
});

test("cliente sem vinculo com a loja pode seguir para o pagamento", async () => {
  const repository = { findStoreMember: async () => null };

  await assert.doesNotReject(
    assertUserIsNotStoreOperator(repository, { id: 10, lojista: { usuario_id: 7 } }, 8),
  );
});
