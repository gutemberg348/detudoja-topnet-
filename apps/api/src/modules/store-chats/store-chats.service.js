import {
  emitStoreChatCreated,
  emitStoreChatMessageCreated,
  emitStoreChatUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
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
    author,
    content: message.conteudo_json ?? null,
    createdAt: message.criado_em.toISOString(),
    id: message.id,
    isMine: message.autor_usuario_id === viewerId,
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

  if (scope !== "seller" && type !== "TEXTO") {
    throw new AppError("Somente a loja pode compartilhar o catalogo", 403);
  }

  if (type === "TEXTO") {
    return {
      content: null,
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
      message: data.message || `A loja compartilhou ${product.nome}.`,
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
    throw new AppError("Use o painel da loja para responder clientes", 409);
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
  await storeChatsRepository.markRead(access.conversation.id, scope);

  const conversation = await loadConversation(access.conversation.id);

  emitStoreChatUpdated({
    conversationId: conversation.id,
    customerUserId: conversation.cliente_usuario_id,
    reason: "read",
    storeId: conversation.loja_id,
  });

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
) {
  ensureStoreChatPrismaClient();
  const access = await getConversationAccess(userId, conversationId);

  if (access.conversation.status !== "ABERTA") {
    throw new AppError("Esta conversa nao aceita novas mensagens", 409);
  }

  const scope = access.isCustomer ? "customer" : "seller";
  const commercialMessage = await buildCommercialMessage(access, data, scope);
  const message = await storeChatsRepository.createMessage({
    access,
    commercialMessage,
    scope,
    userId,
  });
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
