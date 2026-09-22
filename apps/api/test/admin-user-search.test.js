import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../src/config/prisma.js";
import { listAdminUsers } from "../src/modules/admin/admin-users.service.js";
import { userSearchConditions } from "../src/modules/admin/admin-users.search.js";

const marker = `search-${randomUUID()}`;
const query = `${marker}2@example.test`;
const createdIds = [];
const users = {};

test("text and email queries never extract digits for phone or CPF search", () => {
  for (const value of ["Maria", "demo2@detudoja", "Cliente 2"]) {
    const conditions = userSearchConditions(value);
    assert.equal(conditions.length, 2);
    assert.ok(conditions.every((condition) => condition.nome || condition.email));
  }
  assert.deepEqual(userSearchConditions("   "), []);
  assert.deepEqual(userSearchConditions("(83) 99999-1234").slice(2), [
    { telefone: { contains: "83999991234" } },
    { cpf: { contains: "83999991234" } },
  ]);
});

before(async () => {
  for (const [key, email, nome, status] of [
    ["exact", query, "Z Exact participant", "ATIVO"],
    ["prefix", `${query}.extra`, "M Prefix participant", "ATIVO"],
    ["contains", `before-${query}`, "A Contains participant", "ATIVO"],
    ["unrelated", `unrelated-${marker}@example.test`, "Unrelated participant", "ATIVO"],
    ["blocked", `blocked-${query}`, "Blocked participant", "BLOQUEADO"],
  ]) {
    const user = await prisma.usuario.create({
      data: { email, nome, status, senha_hash: "test-only-unusable-hash", telefone: key === "unrelated" ? `839${Date.now()}` : null },
    });
    createdIds.push(user.id);
    users[key] = user;
  }
});

after(async () => {
  if (createdIds.length) await prisma.usuario.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.$disconnect();
});

test("search ranks exact then prefix then contains before pagination and respects filters", async () => {
  const expected = [users.exact.id, users.prefix.id, users.contains.id];
  for (let page = 1; page <= 3; page += 1) {
    const response = await listAdminUsers({ search: query.toUpperCase(), status: "ATIVO", page, perPage: 1 });
    assert.equal(response.pagination.total, 3);
    assert.equal(response.pagination.pages, 3);
    assert.deepEqual(response.users.map((user) => user.id), [expected[page - 1]]);
  }
  const blocked = await listAdminUsers({ search: query, status: "BLOQUEADO" });
  assert.deepEqual(blocked.users.map((user) => user.id), [users.blocked.id]);
});

test("a text-only query with no match returns no participants", async () => {
  const response = await listAdminUsers({ search: `unfindableparticipant${marker.replace(/[^a-z]/g, "")}` });
  assert.equal(response.pagination.total, 0);
  assert.deepEqual(response.users, []);
});

test("formatted phone search finds the matching participant", async () => {
  const phone = users.unrelated.telefone;
  const response = await listAdminUsers({ search: `(${phone.slice(0, 2)}) ${phone.slice(2)}` });
  assert.deepEqual(response.users.map((user) => user.id), [users.unrelated.id]);
});
