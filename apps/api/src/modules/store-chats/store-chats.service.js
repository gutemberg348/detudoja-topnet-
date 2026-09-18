import {
  emitStoreChatCreated,
  emitStoreChatMessageCreated,
  emitStoreChatUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { deletePrivateChatAttachment, savePrivateChatAttachment, serializeChatAttachment } from "../chat-media/chat-media.service.js";
import { storeChatsRepository } from "./store-chats.repository.js";

function ensureStoreChatPrismaClient() {
  if (!storeChatsRepository.isClientAvailable()) {
    throw new AppError(
      "Prisma Client desatualizado. Pare a API e execute a migration conversas_gerais_loja.",
      503,
    );
  }
}

function serializeMessage(message, viewerId) {
  const author =
    message.origem === "CLIENTE"
      ? "customer"
      : message.origem === "LOJA"
        ? "store"
        : "system";

  return {
    attachment: serializeChatAttachment(message, "store", message.conteudo_json?.attachment),
    author,
    content: message.conteudo_json ?? null,
    createdAt: message.criado_em.toISOString(),
    id: message.id,
    isMine: message.autor_usuario_id === viewerId,
    readAt: (
      message.origem === "CLIENTE"
        ? message.lido_loja_em
        : message.origem === "LOJA"
          ? message.lido_cliente_em
          : null
    )?.toISOString() ?? null,
    sentBy: message.origem === "LOJA" && message.autor
      ? {
          id: message.autor.id,
          name: message.autor.nome,
          photoUrl: message.autor.foto_url,
        }
      : null,
    text: message.mensagem,
    type: message.tipo ?? "TEXTO",
  };
}

function serializeChatProduct(product) {
  return {
    acceptDelivery: product.aceita_entrega,
    acceptPickup: product.aceita_retirada,
    brand: product.marca,
    description: product.descricao,
    details: product.detalhes_json,
    estimatedTimeMinutes: product.prazo_estimado_minutos,
    featured: product.destaque,
    id: product.id,
    imageUrl: product.imagem_url,
    name: product.nome,
    priceCents: Number(product.preco_centavos),
    promotionalPriceCents: product.preco_promocional_centavos
      ? Number(product.preco_promocional_centavos)
      : null,
    shortDescription: product.resumo_curto,
    sku: product.sku,
    stockControlled: product.estoque_controlado,
    stockQuantity: product.estoque_quantidade,
    unit: product.unidade_medida,
  };
}

function serializeChatCategory(category) {
  return category
    ? {
        iconUrl: category.icone_url,
        id: category.id,
        name: category.nome,
      }
    : null;
}

function serializeChatStore(store) {
  return {
    category: serializeChatCategory(store.categoria),
    id: store.id,
    logoUrl: store.logo_url,
    name: store.nome,
    openForOrders: store.aberta_para_pedidos,
    orderFlow: store.segmento_venda?.negocia_pedido_por_chat
      ? "CHAT_NEGOTIATION"
      : "DIRECT_CHECKOUT",
    segment: store.segmento_venda
      ? {
          id: store.segmento_venda.id,
          name: store.segmento_venda.nome,
          slug: store.segmento_venda.slug,
        }
      : null,
  };
}

function normalizeCatalogSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function searchStoreProducts(products, query) {
  const normalizedQuery = normalizeCatalogSearch(query);
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  return products
    .map((product) => {
      const name = normalizeCatalogSearch(product.nome);
      const searchable = normalizeCatalogSearch([
        product.nome,
        product.marca,
        product.resumo_curto,
        product.descricao,
      ].filter(Boolean).join(" "));
      if (!terms.every((term) => searchable.includes(term))) return null;
      const score = name === normalizedQuery
        ? 4
        : name.startsWith(normalizedQuery)
          ? 3
          : name.includes(normalizedQuery)
            ? 2
            : 1;
      return { product, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .map(({ product }) => product);
}

const catalogSearchNoiseTerms = new Set([
  "algum",
  "alguma",
  "catalogo",
  "de",
  "do",
  "dos",
  "produto",
  "produtos",
  "quero",
  "tem",
  "todos",
  "ver",
  "voces",
]);

function catalogWordSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.88;

  const rows = left.length + 1;
  const columns = right.length + 1;
  const distances = Array.from({ length: rows }, (_, row) => {
    const values = Array(columns).fill(0);
    values[0] = row;
    return values;
  });

  for (let column = 1; column < columns; column += 1) {
    distances[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  return 1 - (distances[left.length][right.length] / Math.max(left.length, right.length));
}

function suggestStoreProducts(products, query, matches = []) {
  const matchedIds = new Set(matches.map((product) => product.id));
  const terms = normalizeCatalogSearch(query)
    .split(/\s+/)
    .filter((term) => term.length >= 2 && !catalogSearchNoiseTerms.has(term));
  const available = products.filter((product) => (
    !matchedIds.has(product.id)
    && (!product.estoque_controlado || Number(product.estoque_quantidade ?? 0) > 0)
  ));

  if (!terms.length) {
    return available
      .map((product, index) => ({ index, product }))
      .sort((left, right) => (
        Number(Boolean(right.product.destaque)) - Number(Boolean(left.product.destaque))
        || left.index - right.index
      ))
      .slice(0, 4)
      .map(({ product }) => product);
  }

  const ranked = available
    .map((product, index) => {
      const name = normalizeCatalogSearch(product.nome);
      const searchable = normalizeCatalogSearch([
        product.nome,
        product.marca,
        product.resumo_curto,
        product.descricao,
      ].filter(Boolean).join(" "));
      const words = searchable.split(/\s+/).filter(Boolean);
      const score = terms.reduce((total, term) => {
        if (name === term) return total + 12;
        if (name.includes(term)) return total + 9;
        if (searchable.includes(term)) return total + 6;

        const closestWord = words.reduce(
          (best, word) => Math.max(best, catalogWordSimilarity(term, word)),
          0,
        );
        if (closestWord >= 0.82) return total + 5;
        if (closestWord >= 0.68) return total + 3;
        return total;
      }, product.destaque ? 1 : 0);
      return { index, product, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ product }) => product);

  return (ranked.length ? ranked : available).slice(0, 4);
}

function serializeConversation(
  conversation,
  viewerId,
  { includeMessages = false, scope = "customer" } = {},
) {
  const isStore = scope === "seller";
  const lastMessage = includeMessages
    ? conversation.mensagens?.at(-1)
    : conversation.mensagens?.[0];

  return {
    createdAt: conversation.criado_em.toISOString(),
    customer: {
      id: conversation.cliente.id,
      name: conversation.cliente.nome,
      photoUrl: conversation.cliente.foto_url,
    },
    id: conversation.id,
    isStore,
    lastMessage: lastMessage
      ? serializeMessage(lastMessage, viewerId)
      : null,
    messages: includeMessages
      ? conversation.mensagens.map((message) => serializeMessage(message, viewerId))
      : undefined,
    otherPerson: isStore
      ? {
          id: conversation.cliente.id,
          name: conversation.cliente.nome,
          photoUrl: conversation.cliente.foto_url,
        }
      : {
          id: conversation.loja.id,
          name: conversation.loja.nome,
          photoUrl: conversation.loja.logo_url,
        },
    status: conversation.status,
    store: {
      bannerUrl: conversation.loja.banner_url,
      id: conversation.loja.id,
      logoUrl: conversation.loja.logo_url,
      name: conversation.loja.nome,
      slug: conversation.loja.slug,
    },
    shareOptions: isStore && includeMessages
      ? {
          category: serializeChatCategory(conversation.loja.categoria),
          products: (conversation.loja.produtos ?? []).map(serializeChatProduct),
        }
      : undefined,
    unreadCount: Math.max(
      0,
      isStore
        ? conversation.nao_lidas_loja
        : conversation.nao_lidas_cliente,
    ),
    updatedAt: (
      conversation.ultima_mensagem_em
      ?? conversation.atualizado_em
    ).toISOString(),
  };
}

async function buildCommercialMessage(access, data, scope) {
  const type = data.type ?? "TEXTO";

  if (scope !== "seller" && !["TEXTO", "PRODUTO"].includes(type)) {
    throw new AppError("Somente a loja pode compartilhar o catalogo", 403);
  }

  if (type === "TEXTO") {
    const isSupport = scope === "customer" && data.support === true;
    if (scope === "customer" && data.searchCatalog && data.message) {
      const store = await storeChatsRepository.findCatalogStore(
        access.conversation.loja_id,
      );
      if (!store) throw new AppError("Loja nao encontrada", 404);
      const matches = searchStoreProducts(store.produtos, data.message);
      const suggestions = suggestStoreProducts(store.produtos, data.message, matches);
      return {
        content: {
          kind: "SEARCH",
          productCount: matches.length,
          products: matches.slice(0, 6).map(serializeChatProduct),
          query: data.message,
          store: serializeChatStore(store),
          suggestions: suggestions.map(serializeChatProduct),
        },
        isSupport: false,
        message: data.message,
        type,
      };
    }
    return {
      content: isSupport ? { kind: "SUPPORT" } : null,
      isSupport,
      message: data.message,
      type,
    };
  }

  const store = await storeChatsRepository.findCatalogStore(
    access.conversation.loja_id,
  );

  if (!store) {
    throw new AppError("Loja nao encontrada", 404);
  }

  const storeSnapshot = serializeChatStore(store);
  const category = serializeChatCategory(store.categoria);

  if (type === "PRODUTO") {
    const product = store.produtos.find(
      (item) => item.id === Number(data.productId),
    );

    if (!product) {
      throw new AppError("Produto indisponivel nesta loja", 404);
    }

    const productSnapshot = serializeChatProduct(product);

    return {
      content: {
        kind: "PRODUCT",
        product: productSnapshot,
        store: storeSnapshot,
      },
      message: data.message || (scope === "seller"
        ? `A loja compartilhou ${product.nome}.`
        : `Produto selecionado: ${product.nome}.`),
      type,
    };
  }

  if (type === "CATEGORIA") {
    if (!category) {
      throw new AppError("Esta loja nao possui categoria", 409);
    }

    return {
      content: {
        category,
        kind: "CATEGORY",
        store: storeSnapshot,
      },
      message: data.message || `Confira a categoria ${category.name}.`,
      type,
    };
  }

  return {
    content: {
      category,
      kind: "CATALOG",
      productCount: store._count.produtos,
      products: store.produtos.slice(0, 4).map(serializeChatProduct),
      store: storeSnapshot,
    },
    message: data.message || `A loja compartilhou o catalogo com ${store._count.produtos} produto${store._count.produtos === 1 ? "" : "s"}.`,
    type: "CATALOGO",
  };
}

async function getConversationAccess(userId, conversationId) {
  const id = parsePositiveId(conversationId, "Conversa invalida");
  const conversation = await storeChatsRepository.findAccessConversation(id);

  if (!conversation) {
    throw new AppError("Conversa nao encontrada", 404);
  }

  const isCustomer = conversation.cliente_usuario_id === userId;
  const isStore =
    conversation.loja.lojista.usuario_id === userId
    || conversation.loja.usuarios.some(
      (member) => member.usuario_id === userId && member.status === "ATIVO",
    );

  if (!isCustomer && !isStore) {
    throw new AppError("Voce nao pode acessar esta conversa", 403);
  }

  return { conversation, isCustomer, isStore };
}

async function loadConversation(conversationId) {
  return storeChatsRepository.loadConversation(conversationId);
}

export async function openStoreConversation(userId, storeIdValue) {
  ensureStoreChatPrismaClient();
  const storeId = parsePositiveId(storeIdValue, "Loja invalida");
  const store = await storeChatsRepository.findPublicStore(storeId);

  if (!store) {
    throw new AppError("Loja indisponivel para conversa", 404);
  }

  if (
    store.lojista.usuario_id === userId
    || store.usuarios.some((member) => member.usuario_id === userId)
  ) {
    throw new AppError(
      "Esta loja esta vinculada a sua conta. Use a Central de Vendas para atender os clientes.",
      409,
    );
  }

  const existing = await storeChatsRepository.findConversationByPair(userId, storeId);
  const conversation = existing
    ?? await storeChatsRepository.createConversation(userId, storeId);
  const detail = await loadConversation(conversation.id);

  if (!existing) {
    emitStoreChatCreated({
      conversationId: detail.id,
      customerUserId: detail.cliente_usuario_id,
      storeId: detail.loja_id,
    });
  }

  return {
    conversation: serializeConversation(detail, userId, {
      includeMessages: true,
      scope: "customer",
    }),
  };
}

export async function listStoreConversations(
  userId,
  { scope = "customer", storeId: storeIdValue } = {},
) {
  ensureStoreChatPrismaClient();
  const isSeller = scope === "seller";
  const storeId = storeIdValue
    ? parsePositiveId(storeIdValue, "Loja invalida")
    : null;
  const conversations = await storeChatsRepository.list(userId, {
    isSeller,
    storeId,
  });

  return {
    conversations: conversations.map((conversation) =>
      serializeConversation(conversation, userId, {
        scope: isSeller ? "seller" : "customer",
      })),
  };
}

export async function getStoreConversation(userId, conversationId) {
  ensureStoreChatPrismaClient();
  const access = await getConversationAccess(userId, conversationId);
  const scope = access.isCustomer ? "customer" : "seller";
  const markedAsRead = await storeChatsRepository.markRead(access.conversation.id, scope);

  const conversation = await loadConversation(access.conversation.id);

  if (markedAsRead > 0) {
    emitStoreChatUpdated({
      conversationId: conversation.id,
      customerUserId: conversation.cliente_usuario_id,
      reason: "read",
      storeId: conversation.loja_id,
    });
  }

  return {
    conversation: serializeConversation(conversation, userId, {
      includeMessages: true,
      scope,
    }),
  };
}

export async function createStoreConversationMessage(
  userId,
  conversationId,
  data,
  attachmentFile = null,
) {
  ensureStoreChatPrismaClient();
  const access = await getConversationAccess(userId, conversationId);

  if (access.conversation.status !== "ABERTA") {
    throw new AppError("Esta conversa nao aceita novas mensagens", 409);
  }

  const scope = access.isCustomer ? "customer" : "seller";
  const commercialMessage = await buildCommercialMessage(access, data, scope);
  const attachment = await savePrivateChatAttachment(attachmentFile, data, {
    conversationId: access.conversation.id,
    scope: "store",
  });
  if (attachment) commercialMessage.content = { ...(commercialMessage.content ?? {}), ...attachment };
  let message;
  try {
    message = await storeChatsRepository.createMessage({ access, commercialMessage, scope, userId });
  } catch (error) {
    await deletePrivateChatAttachment(attachment);
    throw error;
  }
  const conversation = await loadConversation(access.conversation.id);
  const serializedMessage = serializeMessage(message, userId);

  emitStoreChatMessageCreated({
    conversationId: conversation.id,
    customerUserId: conversation.cliente_usuario_id,
    message: serializedMessage,
    storeId: conversation.loja_id,
  });

  return {
    conversation: serializeConversation(conversation, userId, {
      includeMessages: true,
      scope,
    }),
    message: serializedMessage,
  };
}

export async function trackStoreConversationActivity(userId, conversationId, data) {
  ensureStoreChatPrismaClient();
  const access = await getConversationAccess(userId, conversationId);
  if (!access.isCustomer) throw new AppError("Somente o cliente registra a jornada de compra", 403);
  if (access.conversation.status !== "ABERTA") return { tracked: false };

  const store = await storeChatsRepository.findCatalogStore(access.conversation.loja_id);
  if (!store) throw new AppError("Loja nao encontrada", 404);
  const product = data.productId
    ? store.produtos.find((item) => item.id === Number(data.productId))
    : null;
  if (data.productId && !product) throw new AppError("Produto indisponivel nesta loja", 404);

  const labels = {
    ADD_TO_CART: product ? `Cliente adicionou ${product.nome} ao carrinho.` : "Cliente adicionou um produto ao carrinho.",
    START_CHECKOUT: "Cliente avancou para revisar e pagar o pedido.",
    VIEW_PRODUCT: product ? `Cliente abriu ${product.nome}.` : "Cliente abriu um produto.",
  };
  const content = product
    ? {
        action: data.action,
        kind: "PRODUCT",
        product: serializeChatProduct(product),
        store: serializeChatStore(store),
      }
    : { action: data.action, kind: "CHECKOUT", store: serializeChatStore(store) };

  await storeChatsRepository.createSystemActivity(access.conversation.id, {
    content,
    message: labels[data.action],
  });
  const conversation = await loadConversation(access.conversation.id);
  emitStoreChatUpdated({
    conversationId: conversation.id,
    customerUserId: conversation.cliente_usuario_id,
    reason: "customer-journey",
    storeId: conversation.loja_id,
  });
  return { tracked: true };
}
