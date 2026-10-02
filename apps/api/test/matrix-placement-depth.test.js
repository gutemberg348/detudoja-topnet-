import assert from "node:assert/strict";
import { test } from "node:test";
import { findMatrixPlacement } from "../src/modules/auth/auth.service.js";

test("new participants may be placed below an existing deep sponsor", async () => {
  const repository = {
    findMatrixPlacementByUserId: async () => ({ nivel_matriz: 250 }),
    findMatrixChildren: async () => [{ indicado_usuario_id: 11, posicao_matriz: 1, nivel_matriz: 251 }],
  };
  assert.deepEqual(await findMatrixPlacement(repository, 10), { parentUserId: 10, position: 2, level: 251 });
});

test("binary allocation preserves breadth-first, left-before-right placement", async () => {
  const repository = {
    findMatrixPlacementByUserId: async () => null,
    findMatrixChildren: async (id) => id === 1
      ? [{ indicado_usuario_id: 2, posicao_matriz: 1 }, { indicado_usuario_id: 3, posicao_matriz: 2 }]
      : [],
  };
  assert.deepEqual(await findMatrixPlacement(repository, 1), { parentUserId: 2, position: 1, level: 2 });
});

test("a cyclic malformed network does not hang while looking for a vacancy", async () => {
  let calls = 0;
  const repository = {
    findMatrixPlacementByUserId: async () => null,
    findMatrixChildren: async () => {
      calls++;
      return [{ indicado_usuario_id: 1, posicao_matriz: 1 }, { indicado_usuario_id: 1, posicao_matriz: 2 }];
    },
  };
  await assert.rejects(() => findMatrixPlacement(repository, 1), /posicao valida/);
  assert.equal(calls, 1);
});
