import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { adminNetworkRepository } from "../src/modules/admin/admin-network.repository.js";
import { getAdminNetworkOverview, moveAdminNetworkPlacement } from "../src/modules/admin/admin-network.service.js";

function fixture(size = 45) {
  const users = Array.from({ length: size + 1 }, (_, index) => ({
    id: index + 1, nome: `Pessoa ${index}`, email: `p${index}@example.test`,
    status: "ATIVO", tipo_conta: "CONSUMIDOR", criado_em: new Date("2026-01-01"),
    kyc: { status: "APROVADO" }, indicacoes_feitas: [],
  }));
  const placements = users.slice(1).map((user, index) => ({
    id: user.id, indicado_usuario_id: user.id, alocado_sob_usuario_id: users[index].id,
    indicador_usuario_id: 1, posicao_matriz: 1, nivel_matriz: index + 1,
    status: "ATIVA", indicado: user, indicador: users[0], alocado_sob: users[index],
  }));
  return { users, placements };
}

test("admin sees the entire network beyond level 20; aggregates only existing levels", async () => {
  const { users, placements } = fixture(150);
  mock.method(adminNetworkRepository, "findCompanyRoot", async () => users[0]);
  const children = mock.method(adminNetworkRepository, "findMatrixChildren", async () => placements);
  mock.method(adminNetworkRepository, "findOrphanUsers", async () => []);
  mock.method(adminNetworkRepository, "findUnallocatedIndications", async () => []);
  try {
    const result = await getAdminNetworkOverview();
    assert.equal(result.people.length, 150);
    assert.equal(result.people.at(-1).level, 150);
    assert.equal(result.summary.deepestLevel, 150);
    assert.equal(result.summary.rewardDepth, 20);
    assert.equal(result.summary.maxDepth, null);
    assert.equal(children.mock.callCount(), 1);
    assert.equal(result.levels.length, 150);
    assert.equal((await getAdminNetworkOverview({ maxDepth: 30 })).people.length, 30);
    assert.equal((await getAdminNetworkOverview({ maxDepth: "all" })).people.length, 150);
    // Corrupted cycles must never cause an unbounded traversal.
    placements.push({ ...placements[0], indicado_usuario_id: 1, alocado_sob_usuario_id: 151, indicado: users[0] });
    assert.equal((await getAdminNetworkOverview()).people.length, 150);
  } finally { mock.restoreAll(); }
});

test("moving a branch beyond the twentieth level preserves descendants, sponsor and audit", async () => {
  const { users, placements } = fixture();
  const writes = [];
  const audits = [];
  const database = {
    $executeRawUnsafe: async () => {},
    indicacao: {
      findUnique: async ({ where }) => placements.find((p) => p.indicado_usuario_id === where.indicado_usuario_id),
      findMany: async () => placements,
      update: async ({ where, data }) => { writes.push({ id: where.id, data }); },
    },
    usuario: { findFirst: async ({ where }) => users.find((user) => user.id === where.id) },
    auditoriaAdministrativa: { create: async ({ data }) => { audits.push(data); } },
  };
  mock.method(adminNetworkRepository, "findCompanyRoot", async () => users[0]);
  mock.method(adminNetworkRepository, "findMatrixChildren", async () => placements);
  mock.method(adminNetworkRepository, "findOrphanUsers", async () => []);
  mock.method(adminNetworkRepository, "findUnallocatedIndications", async () => []);
  mock.method(adminNetworkRepository, "transaction", async (work) => work(database));
  try {
    await moveAdminNetworkPlacement(900, 42, { parentUserId: 40, position: 2, reason: "Teste de ramo profundo" });
    assert.equal(writes[0].data.nivel_matriz, 40);
    assert.equal(writes.at(-1).data.nivel_matriz, 44);
    assert.equal(writes.some(({ data }) => "indicador_usuario_id" in data), false);
    assert.equal(audits[0].acao, "POSICAO_REDE_ALTERADA");
    await assert.rejects(() => moveAdminNetworkPlacement(900, 40, { parentUserId: 42, position: 2 }), /ciclo/);
    await assert.rejects(() => moveAdminNetworkPlacement(900, 42, { parentUserId: 40, position: 1 }), /ocupada/);
    await assert.rejects(() => moveAdminNetworkPlacement(900, 1, { parentUserId: 40, position: 2 }), /raiz/);
  } finally { mock.restoreAll(); }
});
