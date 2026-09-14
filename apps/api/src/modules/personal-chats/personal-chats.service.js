import {
  emitPersonalChatCreated,
  emitPersonalChatMessageCreated,
  emitPersonalChatUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { personalChatsRepository } from "./personal-chats.repository.js";

function ensurePrismaClient() {
  if (!personalChatsRepository.isClientAvailable()) {
    throw new AppError(
      "Prisma Client desatualizado. Pare a API e execute a migration conversas_pessoais.",
      503,
    );
  }
}

function normalizePublicId(value) {
  return String(value ?? "")
    .trim()
    .replace(/^DTJ:FRIEND:/i, "")
    .replace(/^detudoja:\/\/friends\/add\?id=/i, "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
}

function slugifyName(name) {
  const slug = String(name ?? "usuario")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48);

  return slug || "usuario";
}

function buildPublicId(user) {
  return `${slugifyName(user.nome)}.${Number(user.id).toString(36)}`;
}

async function ensurePublicId(userId) {
  const user = await personalChatsRepository.findUserById(userId);

  if (!user) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  if (user.identificador_publico) {
    return user;
  }

  return personalChatsRepository.updatePublicId(user.id, buildPublicId(user));
}

function getViewerSide(conversation, userId) {
  if (conversation.usuario_a_id === userId) return "a";
  if (conversation.usuario_b_id === userId) return "b";
  return null;
}

function getParticipantIds(conversation) {
  return [conversation.usuario_a_id, conversation.usuario_b_id];
}

function serializeMessage(message, viewerId) {
  return {
    createdAt: message.criado_em.toISOString(),
    id: message.id,
    isMine: message.autor_usuario_id === viewerId,
    readAt: message.lido_em?.toISOString() ?? null,
    text: message.mensagem,
  };
}

function serializeConversation(conversation, viewerId, includeMessages = false) {
  const viewerSide = getViewerSide(conversation, viewerId);
  const other = viewerSide === "a" ? conversation.usuario_b : conversation.usuario_a;
  const alias = viewerSide === "a"
    ? conversation.apelido_usuario_a
    : conversation.apelido_usuario_b;
  const unreadCount = viewerSide === "a"
    ? conversation.nao_lidas_usuario_a
    : conversation.nao_lidas_usuario_b;
  const messages = includeMessages
    ? [...(conversation.mensagens ?? [])]
      .reverse()
      .map((message) => serializeMessage(message, viewerId))
    : undefined;
  const newestMessage = conversation.mensagens?.[0];

  return {
    alias,
    createdAt: conversation.criado_em.toISOString(),
    displayName: alias || other.nome,
    id: conversation.id,
    invitationDirection: conversation.solicitado_por_id === viewerId
      ? "outgoing"
      : "incoming",
    lastMessage: newestMessage
      ? serializeMessage(newestMessage, viewerId)
      : null,
    ...(includeMessages ? { messages } : {}),
    person: {
      name: other.nome,
      photoUrl: other.foto_url,
      publicId: other.identificador_publico,
    },
    status: conversation.status,
    unreadCount: Math.max(0, unreadCount),
    updatedAt: (
      conversation.ultima_mensagem_em
      ?? conversation.atualizado_em
    ).toISOString(),
  };
}

async function getConversationAccess(userId, conversationId, { active = false } = {}) {
  const id = parsePositiveId(conversationId, "Conversa invalida");
  const conversation = await personalChatsRepository.findById(id);
  const viewerSide = conversation ? getViewerSide(conversation, userId) : null;

  if (!conversation || !viewerSide) {
    throw new AppError("Conversa nao encontrada", 404);
  }

  if (active && !["ATIVA", "PENDENTE"].includes(conversation.status)) {
    throw new AppError("Esta conversa nao esta disponivel", 409);
  }

  return { conversation, viewerSide };
}

export async function listPersonalChats(userId) {
  ensurePrismaClient();
  const profile = await ensurePublicId(userId);
  const conversations = await personalChatsRepository.listForUser(userId);
  const active = conversations.filter((item) =>
    ["ATIVA", "PENDENTE"].includes(item.status));

  return {
    conversations: active.map((item) => serializeConversation(item, userId)),
    profile: {
      name: profile.nome,
      photoUrl: profile.foto_url,
      publicId: profile.identificador_publico,
      qrValue: `DTJ:FRIEND:${profile.identificador_publico}`,
    },
    requests: [],
  };
}

export async function lookupPersonalContact(userId, data) {
  ensurePrismaClient();
  const profile = await ensurePublicId(userId);
  const target = await personalChatsRepository.findUserByPublicId(
    normalizePublicId(data.publicId),
  );

  if (!target) {
    throw new AppError("Nenhum usuario encontrado com este ID", 404);
  }

  if (target.id === userId) {
    return {
      contact: {
        isSelf: true,
        name: profile.nome,
        photoUrl: profile.foto_url,
        publicId: profile.identificador_publico,
        relationship: null,
      },
    };
  }

  const [userAId, userBId] = [userId, target.id].sort((a, b) => a - b);
  const relationship = await personalChatsRepository.findByPair(userAId, userBId);

  return {
    contact: {
      isSelf: false,
      name: target.nome,
      photoUrl: target.foto_url,
      publicId: target.identificador_publico,
      relationship: relationship
        ? {
            conversationId: relationship.id,
            invitationDirection: relationship.solicitado_por_id === userId
              ? "outgoing"
              : "incoming",
            status: relationship.status,
          }
        : null,
    },
  };
}

export async function createFriendInvitation(userId, data) {
  ensurePrismaClient();
  await ensurePublicId(userId);
  const initialMessage = String(data.message ?? "").trim()
    || "Ola! Quero conversar com voce.";
  const target = await personalChatsRepository.findUserByPublicId(
    normalizePublicId(data.publicId),
  );

  if (!target) {
    throw new AppError("Nenhum usuario encontrado com este ID", 404);
  }

  if (target.id === userId) {
    throw new AppError("Use o seu QR para compartilhar seu perfil", 409);
  }

  const [userAId, userBId] = [userId, target.id].sort((a, b) => a - b);
  const existing = await personalChatsRepository.findByPair(userAId, userBId);

  if (existing?.status === "ATIVA") {
    throw new AppError("Ja existe uma conversa com este usuario", 409);
  }

  if (existing?.status === "BLOQUEADA") {
    throw new AppError("Nao foi possivel enviar a mensagem para este contato", 409);
  }

  if (existing?.status === "PENDENTE") {
    const conversation = await personalChatsRepository.findById(existing.id);
    return { request: serializeConversation(conversation, userId) };
  }

  let messageRequest;

  try {
    messageRequest = existing
      ? await personalChatsRepository.reopenMessageRequest(
          existing.id,
          userId,
          initialMessage,
          userAId,
        )
      : await personalChatsRepository.createMessageRequest({
          requesterId: userId,
          text: initialMessage,
          userAId,
          userBId,
        });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError("Ja existe uma solicitacao entre estas contas", 409);
    }
    throw error;
  }
  const conversation = await personalChatsRepository.findById(messageRequest.id);

  emitPersonalChatCreated({
    conversationId: conversation.id,
    userIds: getParticipantIds(conversation),
  });

  return { request: serializeConversation(conversation, userId) };
}

