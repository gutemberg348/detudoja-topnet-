import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../src/config/prisma.js";
import {
  blockPersonalChat,
  createFriendInvitation,
  createPersonalMessage,
  getPersonalChat,
  listPersonalChats,
  lookupPersonalContact,
  updateFriendAlias,
} from "../src/modules/personal-chats/personal-chats.service.js";

const marker = "personal-chat-flow.local";
const state = {};

async function cleanup() {
  const users = await prisma.usuario.findMany({
    select: { id: true },
    where: { email: { endsWith: `@${marker}` } },
  });
  const userIds = users.map((user) => user.id);
  if (!userIds.length) return;

  await prisma.conversaPessoal.deleteMany({
    where: {
      OR: [
        { usuario_a_id: { in: userIds } },
        { usuario_b_id: { in: userIds } },
      ],
    },
  });
  await prisma.usuario.deleteMany({ where: { id: { in: userIds } } });
}

before(async () => {
  await prisma.$connect();
  await cleanup();
  const [ana, bia, caio] = await Promise.all([
    prisma.usuario.create({
      data: {
        email: `ana@${marker}`,
        identificador_publico: "ana.teste.contato",
        nome: "Ana Teste",
        senha_hash: "not-used",
        status: "ATIVO",
      },
    }),
    prisma.usuario.create({
      data: {
        email: `bia@${marker}`,
        identificador_publico: "bia.teste.contato",
        nome: "Bia Teste",
        senha_hash: "not-used",
        status: "ATIVO",
      },
    }),
    prisma.usuario.create({
      data: {
        email: `caio@${marker}`,
        identificador_publico: "caio.teste.contato",
        nome: "Caio Teste",
        senha_hash: "not-used",
        status: "ATIVO",
      },
    }),
  ]);
  Object.assign(state, { ana, bia, caio });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("primeira mensagem abre a conversa sem aceite e o bloqueio encerra o contato", async () => {
  const found = await lookupPersonalContact(state.ana.id, { publicId: "@bia.teste.contato" });
  assert.deepEqual(Object.keys(found.contact).sort(), [
    "isSelf",
    "name",
    "photoUrl",
    "publicId",
    "relationship",
  ]);
  assert.equal(found.contact.name, "Bia Teste");
  assert.equal(found.contact.relationship, null);

  const invitation = await createFriendInvitation(state.ana.id, {
    message: "Oi, Bia. Podemos conversar?",
    publicId: "DTJ:FRIEND:bia.teste.contato",
  });
  const conversationId = invitation.request.id;
  const incoming = await lookupPersonalContact(state.bia.id, {
    publicId: "ana.teste.contato",
  });
  assert.equal(incoming.contact.relationship.status, "ATIVA");
  assert.equal(incoming.contact.relationship.invitationDirection, "incoming");
  const incomingInbox = await listPersonalChats(state.bia.id);
  assert.equal(incomingInbox.requests.length, 0);
  assert.equal(incomingInbox.conversations[0].lastMessage.text, "Oi, Bia. Podemos conversar?");
  assert.equal(incomingInbox.conversations[0].unreadCount, 1);
  const initialConversation = await getPersonalChat(state.bia.id, conversationId);
  assert.equal(initialConversation.conversation.messages[0].text, "Oi, Bia. Podemos conversar?");

  await updateFriendAlias(state.ana.id, conversationId, { alias: "Bia Faculdade" });
  const [anaList, biaList] = await Promise.all([
    listPersonalChats(state.ana.id),
    listPersonalChats(state.bia.id),
  ]);
  assert.equal(anaList.conversations[0].displayName, "Bia Faculdade");
  assert.equal(biaList.conversations[0].displayName, "Ana Teste");

  await createPersonalMessage(state.ana.id, conversationId, { message: "Oi, Bia" });
  const unread = await listPersonalChats(state.bia.id);
  assert.equal(unread.conversations[0].unreadCount, 1);
  const opened = await getPersonalChat(state.bia.id, conversationId);
  assert.equal(opened.conversation.messages.at(-1).text, "Oi, Bia");
  const read = await listPersonalChats(state.bia.id);
  assert.equal(read.conversations[0].unreadCount, 0);

  await assert.rejects(
    getPersonalChat(state.caio.id, conversationId),
    (error) => error.statusCode === 404,
  );

  const secondConversation = await createFriendInvitation(state.ana.id, {
    message: "Oi, Caio.",
    publicId: "caio.teste.contato",
  });
  assert.equal(secondConversation.request.status, "ATIVA");
  await createPersonalMessage(state.caio.id, secondConversation.request.id, {
    message: "Oi, Ana.",
  });

  const [legacyUserAId, legacyUserBId] = [state.bia.id, state.caio.id]
    .sort((a, b) => a - b);
  const legacyPending = await prisma.conversaPessoal.create({
    data: {
      solicitado_por_id: state.bia.id,
      usuario_a_id: legacyUserAId,
      usuario_b_id: legacyUserBId,
    },
  });
  const legacyList = await listPersonalChats(state.caio.id);
  assert.equal(
    legacyList.conversations.some((item) => item.id === legacyPending.id),
    true,
  );
  await createPersonalMessage(state.caio.id, legacyPending.id, {
    message: "Essa conversa antiga continua funcionando.",
  });
  const activatedLegacy = await lookupPersonalContact(state.bia.id, {
    publicId: "caio.teste.contato",
  });
  assert.equal(activatedLegacy.contact.relationship.status, "ATIVA");

  await blockPersonalChat(state.bia.id, conversationId);
  await assert.rejects(
    createPersonalMessage(state.ana.id, conversationId, { message: "Ainda esta ai?" }),
    (error) => error.statusCode === 409,
  );
  const afterBlock = await listPersonalChats(state.ana.id);
  assert.equal(afterBlock.conversations.some((item) => item.id === conversationId), false);
});
