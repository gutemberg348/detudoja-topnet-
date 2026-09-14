import { randomUUID } from "crypto";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import argon2 from "argon2";
import sharp from "sharp";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/prisma.js";
import { uploadsBasePath, uploadsRoot } from "../src/config/storage.js";
import { ensureUserWallets } from "../src/modules/wallet/wallet.service.js";

const demoPassword = process.env.DEMO_SEED_PASSWORD?.trim();
const defaultSegmentFeePercent = 10;
const bundledAssetsRoot = process.env.DEMO_ASSETS_DIR
  ? path.resolve(process.env.DEMO_ASSETS_DIR)
  : path.resolve(uploadsRoot, "curated");
const demoCityAddress = {
  bairro: "Centro",
  cep: "58700000",
  cidade: "Patos",
  cidade_normalizada: "patos",
  estado: "PB",
  numero: "100",
  rua: "Rua Principal",
};

const demoSegments = [
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
    description: "Servicos gerais, reparos, manutencao e mao de obra local.",
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
    description: "Beleza, estetica, barbearia, manicure e cuidados pessoais.",
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
    description: "Tecnologia, eletronicos, celulares e acessorios.",
    iconName: "desktop",
    name: "Eletronicos",
    sortOrder: 10,
  },
  {
    description: "Lojas de conveniencia, itens rapidos, bebidas e snacks.",
    iconName: "basket",
    name: "Conveniencias",
    sortOrder: 11,
  },
  {
    description: "Produtos e servicos especializados para animais.",
    iconName: "paw",
    name: "Pet",
    sortOrder: 12,
  },
];

const demoCategories = [
  ["Restaurantes", "Comida pronta, lanches, marmitas e delivery local.", "Restaurantes"],
  ["Mercados", "Mercados, mercearias, hortifrutis e conveniencias.", "Mercado"],
  ["Farmacias", "Farmacias, drogarias e produtos de saude.", "Farmacia"],
  ["Conveniencias", "Itens rapidos, bebidas, snacks e compras de bairro.", "Conveniencias"],
  ["Servicos", "Servicos locais, reparos, manutencao e mao de obra.", "Servicos"],
  ["Moda", "Roupas, calcados, presentes e acessorios.", "Moda"],
  ["Pet", "Produtos e servicos para pets.", "Pet"],
  ["Beleza", "Salao, barbearia, estetica e autocuidado.", "Beleza"],
  ["Casa", "Casa, construcao, decoracao e utilidades.", "Casa"],
  ["Eletronicos", "Tecnologia, celulares, informatica e acessorios.", "Eletronicos"],
].map(([name, description, segmentName], index) => ({
  description,
  imageIndex: index,
  name,
  segmentName,
}));

const demoUsers = Array.from({ length: 10 }, (_, index) => {
  const number = index + 1;

  return {
    cpf: String(70000000000 + number),
    email: `demo${number}@detudoja.local`,
    inviteCode: `DEMO${number}`,
    name: `Usuario Demo ${number}`,
    phone: String(11998000000 + number),
  };
});

