import { randomUUID } from "crypto";
import argon2 from "argon2";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/prisma.js";

const baseSalesSegments = [
  {
    description: "Vendas avulsas feitas por pessoa fisica, profissional autonomo ou prestador independente.",
    iconName: "person",
    name: "Venda autonoma",
    sortOrder: 1,
  },
  {
    description: "Mercados, mercearias, hortifrutis e conveniencias de bairro.",
    iconName: "basket",
    name: "Mercado",
    sortOrder: 2,
  },
  {
    description: "Farmacias, drogarias, manipulados e produtos de saude.",
    iconName: "medical",
    name: "Farmacia",
    sortOrder: 3,
  },
  {
    description: "Lojas fisicas ou online com produtos variados.",
    iconName: "storefront",
    name: "Lojas",
    sortOrder: 4,
  },
  {
    description: "Servicos gerais, reparos, manutencao, atendimento e mao de obra local.",
    iconName: "construct",
    name: "Servicos",
    sortOrder: 5,
  },
  {
    description: "Alimentos prontos, restaurantes, lanchonetes, marmitas e delivery.",
    iconName: "restaurant",
    name: "Restaurantes",
    sortOrder: 6,
  },
  {
    description: "Beleza, estetica, barbearia, manicure, maquiagem e cuidados pessoais.",
    iconName: "sparkles",
    name: "Beleza",
    sortOrder: 7,
  },
  {
    description: "Moda, roupas, calcados, acessorios e presentes.",
    iconName: "bag",
    name: "Moda",
    sortOrder: 8,
  },
  {
    description: "Casa, reforma, decoracao, limpeza e utilidades.",
    iconName: "home",
    name: "Casa",
    sortOrder: 9,
  },
  {
    description: "Tecnologia, eletronicos, celulares, informatica e acessorios.",
    iconName: "desktop",
    name: "Eletronicos",
    sortOrder: 10,
  },
];

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function seedAdmin() {
  const email = env.adminSeed.email.trim().toLowerCase();
  const name = env.adminSeed.name.trim();
  const password = env.adminSeed.password;
  const phone = env.adminSeed.phone.replace(/\D/g, "") || null;

  if (!email.includes("@") || name.length < 3 || password.length < 8) {
    throw new Error(
      "Configure ADMIN_SEED_NAME, ADMIN_SEED_EMAIL e ADMIN_SEED_PASSWORD (minimo 8 caracteres)",
    );
  }

  const existingAdmin = await prisma.administrador.findUnique({
    where: { email },
  });

  if (existingAdmin) {
    if (process.env.ADMIN_SEED_UPDATE_EXISTING === "true") {
      const passwordHash = await argon2.hash(password, {
        memoryCost: 19456,
        parallelism: 1,
        timeCost: 2,
        type: argon2.argon2id,
      });
      await prisma.$transaction([
        prisma.administrador.update({
          data: {
            nome: name,
            papel: "SUPER_ADMIN",
            senha_hash: passwordHash,
            status: "ATIVO",
            telefone: phone,
          },
          where: { id: existingAdmin.id },
        }),
        prisma.sessaoAutenticacao.updateMany({
          data: { revogada_em: new Date() },
          where: { administrador_id: existingAdmin.id, revogada_em: null },
        }),
      ]);
      console.log(`Administrador ${email} atualizado e sessoes anteriores revogadas.`);
      return;
    }
    console.log(`Administrador ${email} ja existe. Nenhuma senha foi alterada.`);
    return;
  }

  const passwordHash = await argon2.hash(password, {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });

  await prisma.administrador.create({
    data: {
      email,
      nome: name,
      papel: "SUPER_ADMIN",
      senha_hash: passwordHash,
      status: "ATIVO",
      telefone: phone,
    },
  });

  console.log(`Administrador ${email} criado com sucesso.`);
}

async function seedCompanyRootUser() {
  const email = env.companyRoot.email.trim().toLowerCase();
  const name = env.companyRoot.name.trim() || "Brasil Cashback Empresa";
  const existingUser = await prisma.usuario.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.log(`Usuario raiz da empresa ${email} ja existe.`);
    return;
  }

  const passwordHash = await argon2.hash(randomUUID(), {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });

  await prisma.usuario.create({
    data: {
      email,
      email_verificado: true,
      kyc: {
        create: {
          nome_fantasia: name,
          razao_social: name,
          status: "APROVADO",
          tipo_pessoa: "JURIDICA",
        },
      },
      nome: name,
      senha_hash: passwordHash,
      status: "ATIVO",
      tipo_conta: "ADMIN",
    },
  });

  console.log(`Usuario raiz da empresa ${email} criado com sucesso.`);
}

async function seedSalesSegments() {
  let fallbackCategory = await prisma.categoriaLoja.findFirst({
    where: {
      excluido_em: null,
      nome: { equals: "Outros", mode: "insensitive" },
    },
  });

  if (!fallbackCategory) {
    fallbackCategory = await prisma.categoriaLoja.create({
      data: {
        descricao: "Atividades aguardando classificacao comercial especifica.",
        nome: "Outros",
        status: "ATIVA",
      },
    });
  }

  for (const segment of baseSalesSegments) {
    const savedSegment = await prisma.segmentoVenda.upsert({
      create: {
        categoria_loja_id: fallbackCategory.id,
        descricao: segment.description,
        icone: segment.iconName,
        nome: segment.name,
        ordem: segment.sortOrder,
        slug: slugify(segment.name),
        status: "ATIVO",
        taxa_plataforma_percentual: 10,
      },
      update: {
        descricao: segment.description,
        icone: segment.iconName,
        nome: segment.name,
        ordem: segment.sortOrder,
        status: "ATIVO",
      },
      where: { slug: slugify(segment.name) },
    });

    if (!savedSegment.categoria_loja_id) {
      await prisma.segmentoVenda.update({
        data: { categoria_loja_id: fallbackCategory.id },
        where: { id: savedSegment.id },
      });
    }
  }

  console.log(`${baseSalesSegments.length} segmentos de venda prontos.`);
}

async function main() {
  await seedAdmin();
  await seedCompanyRootUser();
  await seedSalesSegments();
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
