import "dotenv/config";
import argon2 from "argon2";
import { prisma } from "../src/config/prisma.js";
import { walletTypeDefinitions } from "../src/modules/wallet/wallet.service.js";

const marker = "carga-20260827";
const password = "Carga@2026";
const city = "Patos";
const state = "PB";

function customerData(index, passwordHash) {
  const suffix = String(index).padStart(2, "0");
  return {
    cpf: `6199901${String(index).padStart(4, "0")}`,
    email: `${marker}-cliente-${suffix}@detudoja.local`,
    enderecos: {
      create: {
        bairro: "Centro",
        cep: "58700000",
        cidade: city,
        estado: state,
        nome_endereco: "Endereco principal",
        numero: String(100 + index),
        principal: true,
        rua: "Rua da Carga",
      },
    },
    kyc: {
      create: {
        cpf: `6199901${String(index).padStart(4, "0")}`,
        nome_completo: `Cliente Carga ${suffix}`,
        status: "APROVADO",
        tipo_pessoa: "FISICA",
        validado_em: new Date(),
      },
    },
    nome: `Cliente Carga ${suffix}`,
    senha_hash: passwordHash,
    status: "ATIVO",
    telefone: `839950${String(index).padStart(5, "0")}`,
  };
}

async function ensureWallets(userIds) {
  const walletTypes = [];

  for (const definition of walletTypeDefinitions) {
    walletTypes.push(await prisma.tipoCarteira.upsert({
      create: {
        codigo: definition.code,
        descricao: definition.description,
        nome: definition.name,
        permite_saque: definition.permiteSaque,
        permite_uso_em_compra: definition.permiteUsoEmCompra,
      },
      update: {
        descricao: definition.description,
        nome: definition.name,
        permite_saque: definition.permiteSaque,
        permite_uso_em_compra: definition.permiteUsoEmCompra,
      },
      where: { codigo: definition.code },
    }));
  }

  await prisma.carteira.createMany({
    data: userIds.flatMap((userId) => walletTypes.map((walletType) => ({
      tipo_carteira_id: walletType.id,
      usuario_id: userId,
    }))),
    skipDuplicates: true,
  });
}

async function findDeliveryType() {
  const existing = await prisma.tipoServico.findFirst({
    include: { segmento_venda: true },
    where: {
      excluido_em: null,
      status: "ATIVO",
      tipo_operacao: "ENTREGA_LOCAL",
    },
  });

  if (existing?.segmento_venda?.status === "ATIVO") {
    return existing;
  }

  const category = await prisma.categoriaLoja.create({
    data: {
      descricao: "Categoria criada para a massa de carga funcional.",
      nome: "Carga - Entregas",
      status: "ATIVA",
    },
  });
  const segment = await prisma.segmentoVenda.create({
    data: {
      atende_por_chat: true,
      categoria_loja_id: category.id,
      nome: "Carga - Entregas",
      slug: `${marker}-entregas`,
      status: "ATIVO",
      taxa_plataforma_percentual: 10,
    },
  });

  return prisma.tipoServico.create({
    include: { segmento_venda: true },
    data: {
      descricao: "Entrega local para validacao de carga.",
      modo_atendimento: "NEGOCIACAO_CHAT",
      nome: "Motoboy - Carga",
      segmento_venda_id: segment.id,
      slug: `${marker}-motoboy`,
      status: "ATIVO",
      tipo_operacao: "ENTREGA_LOCAL",
    },
  });
}

