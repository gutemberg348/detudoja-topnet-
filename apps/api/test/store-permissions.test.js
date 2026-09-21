import assert from "node:assert/strict";
import test from "node:test";
import {
  membershipHasStorePermission,
  normalizeStorePermissions,
  serializeStoreAccess,
  storePermissionAccessWhere,
  userHasStorePermission,
} from "../src/modules/store-staff/store-permissions.js";

test("funcionario ativo recebe somente permissoes explicitamente liberadas", () => {
  const member = {
    cargo: "ATENDENTE",
    permissoes: { createCharges: false, manageOrders: true, storeChats: false },
    status: "ATIVO",
    usuario_id: 20,
  };

  assert.equal(membershipHasStorePermission(member, "manageOrders"), true);
  assert.equal(membershipHasStorePermission(member, "createCharges"), false);
  assert.equal(membershipHasStorePermission(member, "storeChats"), false);
});

test("funcionario inativo perde todas as permissoes salvas", () => {
  const member = {
    cargo: "ATENDENTE",
    permissoes: { createCharges: true, manageOrders: true, storeChats: true },
    status: "INATIVO",
    usuario_id: 20,
  };

  assert.equal(membershipHasStorePermission(member, "createCharges"), false);
  assert.equal(userHasStorePermission({ lojista: { usuario_id: 10 }, usuarios: [member] }, 20, "createCharges"), false);
});

test("dono sempre possui acesso total", () => {
  const store = { lojista: { usuario_id: 10 }, usuarios: [] };

  assert.equal(userHasStorePermission(store, 10, "storeChats"), true);
  assert.deepEqual(serializeStoreAccess(null, { isOwner: true }).permissions, {
    createCharges: true,
    manageOrders: true,
    storeChats: true,
  });
});

test("permissoes ausentes ou invalidas ficam bloqueadas por padrao", () => {
  assert.deepEqual(normalizeStorePermissions(null), {
    createCharges: false,
    manageOrders: false,
    storeChats: false,
  });
  assert.deepEqual(normalizeStorePermissions({ storeChats: "true" }), {
    createCharges: false,
    manageOrders: false,
    storeChats: false,
  });
});

test("filtro Prisma exige a permissao solicitada para funcionario", () => {
  const where = storePermissionAccessWhere(20, "manageOrders");
  const employeeFilter = where.OR[1].usuarios.some;

  assert.equal(where.OR[0].lojista.usuario_id, 20);
  assert.equal(employeeFilter.status, "ATIVO");
  assert.equal(employeeFilter.usuario_id, 20);
  assert.deepEqual(employeeFilter.OR[1].permissoes, {
    equals: true,
    path: ["manageOrders"],
  });
});
