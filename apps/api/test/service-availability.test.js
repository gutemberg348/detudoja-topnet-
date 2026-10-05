import assert from "node:assert/strict";
import test from "node:test";
import { availableServiceWhere, isServiceAvailable } from "../src/modules/service-chats/service-availability.js";

test("saved availability persists while the app is suspended or closed", () => {
  for (const timestamp of [null, new Date("2020-01-01T00:00:00Z"), new Date()]) {
    assert.equal(isServiceAvailable({ disponivel_agora: true, disponibilidade_atualizada_em: timestamp, status: "ATIVO" }), true);
  }
  assert.deepEqual(availableServiceWhere(), { disponivel_agora: true });
});

test("manual pause, deletion and service blocks override saved availability", () => {
  assert.equal(isServiceAvailable({ disponivel_agora: false }), false);
  assert.equal(isServiceAvailable({ disponivel_agora: true, excluido_em: new Date() }), false);
  assert.equal(isServiceAvailable({ disponivel_agora: true, status: "INATIVO" }), false);
  assert.equal(isServiceAvailable(null), false);
});