const demoStores = [
  {
    categoryName: "Restaurantes",
    description: "Comida caseira, lanches e combos para retirada ou entrega.",
    name: "Cafe Central",
    products: [
      ["Combo Cafe Central", "Cafe, pao de queijo e suco natural.", 2490],
      ["Marmita Executiva", "Arroz, feijao, salada e proteina do dia.", 2990],
      ["Burger Artesanal", "Hamburguer artesanal com batata rustica.", 3490],
    ],
    slug: "demo-cafe-central",
  },
  {
    categoryName: "Mercados",
    description: "Mercado de bairro com produtos do dia e ofertas rapidas.",
    name: "Mercado Bom Preco",
    products: [
      ["Cesta Basica Compacta", "Itens essenciais para a semana.", 8990],
      ["Kit Hortifruti", "Frutas, legumes e verduras selecionados.", 4590],
      ["Combo Limpeza", "Sabao, detergente e desinfetante.", 3990],
    ],
    slug: "demo-mercado-bom-preco",
  },
  {
    categoryName: "Farmacias",
    description: "Farmacia local com produtos de saude, beleza e bem-estar.",
    name: "Farma Mais",
    products: [
      ["Kit Higiene", "Itens de cuidado pessoal para o dia a dia.", 2990],
      ["Vitamina C", "Suplemento de vitamina C com 60 capsulas.", 4990],
      ["Protetor Solar", "Protecao facial FPS 50.", 5990],
    ],
    slug: "demo-farma-mais",
  },
  {
    categoryName: "Moda",
    description: "Roupas, acessorios e looks prontos para varias ocasioes.",
    name: "Loja Melo",
    products: [
      ["Camiseta Premium", "Camiseta basica em algodao.", 6990],
      ["Bolsa Casual", "Bolsa compacta para uso diario.", 11990],
      ["Kit Acessorios", "Pulseira, colar e brinco combinados.", 7990],
    ],
    slug: "demo-loja-melo",
  },
  {
    categoryName: "Beleza",
    description: "Produtos e servicos para beleza, cuidado e autoestima.",
    name: "Studio Bella",
    products: [
      ["Escova Modelada", "Servico de escova com finalizacao.", 5990],
      ["Kit Skincare", "Rotina basica de cuidado facial.", 12990],
      ["Design de Sobrancelha", "Design personalizado com acabamento.", 3990],
    ],
    slug: "demo-studio-bella",
  },
  {
    categoryName: "Eletronicos",
    description: "Acessorios para celular, informatica e tecnologia para o dia a dia.",
    name: "Loja de Informatica",
    products: [
      ["Carregador Turbo USB-C", "Carregador rapido com cabo USB-C incluso.", 8990],
    ],
    slug: "demo-loja-informatica",
  },
  {
    categoryName: "Casa",
    description: "Materiais para construcao, reforma e acabamento da sua casa.",
    name: "Casa Forte Materiais",
    products: [
      ["Telha Ceramica", "Telha ceramica resistente para cobertura residencial.", 249],
      ["Piso Ceramico", "Piso ceramico para ambientes internos, vendido por metro quadrado.", 3490],
      ["Porcelanato Acetinado", "Porcelanato acetinado de acabamento moderno.", 6990],
    ],
    slug: "demo-casa-forte",
  },
];

const imageColors = [
  "#16A34A",
  "#0F766E",
  "#0284C7",
  "#7C3AED",
  "#DB2777",
  "#F97316",
  "#0891B2",
  "#65A30D",
  "#475569",
  "#0F172A",
];

const curatedCategoryMedia = {
  Beleza: "categories/beleza.webp",
  Casa: "categories/casa.webp",
  Conveniencias: "categories/conveniencias.webp",
  Eletronicos: "categories/eletronicos.webp",
  Farmacias: "categories/farmacias.webp",
  Mercados: "categories/mercados.webp",
  Moda: "categories/moda.webp",
  Pet: "categories/pet.webp",
  Restaurantes: "categories/restaurantes.webp",
  Servicos: "categories/servicos.webp",
};

const curatedStoreMedia = {
  "demo-cafe-central": {
    banner: "stores/demo-cafe-central/banner.webp",
    logo: "categories/restaurantes.webp",
  },
  "demo-farma-mais": {
    banner: "stores/demo-farma-mais/banner.webp",
    logo: "categories/farmacias.webp",
  },
  "demo-loja-melo": {
    banner: "stores/loja-de-roupas-melo/banner.webp",
    logo: "categories/moda.webp",
  },
  "demo-mercado-bom-preco": {
    banner: "stores/demo-mercado-bom-preco/banner.webp",
    logo: "categories/mercados.webp",
  },
  "demo-studio-bella": {
    banner: "stores/demo-studio-bella/banner.webp",
    logo: "categories/beleza.webp",
  },
  "demo-loja-informatica": {
    banner: "stores/loja-de-informatica/banner.webp",
    logo: "categories/eletronicos.webp",
  },
  "demo-casa-forte": {
    banner: "stores/mercado-pires/banner.webp",
    logo: "categories/casa.webp",
  },
};

