import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import argon2 from "argon2";
import { prisma } from "../src/config/prisma.js";
import {
  createAdministrator,
  listAdministrators,
  updateAdministratorStatus,
} from "../src/modules/admin/admin-administrators.service.js";

const actorEmail = "admin-creator-test@local.test";
const createdEmail = "admin-created-test@local.test";
let actor;

async function cleanup() {
  const administrators = await prisma.administrador.findMany({
    where: { email: { in: [actorEmail, createdEmail] } },
  });
  const ids = administrators.map((administrator) => administrator.id);
  if (!ids.length) return;
  await prisma.$transaction(async (database) => {
    await database.auditoriaAdministrativa.deleteMany({ where: { administrador_id: { in: ids } } });
    await database.sessaoAutenticacao.deleteMany({ where: { administrador_id: { in: ids } } });
    await database.administrador.deleteMany({ where: { id: { in: ids } } });
  });
}

before(async () => {
  await prisma.$connect();
  await cleanup();
  actor = await prisma.administrador.create({
    data: { email: actorEmail, nome: "Super Admin Teste", papel: "SUPER_ADMIN", senha_hash: "test", status: "ATIVO" },
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("super admin creates and controls an administrator account", async () => {
  const result = await createAdministrator(actor.id, {
    email: createdEmail.toUpperCase(),
    name: "Financeiro Teste",
    password: "senha-administrativa-forte",
    phone: "(11) 98888-7766",
    role: "FINANCEIRO",
  });
  assert.equal(result.administrator.email, createdEmail);
  assert.equal(result.administrator.phone, "11988887766");
  assert.equal(result.administrator.role, "FINANCEIRO");
  assert.equal(result.administrator.status, "ATIVO");

  const stored = await prisma.administrador.findUniqueOrThrow({ where: { id: result.administrator.id } });
  assert.equal(await argon2.verify(stored.senha_hash, "senha-administrativa-forte"), true);
  const listed = await listAdministrators();
  assert.equal(listed.administrators.some((item) => item.id === stored.id), true);

  const blocked = await updateAdministratorStatus(actor.id, stored.id, "BLOQUEADO");
  assert.equal(blocked.administrator.status, "BLOQUEADO");
  await assert.rejects(
    updateAdministratorStatus(actor.id, actor.id, "BLOQUEADO"),
    (error) => error.statusCode === 409,
  );

  const audits = await prisma.auditoriaAdministrativa.findMany({
    where: { administrador_id: actor.id, acao: { startsWith: "ADMINISTRADOR_" } },
  });
  assert.deepEqual(audits.map((item) => item.acao).sort(), [
    "ADMINISTRADOR_CRIADO",
    "ADMINISTRADOR_STATUS_ATUALIZADO",
  ]);
});
