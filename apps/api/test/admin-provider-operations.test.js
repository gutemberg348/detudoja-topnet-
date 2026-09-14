import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../src/config/prisma.js";
import { approveKycSubmission } from "../src/modules/kyc/kyc.service.js";
import {
  addAdminUserService,
  updateAdminPayoutAccount,
  updateAdminSellerProfile,
  updateAdminUserService,
} from "../src/modules/admin/admin-users.service.js";

const marker = "admin-provider-operations-test";
const state = {};

async function cleanup() {
  const user = await prisma.usuario.findFirst({ where: { email: `${marker}@local.test` } });
  const admin = await prisma.administrador.findFirst({ where: { email: `${marker}@local.test` } });
  const serviceType = await prisma.tipoServico.findFirst({ where: { slug: marker } });
  const segment = await prisma.segmentoVenda.findFirst({ where: { slug: marker } });

  await prisma.$transaction(async (database) => {
    if (admin) await database.auditoriaAdministrativa.deleteMany({ where: { administrador_id: admin.id } });
    if (user) {
      await database.contaBancaria.deleteMany({ where: { usuario_id: user.id } });
      await database.servicoVendedor.deleteMany({ where: { vendedor: { usuario_id: user.id } } });
      await database.vendedor.deleteMany({ where: { usuario_id: user.id } });
      await database.kycUsuario.deleteMany({ where: { usuario_id: user.id } });
      await database.usuario.delete({ where: { id: user.id } });
    }
    if (serviceType) await database.tipoServico.delete({ where: { id: serviceType.id } });
    if (segment) await database.segmentoVenda.delete({ where: { id: segment.id } });
    await database.categoriaLoja.deleteMany({ where: { nome: marker } });
    if (admin) await database.administrador.delete({ where: { id: admin.id } });
  });
}

before(async () => {
  await prisma.$connect();
  await cleanup();
  const category = await prisma.categoriaLoja.create({ data: { nome: marker, status: "ATIVA" } });
  const segment = await prisma.segmentoVenda.create({
    data: { categoria_loja_id: category.id, nome: marker, slug: marker, status: "ATIVO" },
  });
  const [admin, user, serviceType] = await Promise.all([
    prisma.administrador.create({
      data: { email: `${marker}@local.test`, nome: "Admin de Operacao", papel: "SUPER_ADMIN", senha_hash: "test", status: "ATIVO" },
    }),
    prisma.usuario.create({
      data: { cpf: "39053344705", email: `${marker}@local.test`, nome: "Prestador Teste", senha_hash: "test", status: "ATIVO" },
    }),
    prisma.tipoServico.create({
      data: { modo_atendimento: "NEGOCIACAO_CHAT", nome: marker, segmento_venda_id: segment.id, slug: marker, status: "ATIVO", tipo_operacao: "GERAL" },
    }),
  ]);
  Object.assign(state, { admin, serviceType, user });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("admin only releases a provider service after KYC and records every operation", async () => {
  await assert.rejects(
    addAdminUserService(state.admin.id, state.user.id, { serviceTypeId: state.serviceType.id }),
    (error) => error.statusCode === 428,
  );

  await prisma.$transaction([
    prisma.kycUsuario.create({
      data: {
        cpf: state.user.cpf,
        nome_completo: state.user.nome,
        status: "APROVADO",
        tipo_pessoa: "FISICA",
        usuario_id: state.user.id,
        validado_em: new Date(),
      },
    }),
    prisma.usuario.update({ data: { nivel_kyc: "TIER_2" }, where: { id: state.user.id } }),
  ]);

  const added = await addAdminUserService(state.admin.id, state.user.id, { serviceTypeId: state.serviceType.id });
  const service = added.user.providerProfile.services[0];
  assert.equal(added.user.providerProfile.status, "ATIVO");
  assert.equal(service.status, "ATIVO");

  const paused = await updateAdminUserService(state.admin.id, state.user.id, service.id, { status: "PAUSADO" });
  assert.equal(paused.user.providerProfile.services[0].status, "PAUSADO");

  const blocked = await updateAdminSellerProfile(state.admin.id, state.user.id, { status: "BLOQUEADO" });
  assert.equal(blocked.user.providerProfile.status, "BLOQUEADO");
  assert.equal(blocked.user.providerProfile.services[0].availableNow, false);

  const audits = await prisma.auditoriaAdministrativa.findMany({
    orderBy: { id: "asc" },
    where: { administrador_id: state.admin.id, usuario_alvo_id: state.user.id },
  });
  assert.deepEqual(audits.map((audit) => audit.acao), [
    "SERVICO_PRESTADOR_LIBERADO",
    "SERVICO_PRESTADOR_ATUALIZADO",
    "PERFIL_PRESTADOR_ATUALIZADO",
  ]);
});

test("admin can release a registered payout key and the override is audited", async () => {
  const account = await prisma.contaBancaria.create({
    data: {
      chave_pix: state.user.cpf,
      documento_titular: state.user.cpf,
      nome_titular: state.user.nome,
      principal: true,
      status: "PENDENTE",
      tipo_chave: "CPF",
      usuario_id: state.user.id,
    },
  });

  const result = await updateAdminPayoutAccount(state.admin.id, state.user.id, {
    reason: "Titularidade conferida manualmente pelo financeiro.",
    status: "ATIVA",
  });

  assert.equal(result.user.payoutAccount.status, "ATIVA");
  assert.equal(result.user.payoutAccount.validationProvider, "ADMIN_MANUAL");
  const stored = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: account.id } });
  assert.equal(stored.status, "ATIVA");
  assert.ok(stored.validado_em);

  const audit = await prisma.auditoriaAdministrativa.findFirst({
    orderBy: { id: "desc" },
    where: { acao: "CHAVE_PIX_STATUS_ATUALIZADO", usuario_alvo_id: state.user.id },
  });
  assert.equal(audit.administrador_id, state.admin.id);
  assert.equal(audit.dados_json.statusAnterior, "PENDENTE");
  assert.equal(audit.dados_json.statusNovo, "ATIVA");
});

test("admin can reverse a rejected KYC after manually reviewing the documents", async () => {
  const kyc = await prisma.kycUsuario.update({
    data: { motivo_reprovacao: "Triagem automatica inconclusiva", status: "REPROVADO", validado_em: null },
    where: { usuario_id: state.user.id },
  });
  await prisma.usuario.update({ data: { nivel_kyc: "REPROVADO" }, where: { id: state.user.id } });
  const submission = await prisma.solicitacaoKyc.create({
    data: {
      kyc_usuario_id: kyc.id,
      motivo_decisao: "Reprovado automaticamente para revisao.",
      status: "REPROVADO",
      tipo_documento: "RG",
      triagem_json: { automaticResult: "REPROVADO", processingStatus: "CONCLUIDO", version: 5 },
    },
  });

  const result = await approveKycSubmission(
    state.admin.id,
    submission.id,
    "Documentos e titularidade revisados manualmente.",
  );
  assert.equal(result.submission.status, "APROVADO");

  const user = await prisma.usuario.findUniqueOrThrow({ include: { kyc: true }, where: { id: state.user.id } });
  assert.equal(user.kyc.status, "APROVADO");
  assert.equal(user.nivel_kyc, "TIER_2");
});