const curatedProductMedia = {
  "Bolsa Casual": "products/bolsa-casual.webp",
  "Burger Artesanal": "products/burger-artesanal.webp",
  "Camiseta Premium": "products/camiseta-premium.webp",
  "Cesta Basica Compacta": "products/cesta-basica-compacta.webp",
  "Carregador Turbo USB-C": "products/carregador.webp",
  "Combo Cafe Central": "products/combo-cafe-central.webp",
  "Combo Limpeza": "products/combo-limpeza.webp",
  "Design de Sobrancelha": "products/design-de-sobrancelha.webp",
  "Escova Modelada": "products/escova-modelada.webp",
  "Kit Acessorios": "products/kit-acessorios.webp",
  "Kit Higiene": "products/kit-higiene.webp",
  "Kit Hortifruti": "products/kit-hortifruti.webp",
  "Kit Skincare": "products/kit-skincare.webp",
  "Marmita Executiva": "products/marmita-executiva.webp",
  "Piso Ceramico": "products/ceramica.webp",
  "Porcelanato Acetinado": "products/porcelanato.webp",
  "Protetor Solar": "products/protetor-solar.webp",
  "Telha Ceramica": "products/telha.webp",
  "Vitamina C": "products/vitamina-c.webp",
};

async function installCuratedAssets() {
  const destination = path.resolve(uploadsRoot, "curated");

  if (bundledAssetsRoot === destination) {
    return;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await cp(bundledAssetsRoot, destination, { force: true, recursive: true });
}

function publicUploadPath(relativePath) {
  return `${uploadsBasePath}/${relativePath.split(path.sep).join("/")}`;
}

function curatedUploadPath(relativePath) {
  return publicUploadPath(path.join("curated", relativePath));
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function createDemoImage({ folder, height, index, text, width }) {
  const safeName = slugify(text) || `imagem-${index}`;
  const relativePath = path.join("demo", ...folder, `${safeName}.webp`);
  const absolutePath = path.resolve(uploadsRoot, relativePath);
  const color = imageColors[index % imageColors.length];
  const escapedText = escapeXml(text);
  const fontSize = Math.max(34, Math.round(Math.min(width, height) / 9));
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="${Math.round(Math.min(width, height) * 0.08)}" fill="${color}"/>
      <circle cx="${Math.round(width * 0.82)}" cy="${Math.round(height * 0.22)}" r="${Math.round(Math.min(width, height) * 0.18)}" fill="#FFFFFF" opacity="0.16"/>
      <circle cx="${Math.round(width * 0.18)}" cy="${Math.round(height * 0.82)}" r="${Math.round(Math.min(width, height) * 0.16)}" fill="#FFFFFF" opacity="0.12"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800">${escapedText}</text>
    </svg>
  `;

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await sharp(Buffer.from(svg)).webp({ effort: 4, quality: 82 }).toFile(absolutePath);

  return publicUploadPath(relativePath);
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function hashPassword(value) {
  return argon2.hash(value, {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });
}

async function ensureCompanyRootUser(database) {
  const email = env.companyRoot.email.trim().toLowerCase();
  const existingUser = await database.usuario.findUnique({
    where: { email },
  });

  if (existingUser) {
    return database.usuario.update({
      data: {
        email_verificado: true,
        excluido_em: null,
        nivel_kyc: "TIER_2",
        status: "ATIVO",
        tipo_conta: "ADMIN",
        kyc: {
          upsert: {
            create: {
              nome_fantasia: env.companyRoot.name,
              razao_social: env.companyRoot.name,
              status: "APROVADO",
              tipo_pessoa: "JURIDICA",
              validado_em: new Date(),
            },
            update: {
              nome_fantasia: env.companyRoot.name,
              razao_social: env.companyRoot.name,
              status: "APROVADO",
              tipo_pessoa: "JURIDICA",
              validado_em: new Date(),
            },
          },
        },
      },
      where: { id: existingUser.id },
    });
  }

  const passwordHash = await hashPassword(randomUUID());

  return database.usuario.create({
    data: {
      email,
      email_verificado: true,
      kyc: {
        create: {
          nome_fantasia: env.companyRoot.name,
          razao_social: env.companyRoot.name,
          status: "APROVADO",
          tipo_pessoa: "JURIDICA",
        },
      },
      nivel_kyc: "TIER_2",
      nome: env.companyRoot.name,
      senha_hash: passwordHash,
      status: "ATIVO",
      tipo_conta: "ADMIN",
    },
  });
}

async function seedSegments(database) {
  for (const segment of demoSegments) {
    await database.segmentoVenda.upsert({
      create: {
        atende_por_chat: false,
        descricao: segment.description,
        icone: segment.iconName,
        nome: segment.name,
        ordem: segment.sortOrder,
        slug: slugify(segment.name),
        status: "ATIVO",
        taxa_plataforma_percentual: defaultSegmentFeePercent,
      },
      update: {
        atende_por_chat: false,
        descricao: segment.description,
        icone: segment.iconName,
        nome: segment.name,
        ordem: segment.sortOrder,
        status: "ATIVO",
      },
      where: { slug: slugify(segment.name) },
    });
  }
}

async function seedServiceTypes(database) {
  const servicesSegment = await database.segmentoVenda.findUnique({
    select: { id: true },
    where: { slug: slugify("Servicos") },
  });

  await database.tipoServico.updateMany({
    data: { status: "INATIVO" },
    where: { excluido_em: null, slug: "entregador" },
  });

  for (const [index, service] of [
    ["Frete", "Transporte de cargas e mudancas negociado pelo chat.", "car", "GERAL"],
    ["Motoboy", "Corridas e entregas locais solicitadas por clientes ou lojas.", "bicycle", "ENTREGA_LOCAL"],
  ].entries()) {
    await database.tipoServico.upsert({
      create: { descricao: service[1], icone: service[2], modo_atendimento: "NEGOCIACAO_CHAT", nome: service[0], ordem: index + 1, segmento_venda_id: servicesSegment?.id ?? null, slug: slugify(service[0]), status: "ATIVO", tipo_operacao: service[3] },
      update: { descricao: service[1], icone: service[2], modo_atendimento: "NEGOCIACAO_CHAT", ordem: index + 1, segmento_venda_id: servicesSegment?.id ?? null, status: "ATIVO", tipo_operacao: service[3] },
      where: { slug: slugify(service[0]) },
    });
  }
}

async function seedCategories(database) {
  const categoriesByName = new Map();

  for (const [index, category] of demoCategories.entries()) {
    const curatedIcon = curatedCategoryMedia[category.name];
    const iconUrl = curatedIcon
      ? curatedUploadPath(curatedIcon)
      : await createDemoImage({
          folder: ["categorias"],
          height: 512,
          index: category.imageIndex ?? index,
          text: category.name,
          width: 512,
        });
    const existingCategory = await database.categoriaLoja.findFirst({
      where: { nome: category.name },
    });
    const segment = await database.segmentoVenda.findUnique({
      select: { id: true },
      where: { slug: slugify(category.segmentName) },
    });

    if (!segment) {
      throw new Error(`Segmento nao encontrado para categoria demo: ${category.name}`);
    }
    const savedCategory = existingCategory
      ? await database.categoriaLoja.update({
          data: {
            descricao: category.description,
            excluido_em: null,
            icone_url: iconUrl,
            segmento_venda_id: segment.id,
            status: "ATIVA",
          },
          where: { id: existingCategory.id },
        })
      : await database.categoriaLoja.create({
          data: {
            descricao: category.description,
            icone_url: iconUrl,
            nome: category.name,
            segmento_venda_id: segment.id,
            status: "ATIVA",
          },
        });

    categoriesByName.set(category.name, savedCategory);

    await database.segmentoVenda.update({
      data: {
        categoria_loja_id: savedCategory.id,
        negocia_pedido_por_chat: savedCategory.negocia_pedido_por_chat,
      },
      where: { id: segment.id },
    });
  }

  return categoriesByName;
}

async function seedUsers(database, passwordHash) {
  const users = [];

  for (const item of demoUsers) {
    const user = await database.usuario.upsert({
      create: {
        cpf: item.cpf,
        email: item.email,
        email_verificado: true,
        nivel_kyc: "TIER_2",
        nome: item.name,
        senha_hash: passwordHash,
        status: "ATIVO",
        telefone: item.phone,
        telefone_verificado: true,
        tipo_conta: "CONSUMIDOR",
      },
      update: {
        cpf: item.cpf,
        email_verificado: true,
        excluido_em: null,
        nivel_kyc: "TIER_2",
        nome: item.name,
        senha_hash: passwordHash,
        status: "ATIVO",
        telefone: item.phone,
        telefone_verificado: true,
        tipo_conta: "CONSUMIDOR",
      },
      where: { email: item.email },
    });

    await database.kycUsuario.upsert({
      create: {
        cpf: item.cpf,
        nome_completo: item.name,
        status: "APROVADO",
        tipo_pessoa: "FISICA",
        usuario_id: user.id,
        validado_em: new Date(),
      },
      update: {
        cpf: item.cpf,
        nome_completo: item.name,
        status: "APROVADO",
        tipo_pessoa: "FISICA",
        validado_em: new Date(),
      },
      where: { usuario_id: user.id },
    });

    const address = await database.enderecoUsuario.findFirst({
      orderBy: [{ principal: "desc" }, { criado_em: "asc" }],
      where: { excluido_em: null, usuario_id: user.id },
    });
    if (address) {
      await database.enderecoUsuario.update({
        data: { ...demoCityAddress, principal: true },
        where: { id: address.id },
      });
    } else {
      await database.enderecoUsuario.create({
        data: { ...demoCityAddress, nome_endereco: "Endereco principal", principal: true, usuario_id: user.id },
      });
    }

    await database.codigoConvite.upsert({
      create: {
        ativo: true,
        codigo: item.inviteCode,
        usuario_id: user.id,
      },
      update: {
        ativo: true,
        usuario_id: user.id,
      },
      where: { codigo: item.inviteCode },
    });

    await ensureUserWallets(user.id, database);
    users.push(user);
  }

  return users;
}

async function loadMatrixChildren(database) {
  const indications = await database.indicacao.findMany({
    orderBy: [{ posicao_matriz: "asc" }, { criado_em: "asc" }],
    select: {
      alocado_sob_usuario_id: true,
      indicado_usuario_id: true,
      nivel_matriz: true,
      posicao_matriz: true,
    },
    where: {
      alocado_sob_usuario_id: { not: null },
    },
  });
  const childrenByParent = new Map();
  const levelByUser = new Map();

  for (const indication of indications) {
    const children = childrenByParent.get(indication.alocado_sob_usuario_id) ?? [];
    const child = {
      level: indication.nivel_matriz ?? 1,
      position: indication.posicao_matriz ?? children.length + 1,
      userId: indication.indicado_usuario_id,
    };

    children.push(child);
    children.sort((first, second) => first.position - second.position);
    childrenByParent.set(indication.alocado_sob_usuario_id, children);
    levelByUser.set(indication.indicado_usuario_id, child.level);
  }

  return { childrenByParent, levelByUser };
}

function findFirstOpenPlacement(rootUserId, matrix) {
  const queue = [
    {
      depth: 0,
      level: matrix.levelByUser.get(rootUserId) ?? 0,
      userId: rootUserId,
    },
  ];

  while (queue.length > 0) {
    const node = queue.shift();

    if (node.depth >= 20) {
      continue;
    }

    const children = matrix.childrenByParent.get(node.userId) ?? [];
    const occupiedPositions = new Set(children.map((child) => child.position));
    const position = [1, 2].find((candidate) => !occupiedPositions.has(candidate));

    if (position) {
      return {
        level: node.level + 1,
        parentUserId: node.userId,
        position,
      };
    }

    for (const child of children) {
      queue.push({
        depth: node.depth + 1,
        level: child.level ?? node.level + 1,
        userId: child.userId,
      });
    }
  }

  throw new Error("Matriz 2x20 da empresa esta completa para a seed demo.");
}

async function seedNetwork(database, companyRoot, users) {
  const matrix = await loadMatrixChildren(database);
  const directSponsors = [
    companyRoot.id,
    users[0].id,
    users[0].id,
    companyRoot.id,
    users[3].id,
    users[3].id,
    users[1].id,
    users[1].id,
    users[2].id,
    users[2].id,
  ];

  for (const [index, user] of users.entries()) {
    const existingIndication = await database.indicacao.findUnique({
      where: { indicado_usuario_id: user.id },
    });
    const directSponsorId = directSponsors[index] ?? companyRoot.id;
    const placement = existingIndication?.alocado_sob_usuario_id
      ? null
      : findFirstOpenPlacement(companyRoot.id, matrix);

    await database.indicacao.upsert({
      create: {
        alocado_sob_usuario_id: placement.parentUserId,
        indicado_usuario_id: user.id,
        indicador_usuario_id: directSponsorId,
        nivel_matriz: placement.level,
        origem: "seed_demo",
        posicao_matriz: placement.position,
        status: "ATIVA",
        tipo_indicacao: "CONSUMIDOR",
      },
      update: {
        ...(placement
          ? {
              alocado_sob_usuario_id: placement.parentUserId,
              nivel_matriz: placement.level,
              posicao_matriz: placement.position,
            }
          : {}),
        indicador_usuario_id: directSponsorId,
        origem: "seed_demo",
        status: "ATIVA",
        tipo_indicacao: "CONSUMIDOR",
      },
      where: { indicado_usuario_id: user.id },
    });

    if (placement) {
      const children = matrix.childrenByParent.get(placement.parentUserId) ?? [];

      children.push({
        level: placement.level,
        position: placement.position,
        userId: user.id,
      });
      children.sort((first, second) => first.position - second.position);
      matrix.childrenByParent.set(placement.parentUserId, children);
      matrix.levelByUser.set(user.id, placement.level);
    }
  }
}

async function seedStores(database, categoriesByName, users) {
  for (const [index, storeSeed] of demoStores.entries()) {
    const owner = users[index];
    const category = categoriesByName.get(storeSeed.categoryName);
    const curatedStore = curatedStoreMedia[storeSeed.slug];
    const bannerUrl = curatedStore?.banner
      ? curatedUploadPath(curatedStore.banner)
      : await createDemoImage({
          folder: ["lojas", storeSeed.slug, "banner"],
          height: 480,
          index: index + 3,
          text: storeSeed.name,
          width: 1280,
        });
    const logoUrl = curatedStore?.logo
      ? curatedUploadPath(curatedStore.logo)
      : await createDemoImage({
          folder: ["lojas", storeSeed.slug, "logo"],
          height: 512,
          index: index + 5,
          text: storeSeed.name,
          width: 512,
        });

    if (!category) {
      throw new Error(`Categoria nao encontrada para loja demo: ${storeSeed.categoryName}`);
    }

    const lojista = await database.lojista.upsert({
      create: {
        cpf: owner.cpf,
        nome_fantasia: storeSeed.name,
        status: "ATIVO",
        status_kyc: "APROVADO",
        tipo_pessoa: "FISICA",
        usuario_id: owner.id,
      },
      update: {
        cpf: owner.cpf,
        excluido_em: null,
        nome_fantasia: storeSeed.name,
        status: "ATIVO",
        status_kyc: "APROVADO",
        tipo_pessoa: "FISICA",
      },
      where: { usuario_id: owner.id },
    });

    const store = await database.loja.upsert({
      create: {
        aceita_pagamento_online: true,
        aceita_qrcode: true,
        banner_url: bannerUrl,
        categoria_id: category.id,
        descricao: storeSeed.description,
        email: owner.email,
        logo_url: logoUrl,
        lojista_id: lojista.id,
        nome: storeSeed.name,
        segmento_venda_id: category.segmento_venda_id,
        slug: storeSeed.slug,
        status: "ATIVA",
        telefone: owner.telefone,
        visivel_no_app: true,
        whatsapp: owner.telefone,
      },
      update: {
        aceita_pagamento_online: true,
        aceita_qrcode: true,
        banner_url: bannerUrl,
        categoria_id: category.id,
        descricao: storeSeed.description,
        email: owner.email,
        excluido_em: null,
        logo_url: logoUrl,
        lojista_id: lojista.id,
        nome: storeSeed.name,
        segmento_venda_id: category.segmento_venda_id,
        status: "ATIVA",
        telefone: owner.telefone,
        visivel_no_app: true,
        whatsapp: owner.telefone,
      },
      where: { slug: storeSeed.slug },
    });

    await database.enderecoLoja.upsert({
      create: { ...demoCityAddress, loja_id: store.id },
      update: demoCityAddress,
      where: { loja_id: store.id },
    });

    await database.usuarioLoja.upsert({
      create: {
        cargo: "DONO",
        loja_id: store.id,
        permissoes: { all: true },
        status: "ATIVO",
        usuario_id: owner.id,
      },
      update: {
        cargo: "DONO",
        permissoes: { all: true },
        status: "ATIVO",
      },
      where: {
        loja_id_usuario_id: {
          loja_id: store.id,
          usuario_id: owner.id,
        },
      },
    });

    await database.produtoLoja.deleteMany({
      where: { loja_id: store.id },
    });

    const productData = [];

    for (const [productIndex, [name, description, priceCents]] of storeSeed.products.entries()) {
      const curatedProduct = curatedProductMedia[name];
      const imageUrl = curatedProduct
        ? curatedUploadPath(curatedProduct)
        : await createDemoImage({
            folder: ["lojas", storeSeed.slug, "produtos"],
            height: 900,
            index: productIndex + index,
            text: name,
            width: 900,
          });
      const isService = ["Beleza"].includes(storeSeed.categoryName);
      const isFood = ["Restaurantes"].includes(storeSeed.categoryName);
      const isMarket = ["Mercados", "Farmacias"].includes(storeSeed.categoryName);
      const estimatedMinutes = isFood ? 35 : isService ? 90 : isMarket ? 120 : 1440;

      productData.push({
        aceita_entrega: true,
        aceita_retirada: true,
        descricao: description,
        detalhes_json: {
          extraInfo: isService
            ? "Servico com horario combinado pelo lojista apos o pedido."
            : "Produto demo com informacoes completas para testar a vitrine.",
        },
        destaque: productIndex === 0,
        imagem_url: imageUrl,
        loja_id: store.id,
        marca: storeSeed.name.replace(" Demo", ""),
        nome: name,
        ordem: productIndex + 1,
        prazo_estimado_minutos: estimatedMinutes,
        preco_centavos: BigInt(priceCents),
        resumo_curto: description,
        sku: `DEMO-${storeSeed.slug}-${productIndex + 1}`,
        status: "ATIVO",
        estoque_controlado: !isService,
        estoque_quantidade: isService ? null : 20 + productIndex * 5,
        unidade_medida: isService ? "servico" : "unidade",
      });
    }

    await database.produtoLoja.createMany({
      data: productData,
    });
  }
}

async function main() {
  if (!demoPassword || demoPassword.length < 12) {
    throw new Error(
      "Defina DEMO_SEED_PASSWORD com pelo menos 12 caracteres antes de executar a seed.",
    );
  }

  await installCuratedAssets();
  const passwordHash = await hashPassword(demoPassword);

  const result = await prisma.$transaction(
    async (database) => {
      const companyRoot = await ensureCompanyRootUser(database);
      await ensureUserWallets(companyRoot.id, database);
      await seedSegments(database);
      await seedServiceTypes(database);
      const categoriesByName = await seedCategories(database);
      const users = await seedUsers(database, passwordHash);
      await seedNetwork(database, companyRoot, users);
      await seedStores(database, categoriesByName, users);

      return {
        categories: categoriesByName.size,
        firstUserEmail: users[0].email,
        stores: demoStores.length,
        users: users.length,
      };
    },
    { maxWait: 10000, timeout: 60000 },
  );

  console.log("Seed demo finalizada.");
  console.log(`Usuarios demo verificados: ${result.users}`);
  console.log(`Categorias: ${result.categories}`);
  console.log(`Lojas visiveis com produtos: ${result.stores}`);
  console.log(`Login exemplo: ${result.firstUserEmail} (senha definida em DEMO_SEED_PASSWORD)`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
