export const activeCourierConversationStatuses = [
  "ABERTA",
  "ACORDADA",
  "AGUARDANDO_CONFIRMACAO",
];

export async function getBusyCourierSellerIds(database, sellerIds = []) {
  const repository = database?.findServiceConversations
    ? database
    : database?.findConversations
      ? { findServiceConversations: database.findConversations }
      : createCourierRepository(database);
  const uniqueSellerIds = [...new Set(sellerIds.filter(Boolean))];
  if (!uniqueSellerIds.length) return new Set();

  const conversations = await repository.findServiceConversations({
    distinct: ["vendedor_id"],
    select: { vendedor_id: true },
    where: {
      status: { in: activeCourierConversationStatuses },
      vendedor_id: { in: uniqueSellerIds },
      servico_vendedor: {
        is: {
          tipo_servico: {
            is: { tipo_operacao: "ENTREGA_LOCAL" },
          },
        },
      },
    },
  });

  return new Set(conversations.map((conversation) => conversation.vendedor_id));
}

export async function isCourierSellerBusy(database, sellerId) {
  const repository = database?.findServiceConversation
    ? database
    : database?.findConversation
      ? { findServiceConversation: database.findConversation }
      : createCourierRepository(database);
  if (!sellerId) return false;

  const conversation = await repository.findServiceConversation({
    select: { id: true },
    where: {
      status: { in: activeCourierConversationStatuses },
      vendedor_id: sellerId,
      servico_vendedor: {
        is: {
          tipo_servico: {
            is: { tipo_operacao: "ENTREGA_LOCAL" },
          },
        },
      },
    },
  });

  return Boolean(conversation);
}
import { createCourierRepository } from "./courier.repository.js";