async function main() {
  await prisma.$connect();

  const existing = await prisma.usuario.count({
    where: { email: { contains: marker } },
  });

  if (existing > 0) {
    console.log(`[load-scenario] Ja existem ${existing} contas da massa ${marker}. Nenhum dado foi duplicado.`);
    console.log("[load-scenario] Senha das contas de carga: Carga@2026");
    return;
  }

  const passwordHash = await argon2.hash(password, {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });
  const [category, deliveryType] = await Promise.all([
    prisma.categoriaLoja.findFirst({ where: { status: "ATIVA" }, orderBy: { id: "asc" } }),
    findDeliveryType(),
  ]);

  if (!category) {
    throw new Error("Nao existe categoria ativa para criar as lojas de carga.");
  }

  const owner = await prisma.usuario.create({
    data: {
      cpf: "61999000001",
      email: `${marker}-lojista@detudoja.local`,
      enderecos: {
        create: {
          bairro: "Centro",
          cep: "58700000",
          cidade: city,
          estado: state,
          nome_endereco: "Endereco principal",
          numero: "1",
          principal: true,
          rua: "Rua da Carga",
        },
      },
      kyc: { create: { cpf: "61999000001", nome_completo: "Lojista Carga", status: "APROVADO", tipo_pessoa: "FISICA", validado_em: new Date() } },
      nome: "Lojista Carga",
      senha_hash: passwordHash,
      status: "ATIVO",
      telefone: "83993000001",
    },
  });
  const merchant = await prisma.lojista.create({
    data: {
      cpf: owner.cpf,
      status: "ATIVO",
      status_kyc: "APROVADO",
      tipo_pessoa: "FISICA",
      usuario_id: owner.id,
    },
  });
  await prisma.contaBancaria.create({
    data: {
      chave_pix: owner.cpf,
      documento_titular: owner.cpf,
      nome_titular: owner.nome,
      principal: true,
      status: "ATIVA",
      tipo_chave: "CPF",
      usuario_id: owner.id,
    },
  });

  const stores = [];
  for (const [index, storeName] of ["Mercado Carga", "Farmacia Carga", "Loja Carga"].entries()) {
    const store = await prisma.loja.create({
      data: {
        aceita_pagamento_online: true,
        aceita_qrcode: true,
        aberta_para_pedidos: true,
        categoria_id: category.id,
        descricao: "Loja de demonstracao para testar busca, pedido e entrega.",
        endereco: {
          create: {
            bairro: "Centro",
            cep: "58700000",
            cidade: city,
            estado: state,
            numero: String(10 + index),
            rua: "Rua da Carga",
          },
        },
        lojista_id: merchant.id,
        nome: storeName,
        segmento_venda_id: deliveryType.segmento_venda_id,
        slug: `${marker}-loja-${index + 1}`,
        status: "ATIVA",
        visivel_no_app: true,
      },
    });
    stores.push(store);
    await prisma.produtoLoja.createMany({
      data: Array.from({ length: 3 }, (_, productIndex) => ({
        descricao: `Produto ${productIndex + 1} criado para a massa de carga.`,
        loja_id: store.id,
        nome: `${storeName} produto ${productIndex + 1}`,
        preco_centavos: BigInt((productIndex + 1) * 1000),
        status: "ATIVO",
      })),
    });
  }

  const customers = [];
  for (let index = 1; index <= 39; index += 1) {
    customers.push(await prisma.usuario.create({ data: customerData(index, passwordHash) }));
  }

  const couriers = [];
  for (let index = 1; index <= 10; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const cpf = `6199902${String(index).padStart(4, "0")}`;
    const user = await prisma.usuario.create({
      data: {
        cpf,
        email: `${marker}-motoboy-${suffix}@detudoja.local`,
        enderecos: { create: { bairro: "Centro", cep: "58700000", cidade: city, estado: state, nome_endereco: "Endereco principal", numero: String(200 + index), principal: true, rua: "Rua da Carga" } },
        kyc: { create: { cpf, nome_completo: `Motoboy Carga ${suffix}`, status: "APROVADO", tipo_pessoa: "FISICA", validado_em: new Date() } },
        nome: `Motoboy Carga ${suffix}`,
        senha_hash: passwordHash,
        status: "ATIVO",
        telefone: `839940${String(index).padStart(5, "0")}`,
      },
    });
    const seller = await prisma.vendedor.create({
      data: {
        cpf,
        nome_publico: user.nome,
        segmento_venda_id: deliveryType.segmento_venda_id,
        status: "ATIVO",
        status_kyc: "APROVADO",
        tipo_pessoa: "FISICA",
        usuario_id: user.id,
      },
    });
    const courier = await prisma.motoboy.create({
      data: {
        aceita_chamadas_plataforma: true,
        cidade_base: city,
        cnh: `9900000${String(index).padStart(3, "0")}`,
        estado_base: state,
        modelo_moto: "Moto de carga",
        nome_exibicao: user.nome,
        placa: `CG${String(index).padStart(3, "0")}PB`,
        status: "ATIVO",
        telefone_contato: user.telefone,
        vendedor_id: seller.id,
      },
    });
    await prisma.servicoVendedor.create({
      data: {
        categoria: deliveryType.nome,
        disponivel_agora: true,
        nome: deliveryType.nome,
        status: "ATIVO",
        tipo_servico_id: deliveryType.id,
        vendedor_id: seller.id,
      },
    });
    couriers.push({ courier, seller, user });
  }

  await prisma.motoboyLoja.createMany({
    data: couriers.slice(0, 3).map(({ courier }) => ({
      loja_id: stores[0].id,
      motoboy_id: courier.id,
    })),
  });
  await ensureWallets([owner.id, ...customers.map((user) => user.id), ...couriers.map(({ user }) => user.id)]);

  console.log("[load-scenario] Massa criada com sucesso.");
  console.log("[load-scenario] 50 contas: 1 lojista, 39 clientes e 10 motoboys online.");
  console.log("[load-scenario] 3 lojas visiveis, 9 produtos e 3 motoboys vinculados a primeira loja.");
  console.log(`[load-scenario] Login de exemplo: ${customers[0].email} / ${password}`);
}

main()
  .catch((error) => {
    console.error("[load-scenario] Falha ao criar massa", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
