import "dotenv/config";
import argon2 from "argon2";
import { prisma } from "../src/config/prisma.js";
import { ensureUserWallets } from "../src/modules/wallet/wallet.service.js";

const marker = "teste50-v1";
const password = "12345678";
const city = "Patos";
const state = "PB";
const now = new Date();

const imageUrl = (photoId, width = 1200) => (
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=82`
);

const storefronts = [
  {
    bannerUrl: imageUrl("photo-1542838132-92c53300491e", 1600),
    category: "Mercado",
    description: "Mercado completo com alimentos, bebidas e itens para o dia a dia.",
    logoUrl: imageUrl("photo-1578916171728-46686eac8d58", 600),
    name: "Mercado Avenida",
  },
  {
    bannerUrl: imageUrl("photo-1517248135467-4c7edcad34c4", 1600),
    category: "Restaurantes",
    description: "Refeicoes, lanches e pratos preparados para pedir pelo aplicativo.",
    logoUrl: imageUrl("photo-1414235077428-338989a2e8c0", 600),
    name: "Sabor da Praca",
  },
  {
    bannerUrl: imageUrl("photo-1555041469-a586c61ea9bc", 1600),
    category: "Casa",
    description: "Utilidades, organizacao e produtos para deixar sua casa completa.",
    logoUrl: imageUrl("photo-1586023492125-27b2c045efd7", 600),
    name: "Casa Forte Utilidades",
  },
  {
    bannerUrl: imageUrl("photo-1560066984-138dadb4c035", 1600),
    category: "Beleza",
    description: "Beleza, cabelo e autocuidado com atendimento especializado.",
    logoUrl: imageUrl("photo-1596462502278-27bfdc403348", 600),
    name: "Studio Bella",
  },
  {
    bannerUrl: imageUrl("photo-1547592180-85f173990554", 1600),
    category: "Mercado",
    description: "Produtos selecionados, mercearia e sabores regionais.",
    logoUrl: imageUrl("photo-1601599561213-832382fd07ba", 600),
    name: "Emporio Sertao",
  },
  {
    bannerUrl: imageUrl("photo-1568901346375-23c9450c58cd", 1600),
    category: "Restaurantes",
    description: "Hamburgueres, porcoes, bebidas e combos preparados na hora.",
    logoUrl: imageUrl("photo-1550547660-d9450f859349", 600),
    name: "Ponto do Lanche",
  },
  {
    bannerUrl: imageUrl("photo-1504307651254-35680f356dfd", 1600),
    category: "Casa",
    description: "Materiais, ferramentas e acabamentos para construir e reformar.",
    logoUrl: imageUrl("photo-1581244277943-fe4a9c777189", 600),
    name: "Constrular",
  },
  {
    bannerUrl: imageUrl("photo-1522335789203-aabd1fc54bc9", 1600),
    category: "Beleza",
    description: "Cosmeticos e cuidados pessoais escolhidos para sua rotina.",
    logoUrl: imageUrl("photo-1598440947619-2c35fc9aa908", 600),
    name: "Beleza Viva",
  },
];

const catalogs = {
  Restaurantes: [
    ["Hamburguer artesanal", "Carne, queijo e salada no pao brioche.", "photo-1568901346375-23c9450c58cd"],
    ["Pizza especial", "Pizza preparada com ingredientes selecionados.", "photo-1579751626657-72bc17010498"],
    ["Prato executivo", "Refeicao completa para o almoco do dia.", "photo-1547592180-85f173990554"],
    ["Porcao de batata", "Batatas crocantes servidas com molho da casa.", "photo-1573080496219-bb080dd4f877"],
    ["Suco natural", "Suco de fruta preparado na hora.", "photo-1622597467836-f3285f2131b8"],
    ["Combo lanche", "Lanche, acompanhamento e bebida em um unico pedido.", "photo-1550547660-d9450f859349"],
  ],
  Beleza: [
    ["Kit skincare", "Cuidados essenciais para limpeza e hidratacao da pele.", "photo-1556228578-0d85b1a4d571"],
    ["Escova modelada", "Servico de escova com acabamento profissional.", "photo-1560066984-138dadb4c035"],
    ["Design de sobrancelha", "Modelagem para realcar o formato natural.", "photo-1616683693504-3ea7e9ad6fec"],
    ["Kit para cabelos", "Shampoo, condicionador e tratamento capilar.", "photo-1522337360788-8b13dee7a37e"],
    ["Maquiagem profissional", "Producao completa para eventos e ocasioes especiais.", "photo-1522335789203-aabd1fc54bc9"],
    ["Hidratante corporal", "Hidratacao e cuidado diario para a pele.", "photo-1608248543803-ba4f8c70ae0b"],
  ],
  Casa: [
    ["Piso ceramico", "Revestimento resistente com acabamento moderno.", "photo-1581858726788-75bc0f6a952d"],
    ["Jogo de ferramentas", "Ferramentas essenciais para reparos e montagem.", "photo-1581147036324-c17ac41dfa6c"],
    ["Tinta para parede", "Tinta de alta cobertura para ambientes internos.", "photo-1562259949-e8e7689d7828"],
    ["Kit organizador", "Conjunto pratico para organizar diferentes ambientes.", "photo-1616486338812-3dadae4b4ace"],
    ["Torneira gourmet", "Torneira moderna para cozinha com bica movel.", "photo-1584622650111-993a426fbf0a"],
    ["Luminaria decorativa", "Iluminacao aconchegante para casa ou escritorio.", "photo-1507473885765-e6ed057f782c"],
  ],
  Mercado: [
    ["Cesta de frutas", "Selecao de frutas frescas para sua casa.", "photo-1610348725531-843dff563e2c"],
    ["Kit cafe da manha", "Itens selecionados para comecar bem o dia.", "photo-1495474472287-4d71bcdd2085"],
    ["Arroz tipo 1", "Pacote de arroz selecionado para o dia a dia.", "photo-1536304993881-ff6e9eefa2a6"],
    ["Feijao carioca", "Feijao selecionado, saboroso e de preparo facil.", "photo-1515543904379-3d757afe72e4"],
    ["Leite integral", "Leite integral para sua familia.", "photo-1550583724-b2692b85b150"],
    ["Cesta de compras", "Combinacao de itens essenciais para abastecer a casa.", "photo-1542838132-92c53300491e"],
  ],
};

const roleDefinitions = [
  ["entregador", 5, "Entregador Teste"],
  ["lojista", 8, "Lojista Teste"],
  ["prestador", 10, "Prestador Teste"],
  ["cliente", 24, "Cliente Teste"],
  ["vazio", 3, "Login Vazio"],
];

const plans = roleDefinitions.flatMap(([role, count, label]) => (
  Array.from({ length: count }, (_, offset) => {
    const number = offset + 1;
    const suffix = String(number).padStart(2, "0");
    return {
      email: `teste50.${role}${suffix}@detudoja.local`,
      empty: role === "vazio",
      label: `${label} ${suffix}`,
      number,
      role,
    };
  })
));

function cpfDigit(base) {
  let total = 0;
  for (let index = 0; index < base.length; index += 1) total += Number(base[index]) * (base.length + 1 - index);
  const remainder = (total * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

function cpfFor(index) {
  const base = String(880000000 + index).padStart(9, "0");
  const first = cpfDigit(base);
  const second = cpfDigit(`${base}${first}`);
  return `${base}${first}${second}`;
}

function pastDate(days, extraMinutes = 0) {
  return new Date(now.getTime() - ((days * 24 * 60 + extraMinutes) * 60 * 1000));
}

async function ensureCategory(name, description, iconUrl = null) {
  const existing = await prisma.categoriaLoja.findFirst({ where: { nome: name, excluido_em: null } });
  if (existing) return prisma.categoriaLoja.update({
    data: { descricao: description, icone_url: existing.icone_url || iconUrl, status: "ATIVA" },
    where: { id: existing.id },
  });
  return prisma.categoriaLoja.create({ data: { descricao: description, icone_url: iconUrl, nome: name, status: "ATIVA" } });
}

async function ensureSegment({ category, icon, name, slug }) {
  return prisma.segmentoVenda.upsert({
    create: {
      atende_por_chat: true,
      categoria_loja_id: category.id,
      descricao: `Segmento ${name} da massa ${marker}.`,
      icone: icon,
      nome: name,
      negocia_pedido_por_chat: true,
      percentual_cashback: 3,
      percentual_rede: 2,
      slug,
      status: "ATIVO",
      taxa_plataforma_percentual: 10,
    },
    update: {
      atende_por_chat: true,
      categoria_loja_id: category.id,
      icone: icon,
      nome: name,
      negocia_pedido_por_chat: true,
      status: "ATIVO",
    },
    where: { slug },
  });
}

async function ensureServiceType(definition, segment) {
  const existing = await prisma.tipoServico.findFirst({
    where: { OR: [{ nome: definition.name }, { slug: definition.slug }] },
  });
  const data = {
    descricao: definition.description,
    excluido_em: null,
    icone: definition.icon,
    modo_atendimento: "NEGOCIACAO_CHAT",
    nome: definition.name,
    ordem: definition.order,
    requisitos_cadastro: definition.requirements,
    segmento_venda_id: segment.id,
    slug: definition.slug,
    status: "ATIVO",
    tipo_operacao: definition.operation,
  };
  return existing
    ? prisma.tipoServico.update({
      data: {
        descricao: existing.descricao || definition.description,
        excluido_em: null,
        icone: existing.icone || definition.icon,
        requisitos_cadastro: definition.requirements,
        segmento_venda_id: existing.segmento_venda_id ?? segment.id,
        status: "ATIVO",
        tipo_operacao: definition.operation,
      },
      where: { id: existing.id },
    })
    : prisma.tipoServico.create({ data });
}

async function ensureAddress(user, index) {
  const data = {
    bairro: ["Centro", "Jatoba", "Santo Antonio", "Belo Horizonte"][index % 4],
    cep: "58700000",
    cidade: city,
    cidade_normalizada: "patos",
    estado: state,
    latitude: -7.017 + (index * 0.0002),
    longitude: -37.274 - (index * 0.0002),
    nome_endereco: "Endereco Teste 50",
    numero: String(100 + index),
    principal: true,
    rua: `Rua Teste ${String.fromCharCode(65 + (index % 20))}`,
  };
  const existing = await prisma.enderecoUsuario.findFirst({
    where: { nome_endereco: data.nome_endereco, usuario_id: user.id },
  });
  return existing
    ? prisma.enderecoUsuario.update({ data, where: { id: existing.id } })
    : prisma.enderecoUsuario.create({ data: { ...data, usuario_id: user.id } });
}

async function ensureMerchant(user) {
  return prisma.lojista.upsert({
    create: { cpf: user.cpf, status: "ATIVO", status_kyc: "APROVADO", tipo_pessoa: "FISICA", usuario_id: user.id },
    update: { cpf: user.cpf, excluido_em: null, status: "ATIVO", status_kyc: "APROVADO" },
    where: { usuario_id: user.id },
  });
}

async function ensureSeller(user, segment) {
  return prisma.vendedor.upsert({
    create: {
      aceita_servicos: true,
      atende_agora: true,
      cpf: user.cpf,
      disponibilidade_atualizada_em: now,
      nome_publico: user.nome,
      segmento_venda_id: segment.id,
      status: "ATIVO",
      status_kyc: "APROVADO",
      tipo_pessoa: "FISICA",
      usuario_id: user.id,
    },
    update: {
      aceita_servicos: true,
      atende_agora: true,
      disponibilidade_atualizada_em: now,
      excluido_em: null,
      nome_publico: user.nome,
      segmento_venda_id: segment.id,
      status: "ATIVO",
      status_kyc: "APROVADO",
    },
    where: { usuario_id: user.id },
  });
}

async function ensureSellerService(seller, type, index) {
  return prisma.servicoVendedor.upsert({
    create: {
      categoria: type.nome,
      dados_cadastro: { seed: marker },
      descricao: `${type.nome} realizado por ${seller.nome_publico}.`,
      disponibilidade_atualizada_em: now,
      disponivel_agora: true,
      nome: type.nome,
      preco_centavos: BigInt(2500 + (index * 500)),
      status: "ATIVO",
      tipo_servico_id: type.id,
      vendedor_id: seller.id,
    },
    update: {
      disponibilidade_atualizada_em: now,
      disponivel_agora: true,
      excluido_em: null,
      status: "ATIVO",
    },
    where: { vendedor_id_tipo_servico_id: { tipo_servico_id: type.id, vendedor_id: seller.id } },
  });
}

async function ensureWalletMovements(users) {
  for (const [index, user] of users.entries()) {
    await ensureUserWallets(user.id);
    const wallets = await prisma.carteira.findMany({
      include: { tipo_carteira: true },
      where: { usuario_id: user.id },
    });
    for (const wallet of wallets) {
      const amounts = {
        cashback: 1500 + (index * 25),
        rede: 900 + (index * 40),
        saldo_pix: 6000 + (index * 175),
        vendas: ["entregador", "lojista", "prestador"].includes(user.seedRole) ? 12500 + (index * 350) : 0,
      };
      const amount = BigInt(amounts[wallet.tipo_carteira.codigo] ?? 0);
      await prisma.carteira.update({
        data: {
          saldo_bloqueado_centavos: BigInt(index % 5 === 0 ? 300 : 0),
          saldo_disponivel_centavos: amount,
          saldo_pendente_centavos: BigInt(index % 3 === 0 ? 450 : 0),
          status: "ATIVA",
        },
        where: { id: wallet.id },
      });
      const description = `[${marker}] Saldo inicial ${wallet.tipo_carteira.codigo}`;
      const existing = await prisma.lancamentoCarteira.findFirst({
        where: { carteira_id: wallet.id, descricao: description },
      });
      if (!existing) {
        await prisma.lancamentoCarteira.create({
          data: {
            carteira_id: wallet.id,
            descricao: description,
            liberado_em: pastDate(20 - (index % 10)),
            origem: "AJUSTE_ADMIN",
            saldo_anterior_centavos: 0,
            saldo_posterior_centavos: amount,
            status: "PROCESSADO",
            tipo_lancamento: "CREDITO",
            usuario_id: user.id,
            valor_centavos: amount,
          },
        });
      }
    }
  }
}

async function ensurePurchase(user, userIndex, stores) {
  const store = stores[(userIndex + 1) % stores.length];
  const product = store.products[userIndex % store.products.length];
  const quantity = (userIndex % 3) + 1;
  const subtotal = BigInt(product.preco_centavos) * BigInt(quantity);
  const deliveryFee = BigInt(790);
  const total = subtotal + deliveryFee;
  const paymentKey = `${marker}-pag-${String(userIndex + 1).padStart(2, "0")}`;
  const paidAt = pastDate((userIndex % 24) + 2);
  const payment = await prisma.pagamento.upsert({
    create: {
      gateway: "INTERNO",
      gateway_pagamento_id: paymentKey,
      loja_id: store.id,
      metodo_principal: "SALDO_PIX",
      pago_em: paidAt,
      status: "LIQUIDADO",
      usuario_pagador_id: user.id,
      valor_pago_saldo_centavos: total,
      valor_total_centavos: total,
    },
    update: { pago_em: paidAt, status: "LIQUIDADO", valor_pago_saldo_centavos: total, valor_total_centavos: total },
    where: { gateway_gateway_pagamento_id: { gateway: "INTERNO", gateway_pagamento_id: paymentKey } },
  });
  const paymentItem = await prisma.pagamentoItem.findFirst({ where: { pagamento_id: payment.id, referencia_id: `${marker}-produto-${product.id}` } });
  if (!paymentItem) await prisma.pagamentoItem.create({
    data: {
      nome_item: product.nome,
      pagamento_id: payment.id,
      quantidade: quantity,
      referencia_id: `${marker}-produto-${product.id}`,
      tipo_item: "PRODUTO",
      valor_total_centavos: subtotal,
      valor_unitario_centavos: product.preco_centavos,
    },
  });
  const orderCode = `T50${String(userIndex + 1).padStart(5, "0")}`;
  let order = await prisma.pedidoLoja.findUnique({ where: { codigo: orderCode } });
  if (!order) order = await prisma.pedidoLoja.create({
    data: {
      aceito_em: paidAt,
      chave_idempotencia: `${marker}-pedido-${user.id}`,
      codigo: orderCode,
      concluido_em: new Date(paidAt.getTime() + 75 * 60 * 1000),
      endereco_entrega_id: user.seedAddressId,
      endereco_entrega_snapshot_json: { bairro: "Centro", cep: "58700000", cidade: city, estado: state, numero: String(100 + userIndex), rua: `Rua Teste ${String.fromCharCode(65 + (userIndex % 20))}` },
      loja_id: store.id,
      observacao_cliente: `Compra automatica da massa ${marker}.`,
      pagamento_id: payment.id,
      preparando_em: new Date(paidAt.getTime() + 15 * 60 * 1000),
      saiu_entrega_em: new Date(paidAt.getTime() + 45 * 60 * 1000),
      status: "CONCLUIDO",
      subtotal_centavos: subtotal,
      taxa_entrega_centavos: deliveryFee,
      tipo_entrega: "ENTREGA",
      total_centavos: total,
      usuario_id: user.id,
      valor_pago_saldo_centavos: total,
    },
  });
  const orderItem = await prisma.pedidoLojaItem.findFirst({ where: { pedido_id: order.id, produto_id: product.id } });
  if (!orderItem) await prisma.pedidoLojaItem.create({
    data: { nome_produto: product.nome, pedido_id: order.id, produto_id: product.id, quantidade: quantity, valor_total_centavos: subtotal, valor_unitario_centavos: product.preco_centavos },
  });
  const transaction = await prisma.transacaoComercial.upsert({
    create: {
      comprador_usuario_id: user.id,
      liquidada_em: order.concluido_em,
      loja_id: store.id,
      lojista_id: store.merchantId,
      pagamento_id: payment.id,
      percentual_taxa_plataforma: 10,
      status: "LIQUIDADA",
      taxa_plataforma_centavos: total / BigInt(10),
      valor_bruto_centavos: total,
      valor_liquido_lojista_centavos: total - (total / BigInt(10)),
    },
    update: { liquidada_em: order.concluido_em, status: "LIQUIDADA" },
    where: { pagamento_id: payment.id },
  });
  await prisma.recebivel.upsert({
    create: {
      disponivel_em: order.concluido_em,
      loja_id: store.id,
      status: "DISPONIVEL",
      taxa_plataforma_centavos: total / BigInt(10),
      tipo_recebedor: "LOJISTA",
      transacao_comercial_id: transaction.id,
      usuario_recebedor_id: store.ownerUserId,
      valor_bruto_centavos: total,
      valor_liquido_centavos: total - (total / BigInt(10)),
    },
    update: { status: "DISPONIVEL" },
    where: { transacao_comercial_id_usuario_recebedor_id_tipo_recebedor: { tipo_recebedor: "LOJISTA", transacao_comercial_id: transaction.id, usuario_recebedor_id: store.ownerUserId } },
  });
  const storeConversation = await prisma.conversaLoja.upsert({
    create: { cliente_usuario_id: user.id, loja_id: store.id, status: "ABERTA", ultima_mensagem_em: paidAt },
    update: { status: "ABERTA" },
    where: { loja_id_cliente_usuario_id: { cliente_usuario_id: user.id, loja_id: store.id } },
  });
  const journeyText = `[${marker}] Pedido ${orderCode} concluido com sucesso.`;
  const journeyExists = await prisma.conversaLojaMensagem.findFirst({ where: { conversa_loja_id: storeConversation.id, mensagem: journeyText } });
  if (!journeyExists) await prisma.conversaLojaMensagem.create({
    data: { conversa_loja_id: storeConversation.id, criado_em: paidAt, lido_cliente_em: paidAt, lido_loja_em: paidAt, mensagem: journeyText, origem: "SISTEMA", tipo: "TEXTO" },
  });
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Esta seed cria dados de teste. Execute novamente acrescentando --confirm.");
  }
  await prisma.$connect();
  const passwordHash = await argon2.hash(password, { memoryCost: 19456, parallelism: 1, timeCost: 2, type: argon2.argon2id });

  const categoryDefinitions = [
    ["Mercado", "Mercados, mercearias e conveniencias.", "basket", "teste50-mercado", imageUrl("photo-1542838132-92c53300491e", 500)],
    ["Restaurantes", "Restaurantes, lanchonetes e delivery.", "restaurant", "teste50-restaurante", imageUrl("photo-1414235077428-338989a2e8c0", 500)],
    ["Casa", "Casa, construcao, ferramentas e utilidades.", "home", "teste50-casa", imageUrl("photo-1586023492125-27b2c045efd7", 500)],
    ["Beleza", "Beleza, cosmeticos e autocuidado.", "sparkles", "teste50-beleza", imageUrl("photo-1596462502278-27bfdc403348", 500)],
  ];
  const categories = [];
  const segments = [];
  for (const [name, description, icon, slug, iconUrl] of categoryDefinitions) {
    const category = await ensureCategory(name, description, iconUrl);
    categories.push(category);
    segments.push(await ensureSegment({ category, icon, name, slug }));
  }
  const serviceCategory = await ensureCategory(
    "Servicos",
    "Prestadores e profissionais disponiveis na sua cidade.",
    imageUrl("photo-1581578731548-c64695cc6952", 500),
  );
  const serviceSegment = await ensureSegment({ category: serviceCategory, icon: "construct", name: "Servicos", slug: "teste50-servicos" });
  const serviceDefinitions = [
    { description: "Entregas locais com aceite em tempo real.", icon: "bicycle", name: "Motoboy", operation: "ENTREGA_LOCAL", order: 1, requirements: { requiresDriverLicense: true, requiresPlate: true, requiresVehicle: true, vehicleKinds: ["MOTO"] }, slug: "motoboy" },
    { description: "Corridas de passageiros por moto com aceite em tempo real.", icon: "navigate", name: "Mototaxi", operation: "ENTREGA_LOCAL", order: 2, requirements: { requiresDriverLicense: true, requiresPlate: true, requiresVehicle: true, vehicleKinds: ["MOTO"] }, slug: "mototaxi" },
    { description: "Fretes, mudancas e transporte de volumes.", icon: "truck", name: "Frete", operation: "GERAL", order: 3, requirements: { requiresDriverLicense: true, requiresPlate: true, requiresVehicle: true, vehicleKinds: ["CARRO", "UTILITARIO", "CAMINHAO"] }, slug: "frete" },
    { description: "Instalacoes e manutencao eletrica.", icon: "flash", name: "Eletricista", operation: "GERAL", order: 4, requirements: {}, slug: "eletricista" },
    { description: "Limpeza residencial e comercial.", icon: "sparkles", name: "Diarista", operation: "GERAL", order: 5, requirements: {}, slug: "diarista" },
    { description: "Reparos hidraulicos e instalacoes.", icon: "construct", name: "Encanador", operation: "GERAL", order: 6, requirements: {}, slug: "encanador" },
    { description: "Montagem de moveis e pequenos reparos.", icon: "hammer", name: "Montador de moveis", operation: "GERAL", order: 7, requirements: {}, slug: "montador-de-moveis" },
    { description: "Aulas particulares e reforco escolar.", icon: "school", name: "Professor particular", operation: "GERAL", order: 8, requirements: {}, slug: "professor-particular" },
    { description: "Beleza, cabelo e cuidados pessoais.", icon: "cut", name: "Beleza em domicilio", operation: "GERAL", order: 9, requirements: {}, slug: "beleza-em-domicilio" },
  ];
  const serviceTypes = [];
  for (const definition of serviceDefinitions) serviceTypes.push(await ensureServiceType(definition, serviceSegment));

  const users = [];
  for (const [index, plan] of plans.entries()) {
    const cpf = plan.empty ? null : cpfFor(index + 1);
    const user = await prisma.usuario.upsert({
      create: {
        cidade_busca: plan.empty ? null : city,
        cpf,
        email: plan.email,
        email_verificado: true,
        estado_busca: plan.empty ? null : state,
        identificador_publico: `teste50.${plan.role}${String(plan.number).padStart(2, "0")}`,
        nivel_kyc: plan.empty ? "TIER_1" : "TIER_2",
        nome: plan.label,
        senha_hash: passwordHash,
        status: "ATIVO",
        telefone: plan.empty ? null : `8397${String(index + 1).padStart(7, "0")}`,
        telefone_verificado: !plan.empty,
      },
      update: {
        cidade_busca: plan.empty ? null : city,
        cpf,
        email_verificado: true,
        estado_busca: plan.empty ? null : state,
        identificador_publico: `teste50.${plan.role}${String(plan.number).padStart(2, "0")}`,
        nivel_kyc: plan.empty ? "TIER_1" : "TIER_2",
        nome: plan.label,
        senha_hash: passwordHash,
        status: "ATIVO",
        telefone: plan.empty ? null : `8397${String(index + 1).padStart(7, "0")}`,
        telefone_verificado: !plan.empty,
      },
      where: { email: plan.email },
    });
    user.seedRole = plan.role;
    user.seedPlan = plan;
    if (!plan.empty) {
      const address = await ensureAddress(user, index);
      user.seedAddressId = address.id;
      await prisma.kycUsuario.upsert({
        create: { cpf: user.cpf, nome_completo: user.nome, status: "APROVADO", tipo_pessoa: "FISICA", usuario_id: user.id, validado_em: now },
        update: { cpf: user.cpf, nome_completo: user.nome, status: "APROVADO", validado_em: now },
        where: { usuario_id: user.id },
      });
      await prisma.contaBancaria.upsert({
        create: { chave_pix: user.cpf, documento_titular: user.cpf, nome_titular: user.nome, principal: true, status: "ATIVA", tipo_chave: "CPF", usuario_id: user.id, validado_em: now },
        update: { documento_titular: user.cpf, nome_titular: user.nome, principal: true, status: "ATIVA", validado_em: now },
        where: { chave_pix: user.cpf },
      });
    }
    users.push(user);
  }
  const activeUsers = users.filter((user) => user.seedRole !== "vazio");

  const owners = users.filter((user) => user.seedRole === "lojista");
  const stores = [];
  for (const [index, owner] of owners.entries()) {
    const storefront = storefronts[index];
    const merchant = await ensureMerchant(owner);
    const category = categories[index % categories.length];
    const segment = segments[index % segments.length];
    const slug = `${marker}-loja-${String(index + 1).padStart(2, "0")}`;
    const store = await prisma.loja.upsert({
      create: {
        aceita_pagamento_online: true,
        aceita_qrcode: true,
        aberta_para_pedidos: true,
        banner_url: storefront.bannerUrl,
        categoria_id: category.id,
        descricao: storefront.description,
        email: owner.email,
        logo_url: storefront.logoUrl,
        lojista_id: merchant.id,
        nome: storefront.name,
        segmento_venda_id: segment.id,
        slug,
        status: "ATIVA",
        taxa_entrega_centavos: 790,
        telefone: owner.telefone,
        visivel_no_app: true,
        whatsapp: owner.telefone,
      },
      update: {
        aberta_para_pedidos: true,
        banner_url: storefront.bannerUrl,
        categoria_id: category.id,
        descricao: storefront.description,
        excluido_em: null,
        logo_url: storefront.logoUrl,
        nome: storefront.name,
        segmento_venda_id: segment.id,
        status: "ATIVA",
        visivel_no_app: true,
      },
      where: { slug },
    });
    await prisma.enderecoLoja.upsert({
      create: { bairro: "Centro", cep: "58700000", cidade: city, cidade_normalizada: "patos", estado: state, latitude: -7.02 + index * 0.001, loja_id: store.id, longitude: -37.27 - index * 0.001, numero: String(20 + index), rua: `Avenida Comercial ${index + 1}` },
      update: { bairro: "Centro", cidade: city, cidade_normalizada: "patos", estado: state },
      where: { loja_id: store.id },
    });
    const products = [];
    const catalog = catalogs[storefront.category];
    for (let productIndex = 1; productIndex <= 6; productIndex += 1) {
      const [productName, productDescription, productPhotoId] = catalog[productIndex - 1];
      const sku = `T50-L${index + 1}-P${productIndex}`;
      const productData = {
        aceita_entrega: true,
        aceita_retirada: true,
        descricao: productDescription,
        destaque: productIndex <= 2,
        estoque_controlado: true,
        estoque_quantidade: 50 + productIndex,
        imagem_url: imageUrl(productPhotoId, 1000),
        loja_id: store.id,
        nome: productName,
        ordem: productIndex,
        preco_centavos: BigInt(1290 + (index * 500) + (productIndex * 700)),
        resumo_curto: productDescription,
        sku,
        status: "ATIVO",
      };
      const existing = await prisma.produtoLoja.findFirst({ where: { loja_id: store.id, sku } });
      products.push(existing
        ? await prisma.produtoLoja.update({ data: productData, where: { id: existing.id } })
        : await prisma.produtoLoja.create({ data: productData }));
    }
    stores.push({ ...store, merchantId: merchant.id, ownerUserId: owner.id, products });
  }

  // Versoes anteriores desta seed criavam categorias visiveis com o sufixo
  // "Teste 50". Depois de mover as lojas para categorias reais, escondemos
  // esses registros antigos para limpar imediatamente a vitrine da busca.
  await prisma.categoriaLoja.updateMany({
    data: { excluido_em: now, status: "INATIVA" },
    where: {
      nome: {
        in: [
          "Mercado Teste 50",
          "Restaurante Teste 50",
          "Casa Teste 50",
          "Beleza Teste 50",
          "Servicos Teste 50",
        ],
      },
    },
  });

  const couriers = [];
  for (const [index, user] of users.filter((item) => item.seedRole === "entregador").entries()) {
    const seller = await ensureSeller(user, serviceSegment);
    const courier = await prisma.motoboy.upsert({
      create: { aceita_chamadas_plataforma: true, cidade_base: city, cnh: `880000${String(index + 1).padStart(5, "0")}`, cor_moto: ["Preta", "Vermelha", "Branca", "Azul", "Cinza"][index], estado_base: state, modelo_moto: ["Honda CG 160", "Honda Pop 110", "Yamaha Factor", "Honda Biz", "Yamaha Fazer"][index], nome_exibicao: user.nome, placa: `TST${index + 1}A${String(index + 1).padStart(2, "0")}`, raio_atendimento_km: 35, status: "ATIVO", telefone_contato: user.telefone, total_entregas: 12 + index * 7, vendedor_id: seller.id },
      update: { aceita_chamadas_plataforma: true, cidade_base: city, estado_base: state, nome_exibicao: user.nome, status: "ATIVO" },
      where: { vendedor_id: seller.id },
    });
    await ensureSellerService(seller, serviceTypes[0], index);
    await ensureSellerService(seller, serviceTypes[1], index);
    couriers.push({ courier, seller, user });
  }

  const providers = [];
  for (const [index, user] of users.filter((item) => item.seedRole === "prestador").entries()) {
    const seller = await ensureSeller(user, serviceSegment);
    const assigned = [serviceTypes[2 + (index % 7)], serviceTypes[2 + ((index + 2) % 7)]];
    const services = [];
    for (const type of assigned) services.push({ service: await ensureSellerService(seller, type, index), type });
    providers.push({ seller, services, user });
  }

  for (const [index, store] of stores.entries()) {
    const staff = activeUsers[(index + 20) % activeUsers.length];
    if (staff.id !== store.ownerUserId) await prisma.usuarioLoja.upsert({
      create: { cargo: index % 2 ? "ATENDENTE" : "GERENTE", loja_id: store.id, permissoes: { chats: true, orders: true }, status: "ATIVO", usuario_id: staff.id },
      update: { status: "ATIVO" },
      where: { loja_id_usuario_id: { loja_id: store.id, usuario_id: staff.id } },
    });
    for (const courier of couriers.filter((_, courierIndex) => (courierIndex + index) % 2 === 0)) await prisma.motoboyLoja.upsert({
      create: { ativo: true, loja_id: store.id, motoboy_id: courier.courier.id },
      update: { ativo: true },
      where: { loja_id_motoboy_id: { loja_id: store.id, motoboy_id: courier.courier.id } },
    });
  }

  await ensureWalletMovements(activeUsers);

  const inviteCodes = new Map();
  for (const [index, user] of activeUsers.entries()) {
    const invitation = await prisma.codigoConvite.upsert({
      create: { ativo: true, codigo: `T50${String(index + 1).padStart(5, "0")}`, usuario_id: user.id, usos_totais: index < 23 ? 2 : 0 },
      update: { ativo: true },
      where: { codigo: `T50${String(index + 1).padStart(5, "0")}` },
    });
    inviteCodes.set(user.id, invitation);
  }
  for (let index = 1; index < activeUsers.length; index += 1) {
    const user = activeUsers[index];
    const parent = activeUsers[Math.floor((index - 1) / 2)];
    const type = user.seedRole === "lojista" ? "LOJISTA" : ["entregador", "prestador"].includes(user.seedRole) ? "VENDEDOR" : "CONSUMIDOR";
    const firstSaleAt = ["LOJISTA", "VENDEDOR"].includes(type) ? pastDate(12) : null;
    await prisma.indicacao.upsert({
      create: { alocado_sob_usuario_id: parent.id, codigo_convite_id: inviteCodes.get(parent.id).id, indicado_usuario_id: user.id, indicador_usuario_id: parent.id, nivel_matriz: Math.floor(Math.log2(index + 1)), origem: marker, posicao_matriz: (index - 1) % 2, primeira_compra_em: pastDate(15), primeira_venda_em: firstSaleAt, status: "CONVERTIDA", tipo_indicacao: type },
      update: { alocado_sob_usuario_id: parent.id, codigo_convite_id: inviteCodes.get(parent.id).id, indicador_usuario_id: parent.id, nivel_matriz: Math.floor(Math.log2(index + 1)), origem: marker, posicao_matriz: (index - 1) % 2, primeira_compra_em: pastDate(15), primeira_venda_em: firstSaleAt, status: "CONVERTIDA", tipo_indicacao: type },
      where: { indicado_usuario_id: user.id },
    });
  }

  const contactRows = [];
  for (let left = 0; left < activeUsers.length; left += 1) for (let right = left + 1; right < activeUsers.length; right += 1) {
    const pair = [activeUsers[left], activeUsers[right]].sort((a, b) => a.id - b.id);
    contactRows.push({ aceito_em: pastDate((left + right) % 20), solicitado_por_id: pair[0].id, status: "ATIVA", ultima_mensagem_em: pastDate((left + right) % 10), usuario_a_id: pair[0].id, usuario_b_id: pair[1].id });
  }
  await prisma.conversaPessoal.createMany({ data: contactRows, skipDuplicates: true });
  const userIds = activeUsers.map((user) => user.id);
  const conversations = await prisma.conversaPessoal.findMany({ where: { usuario_a_id: { in: userIds }, usuario_b_id: { in: userIds } } });
  const contactText = `[${marker}] Contato de homologacao conectado.`;
  const messagedConversationIds = new Set((await prisma.conversaPessoalMensagem.findMany({ select: { conversa_id: true }, where: { conversa_id: { in: conversations.map((item) => item.id) }, mensagem: contactText } })).map((item) => item.conversa_id));
  await prisma.conversaPessoalMensagem.createMany({
    data: conversations.filter((conversation) => !messagedConversationIds.has(conversation.id)).map((conversation) => ({ autor_usuario_id: conversation.solicitado_por_id, conversa_id: conversation.id, lido_em: now, mensagem: contactText })),
  });

  for (const [index, user] of activeUsers.entries()) await ensurePurchase(user, index, stores);

  for (const [index, provider] of providers.entries()) {
    const client = activeUsers[(index + 27) % activeUsers.length];
    const { service, type } = provider.services[0];
    const tag = `[${marker}:servico:${index + 1}]`;
    let conversation = await prisma.conversaServico.findFirst({ where: { descricao_inicial: { startsWith: tag } } });
    if (!conversation) conversation = await prisma.conversaServico.create({
      data: { cliente_usuario_id: client.id, descricao_inicial: `${tag} Atendimento concluido para teste.`, encerrado_em: pastDate(index + 2), segmento_venda_id: type.segmento_venda_id, servico_vendedor_id: service.id, status: "ENCERRADA", vendedor_id: provider.seller.id, visualizado_vendedor_em: pastDate(index + 3) },
    });
    const hasMessage = await prisma.conversaServicoMensagem.findFirst({ where: { conversa_servico_id: conversation.id, mensagem: { contains: tag } } });
    if (!hasMessage) await prisma.conversaServicoMensagem.createMany({ data: [
      { autor_usuario_id: client.id, conversa_servico_id: conversation.id, lido_cliente_em: now, lido_vendedor_em: now, mensagem: `${tag} Preciso deste servico.`, origem: "CLIENTE" },
      { autor_usuario_id: provider.user.id, conversa_servico_id: conversation.id, lido_cliente_em: now, lido_vendedor_em: now, mensagem: "Atendimento realizado com sucesso.", origem: "VENDEDOR" },
    ] });
  }

  for (const [index, item] of couriers.entries()) {
    const client = activeUsers[(index + 33) % activeUsers.length];
    const type = serviceTypes[index % 2];
    const sellerService = await prisma.servicoVendedor.findUnique({ where: { vendedor_id_tipo_servico_id: { tipo_servico_id: type.id, vendedor_id: item.seller.id } } });
    const tag = `[${marker}:corrida:${index + 1}]`;
    let conversation = await prisma.conversaServico.findFirst({ where: { descricao_inicial: { startsWith: tag } } });
    if (!conversation) conversation = await prisma.conversaServico.create({
      data: { cliente_usuario_id: client.id, descricao_inicial: `${tag} Corrida historica de ${type.nome}.`, destino: "Shopping de Patos", encerrado_em: pastDate(index + 1), origem: "Centro de Patos", segmento_venda_id: type.segmento_venda_id, servico_vendedor_id: sellerService.id, status: "ENCERRADA", vendedor_id: item.seller.id, visualizado_vendedor_em: pastDate(index + 2) },
    });
    await prisma.solicitacaoMotoboy.upsert({
      create: { aceito_em: pastDate(index + 2), conversa_servico_id: conversation.id, destino: "Shopping de Patos", expira_em: pastDate(index), motoboy_aceite_id: item.courier.id, origem: "Centro de Patos", solicitante_usuario_id: client.id, status: "CONCLUIDA", tipo_chamada: "PLATAFORMA", tipo_servico_id: type.id },
      update: { motoboy_aceite_id: item.courier.id, status: "CONCLUIDA" },
      where: { conversa_servico_id: conversation.id },
    });
  }

  const count = await prisma.usuario.count({ where: { email: { in: plans.map((plan) => plan.email) } } });
  if (count !== 50) throw new Error(`A massa deveria conter 50 usuarios, mas contem ${count}.`);
  console.log(`\n[seed-test-50] ${count} usuarios prontos. Senha comum: ${password}`);
  for (const plan of plans) console.log(`${plan.email} | ${plan.role}${plan.empty ? " | VAZIO" : ""}`);
  console.log(`\n[seed-test-50] ${stores.length} lojas, ${serviceTypes.length} tipos de servico, ${couriers.length} entregadores e ${conversations.length} contatos criados.`);
}

main()
  .catch((error) => {
    console.error("[seed-test-50] Falha ao criar a massa:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
