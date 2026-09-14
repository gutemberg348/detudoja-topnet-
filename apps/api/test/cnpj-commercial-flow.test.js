import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../src/config/prisma.js";
import { createSellerOnboarding } from "../src/modules/seller/seller.service.js";

const email = "cnpj-flow@detudoja.local";
const segmentSlug = "cnpj-flow-test";

async function cleanup() {
  const user = await prisma.usuario.findUnique({ where: { email } });
  if (user) {
    await prisma.vendedor.deleteMany({ where: { usuario_id: user.id } });
    await prisma.usuario.delete({ where: { id: user.id } });
  }
  await prisma.segmentoVenda.deleteMany({ where: { slug: segmentSlug } });
}

before(async () => {
  await prisma.$connect();
  await cleanup();
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("CNPJ valido fica pendente ate o representante concluir o TIER_2", async () => {
  const [user, segment] = await Promise.all([
    prisma.usuario.create({
      data: {
        cpf: "52998224725",
        email,
        nome: "Representante Empresa Teste",
        senha_hash: "hash-inutilizado-no-teste",
        status: "ATIVO",
      },
    }),
    prisma.segmentoVenda.create({
      data: { nome: "Segmento CNPJ Teste", slug: segmentSlug, status: "ATIVO" },
    }),
  ]);

  await assert.rejects(
    createSellerOnboarding(user.id, {
      document: "11.222.333/0001-80",
      publicName: "Empresa invalida",
      segmentId: segment.id,
      type: "JURIDICA",
    }),
    (error) => error.statusCode === 400,
  );

  const result = await createSellerOnboarding(user.id, {
    document: "00.000.000/E08G-12",
    publicName: "Empresa alfanumerica",
    segmentId: segment.id,
    type: "JURIDICA",
  });

  assert.equal(result.profile.document, "00000000E08G12");
  assert.equal(result.profile.kycStatus, "PENDENTE");
  assert.equal(result.profile.status, "PENDENTE");
  assert.equal(result.profile.type, "JURIDICA");

  await prisma.$transaction([
    prisma.kycUsuario.create({
      data: {
        cpf: user.cpf,
        nome_completo: user.nome,
        status: "APROVADO",
        tipo_pessoa: "FISICA",
        usuario_id: user.id,
        validado_em: new Date(),
      },
    }),
    prisma.usuario.update({
      data: { nivel_kyc: "TIER_2" },
      where: { id: user.id },
    }),
  ]);

  const approved = await createSellerOnboarding(user.id, {
    document: "00.000.000/E08G-12",
    publicName: "Empresa alfanumerica",
    segmentId: segment.id,
    type: "JURIDICA",
  });
  assert.equal(approved.profile.kycStatus, "APROVADO");
  assert.equal(approved.profile.status, "ATIVO");
});