export async function decideFriendInvitation(userId, conversationId, accepted) {
  ensurePrismaClient();
  const access = await getConversationAccess(userId, conversationId);

  if (access.conversation.status !== "PENDENTE") {
    throw new AppError("Esta solicitacao ja foi respondida", 409);
  }

  if (access.conversation.solicitado_por_id === userId) {
    throw new AppError("Somente quem recebeu a mensagem pode responder", 403);
  }

  const decided = await personalChatsRepository.decidePendingInvitation(
    access.conversation.id,
    userId,
    accepted ? "ATIVA" : "RECUSADA",
  );

  if (decided.count !== 1) {
    throw new AppError("Esta solicitacao ja foi respondida", 409);
  }
  if (accepted) {
    await personalChatsRepository.markRead(
      access.conversation.id,
      userId,
      access.viewerSide,
    );
  }
  const conversation = await personalChatsRepository.findById(access.conversation.id);

  emitPersonalChatUpdated({
    conversationId: conversation.id,
    reason: accepted ? "accepted" : "declined",
    userIds: getParticipantIds(conversation),
  });

  return {
    conversation: accepted
      ? serializeConversation(conversation, userId, true)
      : null,
    status: conversation.status,
  };
}

export async function blockPersonalChat(userId, conversationId) {
  ensurePrismaClient();
  const access = await getConversationAccess(userId, conversationId);
  const blocked = await personalChatsRepository.blockConversation(
    access.conversation.id,
    userId,
  );

  if (blocked.count !== 1) {
    throw new AppError("Esta conversa nao pode mais ser bloqueada", 409);
  }

  emitPersonalChatUpdated({
    conversationId: access.conversation.id,
    reason: "blocked",
    userIds: getParticipantIds(access.conversation),
  });

  return { status: "BLOQUEADA" };
}

export async function updateFriendAlias(userId, conversationId, data) {
  ensurePrismaClient();
  const access = await getConversationAccess(userId, conversationId, { active: true });
  await personalChatsRepository.updateAlias(
    access.conversation.id,
    access.viewerSide,
    data.alias || null,
  );
  const conversation = await personalChatsRepository.findById(access.conversation.id);

  emitPersonalChatUpdated({
    conversationId: conversation.id,
    reason: "alias-updated",
    userIds: [userId],
  });

  return { conversation: serializeConversation(conversation, userId) };
}

export async function getPersonalChat(userId, conversationId) {
  ensurePrismaClient();
  const access = await getConversationAccess(userId, conversationId, { active: true });
  const markedAsRead = await personalChatsRepository.markRead(
    access.conversation.id,
    userId,
    access.viewerSide,
  );
  const conversation = await personalChatsRepository.findById(access.conversation.id);

  if (markedAsRead > 0) {
    emitPersonalChatUpdated({
      conversationId: conversation.id,
      reason: "read",
      userIds: getParticipantIds(conversation),
    });
  }

  return { conversation: serializeConversation(conversation, userId, true) };
}

export async function createPersonalMessage(userId, conversationId, data) {
  ensurePrismaClient();
  const access = await getConversationAccess(userId, conversationId, { active: true });
  const recipientSide = access.viewerSide === "a" ? "b" : "a";
  let message;
  try {
    message = await personalChatsRepository.createMessage({
      conversationId: access.conversation.id,
      recipientSide,
      text: data.message,
      userId,
    });
  } catch (error) {
    if (error?.code === "PERSONAL_CHAT_INACTIVE") {
      throw new AppError("Esta conversa foi encerrada ou bloqueada", 409);
    }
    throw error;
  }
  const conversation = await personalChatsRepository.findById(access.conversation.id);
  const serializedMessage = serializeMessage(message, userId);

  emitPersonalChatMessageCreated({
    conversationId: conversation.id,
    message: serializedMessage,
    userIds: getParticipantIds(conversation),
  });

  return {
    conversation: serializeConversation(conversation, userId, true),
    message: serializedMessage,
  };
}
