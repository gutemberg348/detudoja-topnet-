import { randomUUID } from "crypto";
import {
  emitOrderMessageCreated,
  emitOrderStatusUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { deletePrivateChatAttachment, savePrivateChatAttachment } from "../chat-media/chat-media.service.js";
import { isValidCnpj, normalizeCnpj } from "../../utils/cnpj.js";
import { createSellerRepository, sellerRepository } from "./seller.repository.js";
import { parsePositiveId } from "../../utils/ids.js";
import { normalizeLocation, sameCity } from "../../utils/location.js";
import {
  createAutonomousQrCharge,
  serializeChargeWithQr,
} from "../charges/charge.service.js";
import {
  deleteUploadedImage,
  saveUploadedImage,
} from "../uploads/image.service.js";
import {
  serializeOrder,
  serializeOrderMessage,
  serializeOrderProposal,
} from "../orders/orders.serializer.js";
import { releaseReservedOrderStock } from "../orders/order-stock.service.js";

const individualMerchantMonthlyLimitCents = 500000n;
const sellerOrderInclude = {
  _count: {
    select: {
      mensagens: {
        where: {
          lido_loja_em: null,
          origem: "CLIENTE",
        },
      },
    },
  },
  comprador: {
    select: {
      email: true,
      id: true,
      nome: true,
      telefone: true,
    },
  },
  itens: {
    orderBy: { criado_em: "asc" },
  },
  loja: {
    select: {
      id: true,
      nome: true,
    },
  },
  pagamento: true,
  propostas: {
    orderBy: { criado_em: "asc" },
  },
};

const orderMessageInclude = {
  autor: {
    select: {
      id: true,
      nome: true,
    },
  },
};

function cents(value) {
  return Number(value ?? 0);
}

function onlyDigits(value = "") {
  return value.replace(/\D/g, "");
}

function hasValidDocumentShape(documentDigits, type) {
  if (type === "JURIDICA") return isValidCnpj(documentDigits);
  const expectedLength = type === "JURIDICA" ? 14 : 11;

  return (
    documentDigits.length === expectedLength &&
    !/^(\d)\1+$/.test(documentDigits)
  );
}

function commercialDocumentField(type) {
  return type === "JURIDICA" ? "cnpj" : "cpf";
}

function isCommercialDocumentUniqueConflict(error) {
  if (error?.code !== "P2002") {
    return false;
  }

  const target = Array.isArray(error.meta?.target)
    ? error.meta.target.join(",")
    : String(error.meta?.target ?? "");

  return target.includes("cpf") || target.includes("cnpj");
}

function commercialDocumentConflictError(type) {
  return new AppError(
    type === "JURIDICA"
      ? "Este CNPJ ja esta vinculado a outro cadastro comercial"
      : "Este CPF ja esta vinculado a outro cadastro comercial",
    409,
  );
}

async function assertCommercialDocumentAvailable(repository, {
  documentDigits,
  type,
  userId,
  profile,
}) {
  const field = commercialDocumentField(type);
  const existing = profile === "MERCHANT"
    ? await repository.findMerchantByDocument(field, documentDigits, userId)
    : await repository.findSellerByDocument(field, documentDigits, userId);

  if (existing) {
    throw commercialDocumentConflictError(type);
  }
}

function isCommercialIdentityApproved(user, type, documentDigits) {
  if (
    user?.status !== "ATIVO"
    || user.nivel_kyc !== "TIER_2"
    || user.kyc?.status !== "APROVADO"
  ) {
    return false;
  }

  if (type === "JURIDICA") {
    return isValidCnpj(documentDigits);
  }

  return onlyDigits(user.cpf) === documentDigits;
}

function commercialApprovalData(type, identityApproved) {
  return {
    limite_faturamento_mensal_centavos:
      type === "FISICA" ? individualMerchantMonthlyLimitCents : null,
    status: identityApproved ? "ATIVO" : "PENDENTE",
    status_kyc: identityApproved ? "APROVADO" : "PENDENTE",
  };
}

function assertAutonomousSellerEligibility(user, seller) {
  if (user?.nivel_kyc !== "TIER_2" || user.kyc?.status !== "APROVADO") {
    throw new AppError(
      "Conclua a verificacao TIER_2 antes de realizar vendas ou prestar servicos",
      428,
    );
  }

  const commercialDocument = seller.tipo_pessoa === "JURIDICA"
    ? normalizeCnpj(seller.cnpj)
    : onlyDigits(seller.cpf);
  if (!user || !isCommercialIdentityApproved(user, seller.tipo_pessoa, commercialDocument)) {
    throw new AppError(
      seller.tipo_pessoa === "JURIDICA"
        ? "A verificacao de titularidade do CNPJ precisa ser aprovada antes de vender"
        : "Conclua a verificacao de identidade antes de gerar uma venda autonoma",
      428,
    );
  }

  if (seller.status !== "ATIVO" || seller.status_kyc !== "APROVADO") {
    throw new AppError("Seu cadastro comercial ainda esta em validacao", 428);
  }
}

function assertStoreMerchantTier2(store) {
  const merchantUser = store.lojista?.usuario;
  if (
    store.lojista?.status !== "ATIVO"
    || store.lojista?.status_kyc !== "APROVADO"
    || merchantUser?.status !== "ATIVO"
    || merchantUser?.nivel_kyc !== "TIER_2"
    || merchantUser?.kyc?.status !== "APROVADO"
  ) {
    throw new AppError(
      "O titular da loja precisa concluir a verificacao TIER_2 antes de realizar vendas",
      428,
    );
  }
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function serializeSegment(segment) {
  return {
    categoryId: segment.categoria_loja_id ?? null,
    description: segment.descricao,
    iconName: segment.icone,
    id: segment.id,
    name: segment.nome,
    orderFlow: segment.negocia_pedido_por_chat
      ? "CHAT_NEGOTIATION"
      : "DIRECT_CHECKOUT",
    slug: segment.slug,
    sortOrder: segment.ordem,
    status: segment.status,
  };
}

function serializeSale(sale) {
  return {
    amountCents: cents(sale.valor_centavos),
    createdAt: sale.criado_em.toISOString(),
    description: sale.descricao,
    id: sale.id,
    charge: sale.cobranca
      ? {
          code: sale.cobranca.codigo_publico,
          expiresAt: sale.cobranca.expira_em.toISOString(),
          id: sale.cobranca.id,
          status: sale.cobranca.status,
        }
      : null,
    // Autonomous QR is currently an in-person flow. A remote purchase link
    // needs its own consumer, fiscal, cancellation and settlement rules.
    paymentPath: null,
    segment: sale.segmento_venda ? serializeSegment(sale.segmento_venda) : null,
    slug: sale.link_slug,
    status: sale.status,
    title: sale.titulo,
    updatedAt: sale.atualizado_em.toISOString(),
  };
}

function serializeStoreCategory(category) {
  const availableSegments = [
    ...(category.segmentos_venda ?? []),
    ...(category.segmento_venda ? [category.segmento_venda] : []),
  ].filter(
    (segment, index, segments) =>
      segment.status === "ATIVO" &&
      segment.excluido_em == null &&
      segments.findIndex((item) => item.id === segment.id) === index,
  );

  return {
    description: category.descricao,
    iconUrl: category.icone_url,
    id: category.id,
    name: category.nome,
    segments: availableSegments.map(serializeSegment),
    status: category.status,
  };
}

function serializeStoreMerchant(merchant) {
  if (!merchant) {
    return null;
  }

  return {
    id: merchant.id,
    kycStatus: merchant.status_kyc,
    monthlySalesLimitCents:
      merchant.limite_faturamento_mensal_centavos == null
        ? null
        : cents(merchant.limite_faturamento_mensal_centavos),
    status: merchant.status,
    type: merchant.tipo_pessoa,
  };
}

function serializeStore(store, merchant = store.lojista ?? null) {
  const products = store.produtos ?? [];
  const segment = store.segmento_venda ?? store.categoria?.segmento_venda ?? null;

  return {
    address: store.endereco
      ? {
          city: store.endereco.cidade,
          complement: store.endereco.complemento,
          district: store.endereco.bairro,
          number: store.endereco.numero,
          reference: store.endereco.referencia,
          state: store.endereco.estado,
          street: store.endereco.rua,
          zipCode: store.endereco.cep,
        }
      : null,
    category: store.categoria ? serializeStoreCategory(store.categoria) : null,
    bannerUrl: store.banner_url,
    chargesCount: store._count?.cobrancas ?? 0,
    createdAt: store.criado_em.toISOString(),
    description: store.descricao,
    deliveryFeeCents: cents(store.taxa_entrega_centavos),
    email: store.email,
    id: store.id,
    logoUrl: store.logo_url,
    merchant: serializeStoreMerchant(merchant),
    name: store.nome,
    openForOrders: store.aberta_para_pedidos,
    orderFlow: segment?.negocia_pedido_por_chat
      ? "CHAT_NEGOTIATION"
      : "DIRECT_CHECKOUT",
    openingHours: store.horarios_funcionamento,
    orders: (store.pedidos ?? []).map((order) => serializeOrder(order, { audience: "store" })),
    phone: store.telefone,
    products: products.map(serializeStoreProduct),
    productsCount: store._count?.produtos ?? products.length,
    segment: segment ? serializeSegment(segment) : null,
    slug: store.slug,
    status: store.status,
    visibleInApp: store.visivel_no_app,
    whatsapp: store.whatsapp,
  };
}

function storeAddressData(address) {
  return {
    bairro: address.district,
    cep: onlyDigits(address.zipCode),
    cidade: address.city,
    cidade_normalizada: normalizeLocation(address.city),
    complemento: address.complement || null,
    estado: address.state.toUpperCase(),
    numero: address.number,
    referencia: address.reference || null,
    rua: address.street,
  };
}

function serializeStoreProduct(product) {
  return {
    acceptDelivery: product.aceita_entrega,
    acceptPickup: product.aceita_retirada,
    brand: product.marca,
    createdAt: product.criado_em.toISOString(),
    description: product.descricao,
    details: product.detalhes_json,
    estimatedTimeMinutes: product.prazo_estimado_minutos,
    featured: product.destaque,
    id: product.id,
    imageUrl: product.imagem_url,
    name: product.nome,
    priceCents: cents(product.preco_centavos),
    promotionalPriceCents: product.preco_promocional_centavos
      ? cents(product.preco_promocional_centavos)
      : null,
    sku: product.sku,
    status: product.status,
    stockControlled: product.estoque_controlado,
    stockQuantity: product.estoque_quantidade,
    shortDescription: product.resumo_curto,
    unit: product.unidade_medida,
    updatedAt: product.atualizado_em.toISOString(),
  };
}

const statusMessageCopy = {
  ACEITO: {
    message: "A loja aceitou o pedido e vai iniciar o atendimento.",
    title: "Pedido aceito",
  },
  CANCELADO: {
    message: "Pedido cancelado pela loja. Fale por aqui se precisar de mais detalhes.",
    title: "Pedido cancelado",
  },
  CONCLUIDO: {
    message: "Pedido finalizado. Obrigado por comprar pelo Brasil Cashback.",
    title: "Pedido concluido",
  },
  PREPARANDO: {
    message: "Seu pedido esta em preparo.",
    title: "Em preparo",
  },
  PRONTO_RETIRADA: {
    message: "Pedido pronto para retirada.",
    title: "Pronto para retirada",
  },
  SAIU_ENTREGA: {
    message: "Pedido saiu para entrega.",
    title: "Saiu para entrega",
  },
};

function statusTimestampData(status, currentOrder, now) {
  const existingOrNow = (field) => currentOrder[field] ?? now;

  if (status === "ACEITO") {
    return {
      aceito_em: existingOrNow("aceito_em"),
      cancelado_em: null,
      concluido_em: null,
      preparando_em: null,
      pronto_retirada_em: null,
      saiu_entrega_em: null,
    };
  }

  if (status === "PREPARANDO") {
    return {
      aceito_em: existingOrNow("aceito_em"),
      cancelado_em: null,
      concluido_em: null,
      preparando_em: existingOrNow("preparando_em"),
      pronto_retirada_em: null,
      saiu_entrega_em: null,
    };
  }

  if (status === "SAIU_ENTREGA") {
    return {
      aceito_em: existingOrNow("aceito_em"),
      cancelado_em: null,
      concluido_em: null,
      preparando_em: existingOrNow("preparando_em"),
      pronto_retirada_em: null,
      saiu_entrega_em: existingOrNow("saiu_entrega_em"),
    };
  }

  if (status === "PRONTO_RETIRADA") {
    return {
      aceito_em: existingOrNow("aceito_em"),
      cancelado_em: null,
      concluido_em: null,
      preparando_em: existingOrNow("preparando_em"),
      pronto_retirada_em: existingOrNow("pronto_retirada_em"),
      saiu_entrega_em: null,
    };
  }

  if (status === "CONCLUIDO") {
    return {
      cancelado_em: null,
      concluido_em: now,
    };
  }

  if (status === "CANCELADO") {
    return {
      cancelado_em: now,
      concluido_em: null,
    };
  }

  return {};
}

function serializeSellerProfile(seller) {
  if (!seller) {
    return null;
  }

  return {
    createdAt: seller.criado_em.toISOString(),
    description: seller.descricao,
    document:
      seller.tipo_pessoa === "JURIDICA" ? seller.cnpj : seller.cpf,
    id: seller.id,
    kycStatus: seller.status_kyc,
    publicName: seller.nome_publico,
    segment: seller.segmento_venda ? serializeSegment(seller.segmento_venda) : null,
    status: seller.status,
    totalSales: seller.total_vendas,
    type: seller.tipo_pessoa,
    updatedAt: seller.atualizado_em.toISOString(),
  };
}

async function getActiveSegment(segmentId) {
  const segment = await sellerRepository.findFirstSegment({
    where: { excluido_em: null, id: segmentId, status: "ATIVO" },
  });

  if (!segment) {
    throw new AppError("Segmento de venda nao encontrado", 404);
  }

  return segment;
}

export async function listSellerSegments() {
  const segments = await sellerRepository.findSegments({
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    where: { excluido_em: null, status: "ATIVO" },
  });

  return { segments: segments.map(serializeSegment) };
}

export async function listSellerStoreCategories() {
  const categories = await sellerRepository.findCategories({
    include: {
      segmento_venda: true,
      segmentos_venda: {
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        where: { excluido_em: null, status: "ATIVO" },
      },
    },
    orderBy: { nome: "asc" },
    where: { excluido_em: null, status: "ATIVA" },
  });

  return { categories: categories.map(serializeStoreCategory) };
}

export async function getSellerProfile(userId) {
  const [seller, merchant] = await Promise.all([
    sellerRepository.findFirstSeller({
      include: { segmento_venda: true },
      where: { excluido_em: null, usuario_id: userId },
    }),
    sellerRepository.findFirstMerchant({
      include: {
        lojas: {
          include: {
            _count: {
              select: {
                cobrancas: true,
                produtos: { where: { excluido_em: null } },
              },
            },
            categoria: { include: { segmento_venda: true } },
            endereco: true,
            segmento_venda: true,
            pedidos: {
              include: sellerOrderInclude,
              orderBy: { criado_em: "desc" },
              take: 20,
            },
            produtos: {
              orderBy: [{ destaque: "desc" }, { ordem: "asc" }, { criado_em: "desc" }],
              take: 50,
              where: { excluido_em: null },
            },
          },
          orderBy: { criado_em: "desc" },
          where: { excluido_em: null },
        },
      },
      where: { excluido_em: null, usuario_id: userId },
    }),
  ]);

  const sales = seller
    ? await sellerRepository.findSales({
        include: { cobranca: true, segmento_venda: true },
        orderBy: { criado_em: "desc" },
        take: 8,
        where: { vendedor_id: seller.id },
      })
    : [];

  return {
    profile: serializeSellerProfile(seller),
    sales: sales.map(serializeSale),
    stores: (merchant?.lojas ?? []).map((store) => serializeStore(store, merchant)),
  };
}

export async function createSellerOnboarding(userId, data) {
  const [segment, user] = await Promise.all([
    getActiveSegment(data.segmentId),
    sellerRepository.findUniqueUser({
      include: { kyc: true },
      where: { id: userId },
    }),
  ]);

  if (!user) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  if (!user.cpf) {
    throw new AppError("Informe seu CPF antes da primeira operacao de venda", 428);
  }

  const documentDigits =
    data.type === "FISICA"
      ? onlyDigits(data.document || user.cpf || "")
      : normalizeCnpj(data.document || "");

  if (data.type === "FISICA" && !hasValidDocumentShape(documentDigits, data.type)) {
    throw new AppError("Seu CPF precisa estar completo para vender", 400);
  }

  if (data.type === "FISICA" && documentDigits !== onlyDigits(user.cpf)) {
    throw new AppError("Use o mesmo CPF vinculado a sua conta para vender como pessoa fisica", 409);
  }

  if (data.type === "JURIDICA" && !hasValidDocumentShape(documentDigits, data.type)) {
    throw new AppError("Informe um CNPJ valido para vender", 400);
  }

  const identityApproved = isCommercialIdentityApproved(user, data.type, documentDigits);

  try {
    const seller = await sellerRepository.transaction(async (database) => {
      const repository = createSellerRepository(database);
      await assertCommercialDocumentAvailable(repository, {
        documentDigits,
        profile: "SELLER",
        type: data.type,
        userId,
      });

      const savedSeller = await repository.upsertSeller({
      create: {
        aceita_servicos: true,
        categoria: segment.nome,
        cnpj: data.type === "JURIDICA" ? documentDigits : null,
        cpf: data.type === "FISICA" ? documentDigits : null,
        descricao: data.description || null,
        limite_faturamento_mensal_centavos:
          data.type === "FISICA" ? individualMerchantMonthlyLimitCents : null,
        nome_publico: data.publicName || user.nome,
        segmento_venda_id: segment.id,
        ...commercialApprovalData(data.type, identityApproved),
        tipo_pessoa: data.type,
        usuario_id: userId,
      },
      include: { segmento_venda: true },
      update: {
        categoria: segment.nome,
        cnpj: data.type === "JURIDICA" ? documentDigits : null,
        cpf: data.type === "FISICA" ? documentDigits : null,
        descricao: data.description || null,
        limite_faturamento_mensal_centavos:
          data.type === "FISICA" ? individualMerchantMonthlyLimitCents : null,
        nome_publico: data.publicName || user.nome,
        segmento_venda_id: segment.id,
        ...commercialApprovalData(data.type, identityApproved),
        tipo_pessoa: data.type,
      },
      where: { usuario_id: userId },
    });

      return savedSeller;
    });

    return { profile: serializeSellerProfile(seller) };
  } catch (error) {
    if (isCommercialDocumentUniqueConflict(error)) {
      throw commercialDocumentConflictError(data.type);
    }

    throw error;
  }
}

export async function createAutonomousSale(userId, data) {
  const [user, seller] = await Promise.all([
    sellerRepository.findUniqueUser({ include: { kyc: true }, where: { id: userId } }),
    sellerRepository.findFirstSeller({
    include: { segmento_venda: true },
    where: { excluido_em: null, usuario_id: userId },
    }),
  ]);

  if (!user?.cpf) {
    throw new AppError("Informe seu CPF antes da primeira operacao de venda", 428);
  }

  if (!seller) {
    throw new AppError("Complete o cadastro de vendedor antes da primeira venda", 428);
  }

  assertAutonomousSellerEligibility(user, seller);

  if (!seller.segmento_venda_id || !seller.segmento_venda) {
    throw new AppError("Defina o segmento no cadastro de vendedor antes de gerar uma venda", 409);
  }

  const linkSlug = `${slugify(data.title) || "venda"}-${randomUUID().slice(0, 8)}`;
  const { charge, sale } = await sellerRepository.transaction(async (database) => {
    const createdSale = await createSellerRepository(database).createAutonomousSale({
      data: {
        descricao: data.description || null,
        link_slug: linkSlug,
        segmento_venda_id: seller.segmento_venda_id,
        status: "AGUARDANDO_PAGAMENTO",
        titulo: data.title,
        valor_centavos: BigInt(data.amountCents),
        vendedor_id: seller.id,
      },
      include: { segmento_venda: true },
    });
    const createdCharge = await createAutonomousQrCharge(database, {
      amountCents: data.amountCents,
      description: data.description,
      saleId: createdSale.id,
      seller,
      title: data.title,
    });

    return { charge: createdCharge, sale: { ...createdSale, cobranca: createdCharge } };
  });

  return {
    sale: serializeSale(sale),
    ...(await serializeChargeWithQr(charge)),
  };
}

async function findStoreForUser(userId, storeId) {
  const parsedStoreId = parsePositiveId(storeId, "Loja invalida");
  const store = await sellerRepository.findFirstStore({
    include: {
      _count: {
        select: {
          produtos: { where: { excluido_em: null } },
        },
      },
      categoria: { include: { segmento_venda: true } },
      endereco: true,
      segmento_venda: true,
      lojista: { include: { usuario: { include: { kyc: true } } } },
      pedidos: {
        include: sellerOrderInclude,
        orderBy: { criado_em: "desc" },
        take: 20,
      },
      produtos: {
        orderBy: [{ destaque: "desc" }, { ordem: "asc" }, { criado_em: "desc" }],
        take: 6,
        where: { excluido_em: null },
      },
    },
    where: {
      excluido_em: null,
      id: parsedStoreId,
      lojista: { usuario_id: userId },
    },
  });

  if (!store) {
    throw new AppError("Loja nao encontrada para este usuario", 404);
  }

  return store;
}

export async function updateSellerStoreMedia(userId, storeId, data, files = {}) {
  const currentStore = await findStoreForUser(userId, storeId);
  const savedUploads = [];

  let bannerUpload = null;
  let logoUpload = null;

  try {
    if (files.logo) {
      logoUpload = await saveUploadedImage(files.logo, {
        folder: ["lojas", String(currentStore.id), "logo"],
        profile: "storeLogo",
      });
      savedUploads.push(logoUpload.url);
    }

    if (files.banner) {
      bannerUpload = await saveUploadedImage(files.banner, {
        folder: ["lojas", String(currentStore.id), "banner"],
        profile: "storeBanner",
      });
      savedUploads.push(bannerUpload.url);
    }

    const store = await sellerRepository.updateStore({
      data: {
        ...(bannerUpload ? { banner_url: bannerUpload.url } : {}),
        ...(data.description !== undefined ? { descricao: data.description || null } : {}),
        ...(logoUpload ? { logo_url: logoUpload.url } : {}),
      },
      include: {
        _count: {
          select: {
            produtos: { where: { excluido_em: null } },
          },
        },
        categoria: { include: { segmento_venda: true } },
        endereco: true,
        segmento_venda: true,
        lojista: true,
        pedidos: {
          include: sellerOrderInclude,
          orderBy: { criado_em: "desc" },
          take: 20,
        },
        produtos: {
          orderBy: [{ destaque: "desc" }, { ordem: "asc" }, { criado_em: "desc" }],
          take: 50,
          where: { excluido_em: null },
        },
      },
      where: { id: currentStore.id },
    });

    await Promise.all([
      logoUpload ? deleteUploadedImage(currentStore.logo_url) : null,
      bannerUpload ? deleteUploadedImage(currentStore.banner_url) : null,
    ]);

    return { store: serializeStore(store) };
  } catch (error) {
    await Promise.all(savedUploads.map((uploadUrl) => deleteUploadedImage(uploadUrl)));
    throw error;
  }
}

export async function updateSellerStore(userId, storeId, data) {
  const currentStore = await findStoreForUser(userId, storeId);

  if (data.address) {
    const baseAddress = await sellerRepository.getUserBaseAddress(userId);
    if (!sameCity(baseAddress, data.address)) {
      throw new AppError("A loja precisa permanecer na cidade-base da sua conta", 409);
    }
  }

  let category = null;
  let segment = null;

  if (data.segmentId) {
    segment = await sellerRepository.findFirstSegment({
      include: {
        categoria_loja: true,
        categorias_loja: {
          where: { excluido_em: null, status: "ATIVA" },
        },
      },
      where: { excluido_em: null, id: data.segmentId, status: "ATIVO" },
    });

    category = segment?.categoria_loja
      ?? segment?.categorias_loja.find((item) => item.id === data.categoryId)
      ?? null;

    if (!segment || !category || (data.categoryId && category.id !== data.categoryId)) {
      throw new AppError("Segmento nao pertence a categoria selecionada", 400);
    }
  } else if (data.categoryId) {
    throw new AppError("Selecione o segmento da loja", 400);
  }

  const store = await sellerRepository.updateStore({
    data: {
      ...(data.address
        ? {
            endereco: {
              upsert: {
                create: storeAddressData(data.address),
                update: storeAddressData(data.address),
              },
            },
          }
        : {}),
      ...(category ? { categoria_id: category.id } : {}),
      ...(segment ? { segmento_venda_id: segment.id } : {}),
      ...(data.description !== undefined ? { descricao: data.description || null } : {}),
      ...(data.deliveryFeeCents !== undefined
        ? { taxa_entrega_centavos: BigInt(data.deliveryFeeCents) }
        : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.name !== undefined ? { nome: data.name } : {}),
      ...(data.openForOrders !== undefined
        ? { aberta_para_pedidos: data.openForOrders }
        : {}),
      ...(data.openingHours !== undefined
        ? { horarios_funcionamento: data.openingHours }
        : {}),
      ...(data.phone !== undefined
        ? { telefone: onlyDigits(data.phone || "") || null }
        : {}),
      ...(data.whatsapp !== undefined
        ? { whatsapp: onlyDigits(data.whatsapp || "") || null }
        : {}),
    },
    include: {
      _count: {
        select: {
          produtos: { where: { excluido_em: null } },
        },
      },
      categoria: { include: { segmento_venda: true } },
      endereco: true,
      segmento_venda: true,
      lojista: true,
      pedidos: {
        include: sellerOrderInclude,
        orderBy: { criado_em: "desc" },
        take: 20,
      },
      produtos: {
        orderBy: [{ destaque: "desc" }, { ordem: "asc" }, { criado_em: "desc" }],
        take: 50,
        where: { excluido_em: null },
      },
    },
    where: { id: currentStore.id },
  });

  return { store: serializeStore(store) };
}

export async function deleteSellerStore(userId, storeId) {
  const store = await findStoreForUser(userId, storeId);
  const now = new Date();
  const uploadUrls = [
    store.logo_url,
    store.banner_url,
    ...(store.produtos ?? []).map((product) => product.imagem_url),
  ].filter(Boolean);

  await sellerRepository.transaction(async (database) => {
    const repository = createSellerRepository(database);
    await repository.updateProducts({
      data: { excluido_em: now, status: "INATIVO" },
      where: { excluido_em: null, loja_id: store.id },
    });

    await repository.updateStoreMembers({
      data: { status: "INATIVO" },
      where: { loja_id: store.id },
    });

    await repository.updateStore({
      data: {
        excluido_em: now,
        status: "PAUSADA",
        visivel_no_app: false,
      },
      where: { id: store.id },
    });
  });

  await Promise.all(uploadUrls.map((uploadUrl) => deleteUploadedImage(uploadUrl)));

  return { deleted: true, storeId: store.id };
}

export async function createStoreProduct(userId, storeId, data, imageFile = null) {
  const store = await findStoreForUser(userId, storeId);
  let product = null;
  let imageUpload = null;

  try {
    product = await sellerRepository.createProduct({
      data: {
        aceita_entrega: data.acceptDelivery ?? true,
        aceita_retirada: data.acceptPickup ?? true,
        descricao: data.description || null,
        detalhes_json: data.details ?? null,
        destaque: Boolean(data.featured),
        estoque_controlado: Boolean(data.stockControlled),
        estoque_quantidade: data.stockControlled ? data.stockQuantity : null,
        imagem_url: null,
        loja_id: store.id,
        marca: data.brand || null,
        nome: data.name,
        prazo_estimado_minutos: data.estimatedTimeMinutes ?? null,
        preco_centavos: BigInt(data.priceCents),
        preco_promocional_centavos: data.promotionalPriceCents
          ? BigInt(data.promotionalPriceCents)
          : null,
        resumo_curto: data.shortDescription || null,
        sku: data.sku || null,
        unidade_medida: data.unit || null,
      },
    });

    if (imageFile) {
      imageUpload = await saveUploadedImage(imageFile, {
        folder: ["lojas", String(store.id), "produtos", String(product.id)],
        profile: "product",
      });

      product = await sellerRepository.updateProduct({
        data: { imagem_url: imageUpload.url },
        where: { id: product.id },
      });
    }

    return { product: serializeStoreProduct(product) };
  } catch (error) {
    if (imageUpload) {
      await deleteUploadedImage(imageUpload.url);
    }

    if (product) {
      await sellerRepository.deleteProduct({ where: { id: product.id } }).catch(() => {});
    }

    throw error;
  }
}

async function findStoreProductForUser(userId, storeId, productId) {
  const store = await findStoreForUser(userId, storeId);
  const parsedProductId = parsePositiveId(productId, "Produto invalido");

  const product = await sellerRepository.findFirstProduct({
    where: {
      excluido_em: null,
      id: parsedProductId,
      loja_id: store.id,
    },
  });

  if (!product) {
    throw new AppError("Produto nao encontrado para esta loja", 404);
  }

  return product;
}

function assertUpdatedProductState(currentProduct, data) {
  const acceptsDelivery = data.acceptDelivery === undefined
    ? currentProduct.aceita_entrega
    : Boolean(data.acceptDelivery);
  const acceptsPickup = data.acceptPickup === undefined
    ? currentProduct.aceita_retirada
    : Boolean(data.acceptPickup);
  const priceCents = data.priceCents === undefined
    ? Number(currentProduct.preco_centavos)
    : Number(data.priceCents);
  const promotionalPriceCents = data.promotionalPriceCents === undefined
    ? (currentProduct.preco_promocional_centavos == null
      ? null
      : Number(currentProduct.preco_promocional_centavos))
    : (data.promotionalPriceCents == null ? null : Number(data.promotionalPriceCents));
  const stockControlled = data.stockControlled === undefined
    ? currentProduct.estoque_controlado
    : Boolean(data.stockControlled);
  const stockQuantity = data.stockQuantity === undefined
    ? (currentProduct.estoque_quantidade == null ? null : Number(currentProduct.estoque_quantidade))
    : data.stockQuantity;

  if (!acceptsDelivery && !acceptsPickup) {
    throw new AppError("O produto precisa permitir entrega ou retirada", 400);
  }
  if (promotionalPriceCents != null && promotionalPriceCents >= priceCents) {
    throw new AppError("O preco promocional precisa ser menor que o preco normal", 400);
  }
  if (stockControlled && stockQuantity == null) {
    throw new AppError("Informe o estoque quando controlar quantidade", 400);
  }
  if (!stockControlled && data.stockQuantity !== undefined) {
    throw new AppError("Ative o controle de estoque antes de informar quantidade", 400);
  }
}

export async function updateStoreProduct(userId, storeId, productId, data, imageFile = null) {
  const currentProduct = await findStoreProductForUser(userId, storeId, productId);
  assertUpdatedProductState(currentProduct, data);
  let imageUpload = null;

  try {
    if (imageFile) {
      imageUpload = await saveUploadedImage(imageFile, {
        folder: ["lojas", String(currentProduct.loja_id), "produtos", String(currentProduct.id)],
        profile: "product",
      });
    }

    const product = await sellerRepository.updateProduct({
      data: {
        ...(data.acceptDelivery !== undefined
          ? { aceita_entrega: Boolean(data.acceptDelivery) }
          : {}),
        ...(data.acceptPickup !== undefined
          ? { aceita_retirada: Boolean(data.acceptPickup) }
          : {}),
        ...(data.brand !== undefined ? { marca: data.brand || null } : {}),
        ...(data.description !== undefined ? { descricao: data.description || null } : {}),
        ...(data.details !== undefined ? { detalhes_json: data.details ?? null } : {}),
        ...(data.estimatedTimeMinutes !== undefined
          ? { prazo_estimado_minutos: data.estimatedTimeMinutes ?? null }
          : {}),
        ...(data.featured !== undefined ? { destaque: Boolean(data.featured) } : {}),
        ...(imageUpload ? { imagem_url: imageUpload.url } : {}),
        ...(data.name !== undefined ? { nome: data.name } : {}),
        ...(data.priceCents !== undefined ? { preco_centavos: BigInt(data.priceCents) } : {}),
        ...(data.promotionalPriceCents !== undefined
          ? {
              preco_promocional_centavos: data.promotionalPriceCents
                ? BigInt(data.promotionalPriceCents)
                : null,
            }
          : {}),
        ...(data.shortDescription !== undefined
          ? { resumo_curto: data.shortDescription || null }
          : {}),
        ...(data.sku !== undefined ? { sku: data.sku || null } : {}),
        ...(data.stockControlled === false
          ? { estoque_controlado: false, estoque_quantidade: null }
          : data.stockControlled === true
            ? {
                estoque_controlado: true,
                estoque_quantidade: data.stockQuantity === undefined
                  ? currentProduct.estoque_quantidade
                  : data.stockQuantity,
              }
            : data.stockQuantity !== undefined
              ? { estoque_quantidade: data.stockQuantity ?? null }
              : {}),
        ...(data.unit !== undefined ? { unidade_medida: data.unit || null } : {}),
      },
      where: { id: currentProduct.id },
    });

    if (imageUpload) {
      await deleteUploadedImage(currentProduct.imagem_url);
    }

    return { product: serializeStoreProduct(product) };
  } catch (error) {
    if (imageUpload) {
      await deleteUploadedImage(imageUpload.url);
    }

    throw error;
  }
}

export async function deleteStoreProduct(userId, storeId, productId) {
  const product = await findStoreProductForUser(userId, storeId, productId);

  await sellerRepository.updateProduct({
    data: {
      excluido_em: new Date(),
      status: "INATIVO",
    },
    where: { id: product.id },
  });

  await deleteUploadedImage(product.imagem_url);

  return { deleted: true, productId: product.id };
}

export async function updateStoreOrderStatus(userId, storeId, orderId, status) {
  await sellerRepository.requireCommercialTier2(userId);
  const store = await findStoreForUser(userId, storeId);
  assertStoreMerchantTier2(store);
  const parsedOrderId = parsePositiveId(orderId, "Pedido invalido");

  const currentOrder = await sellerRepository.findFirstOrder({
    include: { pagamento: { select: { status: true } } },
    where: {
      id: parsedOrderId,
      loja_id: store.id,
    },
  });

  if (!currentOrder) {
    throw new AppError("Pedido nao encontrado para esta loja", 404);
  }

  if (status === "CONCLUIDO") {
    throw new AppError("Pedido deve ser concluido pelo cliente ou entregador", 409);
  }

  if (currentOrder.status === status) {
    const order = await sellerRepository.findUniqueOrder({
      include: sellerOrderInclude,
      where: { id: parsedOrderId },
    });
    return { order: serializeOrder(order, { audience: "store" }) };
  }

  if (status === "CANCELADO") {
    const paid = ["PAGO", "LIQUIDADO", "EM_DISPUTA", "ESTORNADO"].includes(
      currentOrder.pagamento?.status,
    );
    const alreadyInFulfillment = [
      "ACEITO",
      "PREPARANDO",
      "SAIU_ENTREGA",
      "PRONTO_RETIRADA",
      "CONCLUIDO",
    ].includes(currentOrder.status);

    if (paid || alreadyInFulfillment) {
      throw new AppError(
        "Pedido pago ou em atendimento exige cancelamento pelo suporte",
        409,
      );
    }
  } else {
    const nextStatus = currentOrder.status === "RECEBIDO"
      ? "ACEITO"
      : currentOrder.status === "ACEITO"
        ? "PREPARANDO"
        : currentOrder.status === "PREPARANDO"
          ? currentOrder.tipo_entrega === "RETIRADA" ? "PRONTO_RETIRADA" : "SAIU_ENTREGA"
          : null;

    if (status !== nextStatus) {
      throw new AppError(
        "Esta etapa nao pode ser alterada agora. Siga a proxima etapa indicada no pedido.",
        409,
      );
    }
  }

  const now = new Date();
  const order = await sellerRepository.transaction(async (database) => {
    const repository = createSellerRepository(database);
    const movedOrder = await repository.updateOrders({
      data: {
        status,
        ...statusTimestampData(status, currentOrder, now),
      },
      where: { id: parsedOrderId, status: currentOrder.status },
    });

    if (movedOrder.count !== 1) {
      throw new AppError("O pedido foi atualizado em outra sessao. Atualize a tela.", 409);
    }

    if (status === "CANCELADO") {
      await repository.updateProposals({
        data: { status: "CANCELADA" },
        where: {
          pedido_id: parsedOrderId,
          status: { in: ["PENDENTE", "ACEITA"] },
        },
      });
    }

    if (status === "CANCELADO") {
      await releaseReservedOrderStock(database, parsedOrderId);
    }

    const copy = statusMessageCopy[status];
    await repository.createOrderMessage({
      data: {
        autor_usuario_id: userId,
        lido_loja_em: new Date(),
        mensagem: copy?.message ?? `Status atualizado para ${status}.`,
        metadata_json: { kind: "status", status },
        origem: "LOJA",
        pedido_id: parsedOrderId,
        titulo: copy?.title ?? "Atualizacao do pedido",
      },
    });

    return repository.findUniqueOrder({
      include: sellerOrderInclude,
      where: { id: parsedOrderId },
    });
  });

  const serializedOrder = serializeOrder(order, { audience: "store" });

  emitOrderStatusUpdated(serializedOrder);

  return { order: serializedOrder };
}

async function findStoreOrderForUser(userId, storeId, orderId) {
  const store = await findStoreForUser(userId, storeId);
  const parsedOrderId = parsePositiveId(orderId, "Pedido invalido");

  const order = await sellerRepository.findFirstOrder({
    select: { id: true, loja_id: true, usuario_id: true },
    where: {
      id: parsedOrderId,
      loja_id: store.id,
    },
  });

  if (!order) {
    throw new AppError("Pedido nao encontrado para esta loja", 404);
  }

  return order;
}

export async function listStoreOrderMessages(userId, storeId, orderId) {
  const order = await findStoreOrderForUser(userId, storeId, orderId);

  const markedAsRead = await sellerRepository.updateOrderMessages({
    data: { lido_loja_em: new Date() },
    where: {
      lido_loja_em: null,
      origem: "CLIENTE",
      pedido_id: order.id,
    },
  });

  if (markedAsRead.count > 0) {
    const realtimeOrder = await sellerRepository.findUniqueOrder({
      include: sellerOrderInclude,
      where: { id: order.id },
    });
    emitOrderStatusUpdated(serializeOrder(realtimeOrder, { audience: "store" }));
  }

  const messages = await sellerRepository.findOrderMessages({
    include: orderMessageInclude,
    orderBy: { criado_em: "asc" },
    where: { pedido_id: order.id },
  });

  return { messages: messages.map(serializeOrderMessage) };
}

export async function createStoreOrderMessage(userId, storeId, orderId, data, attachmentFile = null) {
  const order = await findStoreOrderForUser(userId, storeId, orderId);
  const attachment = await savePrivateChatAttachment(attachmentFile, data, {
    conversationId: order.id,
    scope: "order",
  });
  let message;
  try {
    message = await sellerRepository.createOrderMessage({
      data: {
        autor_usuario_id: userId,
        lido_loja_em: new Date(),
        mensagem: data.message || null,
        metadata_json: attachment,
        origem: "LOJA",
        pedido_id: order.id,
        titulo: "Loja",
      },
      include: orderMessageInclude,
    });
  } catch (error) {
    await deletePrivateChatAttachment(attachment);
    throw error;
  }

  const serializedMessage = serializeOrderMessage(message);

  emitOrderMessageCreated({
    customerId: order.usuario_id,
    message: serializedMessage,
    orderId: order.id,
    storeId: order.loja_id,
  });

  return { message: serializedMessage };
}

export async function createStoreOrderProposal(userId, storeId, orderId, data) {
  await sellerRepository.requireCommercialTier2(userId);
  const store = await findStoreForUser(userId, storeId);
  assertStoreMerchantTier2(store);
  const parsedOrderId = parsePositiveId(orderId, "Pedido invalido");
  const currentOrder = await sellerRepository.findFirstOrder({
    select: {
      id: true,
      loja_id: true,
      pagamento_id: true,
      status: true,
      usuario_id: true,
    },
    where: {
      id: parsedOrderId,
      loja_id: store.id,
    },
  });

  if (!currentOrder) {
    throw new AppError("Pedido nao encontrado para esta loja", 404);
  }

  if (currentOrder.pagamento_id || currentOrder.status !== "NEGOCIANDO") {
    throw new AppError("Este pedido nao esta aberto para uma nova proposta", 409);
  }

  const result = await sellerRepository.transaction(async (database) => {
    const repository = createSellerRepository(database);
    await repository.updateProposals({
      data: { status: "CANCELADA" },
      where: {
        pedido_id: currentOrder.id,
        status: "PENDENTE",
      },
    });
    const proposal = await repository.createProposal({
      data: {
        autor_usuario_id: userId,
        descricao: data.description || null,
        pedido_id: currentOrder.id,
        valor_centavos: BigInt(data.amountCents),
      },
    });
    const message = await repository.createOrderMessage({
      data: {
        autor_usuario_id: userId,
        lido_loja_em: new Date(),
        mensagem: `A loja enviou uma proposta de ${new Intl.NumberFormat("pt-BR", {
          currency: "BRL",
          style: "currency",
        }).format(Number(data.amountCents) / 100)}.${data.description ? ` ${data.description}` : ""}`,
        metadata_json: {
          amountCents: data.amountCents,
          description: data.description || null,
          kind: "proposal",
          proposalId: proposal.id,
          status: "PENDENTE",
        },
        origem: "LOJA",
        pedido_id: currentOrder.id,
        titulo: "Nova proposta",
      },
      include: orderMessageInclude,
    });
    const order = await repository.findUniqueOrder({
      include: sellerOrderInclude,
      where: { id: currentOrder.id },
    });

    return { message, order, proposal };
  });

  const serializedMessage = serializeOrderMessage(result.message);
  const serializedOrder = serializeOrder(result.order, { audience: "store" });

  emitOrderMessageCreated({
    customerId: currentOrder.usuario_id,
    message: serializedMessage,
    orderId: currentOrder.id,
    storeId: currentOrder.loja_id,
  });
  emitOrderStatusUpdated(serializedOrder);

  return {
    message: serializedMessage,
    order: serializedOrder,
    proposal: serializeOrderProposal(result.proposal),
  };
}

export async function createSellerStore(userId, data) {
  const [segment, user] = await Promise.all([
    sellerRepository.findFirstSegment({
      include: {
        categoria_loja: true,
        categorias_loja: {
          where: { excluido_em: null, status: "ATIVA" },
        },
      },
      where: { excluido_em: null, id: data.segmentId, status: "ATIVO" },
    }),
    sellerRepository.findUniqueUser({
      include: { kyc: true },
      where: { id: userId },
    }),
  ]);

  if (!user) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  if (!user.cpf) {
    throw new AppError("Informe seu CPF antes de cadastrar a primeira loja", 428);
  }

  const baseAddress = await sellerRepository.getUserBaseAddress(userId);
  if (!sameCity(baseAddress, data.address)) {
    throw new AppError("A loja precisa ficar na cidade-base da sua conta", 409);
  }

  const category = segment?.categoria_loja
    ?? segment?.categorias_loja.find((item) => item.id === data.categoryId)
    ?? null;

  if (!segment || !category || category.id !== data.categoryId) {
    throw new AppError("Segmento nao pertence a categoria selecionada", 400);
  }

  const documentDigits =
    data.type === "FISICA"
      ? onlyDigits(data.document || user.cpf || "")
      : normalizeCnpj(data.document || "");

  if (data.type === "FISICA" && !hasValidDocumentShape(documentDigits, data.type)) {
    throw new AppError("Seu CPF precisa estar completo para cadastrar loja", 400);
  }

  if (data.type === "FISICA" && documentDigits !== onlyDigits(user.cpf)) {
    throw new AppError("Use o mesmo CPF vinculado a sua conta para cadastrar loja como pessoa fisica", 409);
  }

  if (data.type === "JURIDICA" && !hasValidDocumentShape(documentDigits, data.type)) {
    throw new AppError("Informe um CNPJ valido para cadastrar loja", 400);
  }

  const identityApproved = isCommercialIdentityApproved(user, data.type, documentDigits);

  const baseSlug = slugify(data.name) || "loja";
  try {
    const result = await sellerRepository.transaction(async (database) => {
      const repository = createSellerRepository(database);
      await assertCommercialDocumentAvailable(repository, {
        documentDigits,
        profile: "MERCHANT",
        type: data.type,
        userId,
      });
    const merchant = await repository.upsertMerchant({
      create: {
        cnpj: data.type === "JURIDICA" ? documentDigits : null,
        cpf: data.type === "FISICA" ? documentDigits : null,
        ...commercialApprovalData(data.type, identityApproved),
        nome_fantasia: data.name,
        razao_social: data.type === "JURIDICA" ? data.name : null,
        tipo_pessoa: data.type,
        usuario_id: userId,
      },
      update: {
        cnpj: data.type === "JURIDICA" ? documentDigits : null,
        cpf: data.type === "FISICA" ? documentDigits : null,
        ...commercialApprovalData(data.type, identityApproved),
        tipo_pessoa: data.type,
      },
      where: { usuario_id: userId },
    });

    const createdStore = await repository.createStore({
      data: {
        aberta_para_pedidos: data.openForOrders ?? true,
        aceita_qrcode: true,
        categoria_id: category.id,
        descricao: data.description || null,
        endereco: { create: storeAddressData(data.address) },
        email: data.email || null,
        lojista_id: merchant.id,
        nome: data.name,
        segmento_venda_id: segment.id,
        horarios_funcionamento: data.openingHours ?? null,
        slug: `${baseSlug}-${randomUUID().slice(0, 8)}`,
        status: "ATIVA",
        taxa_entrega_centavos: BigInt(data.deliveryFeeCents),
        telefone: onlyDigits(data.phone || "") || null,
        visivel_no_app: true,
        whatsapp: onlyDigits(data.whatsapp || "") || null,
      },
      include: {
        categoria: { include: { segmento_venda: true } },
        endereco: true,
        segmento_venda: true,
      },
    });

    await repository.createStoreMember({
      data: {
        cargo: "DONO",
        loja_id: createdStore.id,
        status: "ATIVO",
        usuario_id: userId,
      },
    });

      return { merchant, store: createdStore };
    });

    return { store: serializeStore(result.store, result.merchant) };
  } catch (error) {
    if (isCommercialDocumentUniqueConflict(error)) {
      throw commercialDocumentConflictError(data.type);
    }

    throw error;
  }
}
