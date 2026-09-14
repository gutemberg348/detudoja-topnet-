import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import argon2 from "argon2";
import { prisma } from "../src/config/prisma.js";
import {
  activateAllAdminUserServices,
  approveAdminUserKycWithoutSubmission,
  updateAdminUserPassword,
} from "../src/modules/admin/admin-users.service.js";

const marker = "admin-user-overrides-test";
const state = {};

async function cleanup() {
  const user = await prisma.usuario.findFirst({ where: { email: `${marker}@local.test` } });
  const admin = await prisma.administrador.findFirst({ where: { email: `${marker}@local.test` } });
  const segment = await prisma.segmentoVenda.findFirst({ where: { slug: marker } });
  await prisma.$transaction(async (database) => {
    if (user) {
      await database.auditoriaAdministrativa.deleteMany({ where: { usuario_alvo_id: user.id } });
      await database.servicoVendedor.deleteMany({ where: { vendedor: { usuario_id: user.id } } });
      await database.vendedor.deleteMany({ where: { usuario_id: user.id } });
      await database.kycUsuario.deleteMany({ where: { usuario_id: user.id } });
      await database.sessaoAutenticacao.deleteMany({ where: { usuario_id: user.id } });
      await database.usuario.delete({ where: { id: user.id } });
    }
    if (segment) {
      await database.tipoServico.deleteMany({ where: { segmento_venda_id: segment.id } });
      await database.segmentoVenda.delete({ where: { id: segment.id } });
    }
    await database.categoriaLoja.deleteMany({ where: { nome: marker } });
    if (admin) {
      await database.auditoriaAdministrativa.deleteMany({ where: { administrador_id: admin.id } });
      await database.administrador.delete({ where: { id: admin.id } });
    }
  });
}

before(async () => {
  await prisma.$connect();
  await cleanup();
  const category = await prisma.categoriaLoja.create({ data: { nome: marker, status: "ATIVA" } });
  const segment = await prisma.segmentoVenda.create({
    data: { categoria_loja_id: category.id, nome: marker, slug: marker, status: "ATIVO" },
  });
  const [admin, user] = await Promise.all([
    prisma.administrador.create({
      data: { email: `${marker}@local.test`, nome: "Admin Override", papel: "SUPER_ADMIN", senha_hash: "test", status: "ATIVO" },
    }),
    prisma.usuario.create({
      data: { cpf: "52998224725", email: `${marker}@local.test`, nome: "Cliente Override", senha_hash: "old", status: "ATIVO" },
    }),
    prisma.tipoServico.create({
      data: { nome: `${marker}-geral`, segmento_venda_id: segment.id, slug: `${marker}-geral`, status: "ATIVO", tipo_operacao: "GERAL" },
    }),
    prisma.tipoServico.create({
      data: { nome: `${marker}-entrega`, segmento_venda_id: segment.id, slug: `${marker}-entrega`, status: "ATIVO", tipo_operacao: "ENTREGA_LOCAL" },
    }),
  ]);
  Object.assign(state, { admin, user });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("admin approves KYC without files, resets password and activates eligible services", async () => {
  const approved = await approveAdminUserKycWithoutSubmission(state.admin.id, state.user.id, {
    reason: "Liberacao excepcional conferida presencialmente.",
  });
  assert.equal(approved.user.kycStatus, "APROVADO");
  assert.equal(approved.user.kycLevel, "TIER_2");
  assert.equal(approved.user.kycSubmission, null);

  const session = await prisma.sessaoAutenticacao.create({
    data: {
      audiencia: "detudoja-app",
      expira_em: new Date(Date.now() + 60_000),
      jti: `${marker}-session`,
      usuario_id: state.user.id,
    },
  });
  await updateAdminUserPassword(state.admin.id, state.user.id, {
    password: "nova-senha-segura-123",
    reason: "Redefinicao solicitada pelo titular da conta.",
  });
  const passwordUser = await prisma.usuario.findUniqueOrThrow({ where: { id: state.user.id } });
  assert.equal(await argon2.verify(passwordUser.senha_hash, "nova-senha-segura-123"), true);
  assert.ok((await prisma.sessaoAutenticacao.findUniqueOrThrow({ where: { id: session.id } })).revogada_em);

  const activated = await activateAllAdminUserServices(state.admin.id, state.user.id);
  assert.equal(activated.user.providerProfile.status, "ATIVO");
  assert.equal(activated.user.providerProfile.services.some((service) => service.name === `${marker}-geral`), true);
  assert.equal(activated.user.providerProfile.services.some((service) => service.name === `${marker}-entrega`), false);

  const audits = await prisma.auditoriaAdministrativa.findMany({
    where: { administrador_id: state.admin.id, usuario_alvo_id: state.user.id },
  });
  assert.deepEqual(new Set(audits.map((audit) => audit.acao)), new Set([
    "KYC_APROVADO_SEM_DOCUMENTOS",
    "SENHA_PARTICIPANTE_REDEFINIDA",
    "TODOS_SERVICOS_PRESTADOR_LIBERADOS",
  ]));
});
