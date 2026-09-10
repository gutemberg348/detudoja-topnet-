import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../src/config/prisma.js";
import {
  createFriendInvitation,
  createPersonalMessage,
  decideFriendInvitation,
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

test("contato pessoal percorre busca, convite, apelido privado, mensagem e leitura", async () => {
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
    publicId: "DTJ:FRIEND:bia.teste.contato",
  });
  const conversationId = invitation.request.id;
  const incoming = await lookupPersonalContact(state.bia.id, {
    publicId: "ana.teste.contato",
  });
  assert.equal(incoming.contact.relationship.status, "PENDENTE");
  assert.equal(incoming.contact.relationship.invitationDirection, "incoming");

  await assert.rejects(
    decideFriendInvitation(state.ana.id, conversationId, true),
    (error) => error.statusCode === 403,
  );
  await decideFriendInvitation(state.bia.id, conversationId, true);
  await assert.rejects(
    decideFriendInvitation(state.bia.id, conversationId, false),
    (error) => error.statusCode === 409,
  );

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

  const secondInvitation = await createFriendInvitation(state.ana.id, {
    publicId: "caio.teste.contato",
  });
  const decisions = await Promise.allSettled([
    decideFriendInvitation(state.caio.id, secondInvitation.request.id, true),
    decideFriendInvitation(state.caio.id, secondInvitation.request.id, false),
  ]);
  assert.equal(decisions.filter((decision) => decision.status === "fulfilled").length, 1);
  assert.equal(decisions.filter((decision) => decision.status === "rejected").length, 1);
});
