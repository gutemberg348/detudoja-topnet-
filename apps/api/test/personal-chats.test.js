import assert from "node:assert/strict";
import test from "node:test";
import {
  createFriendInvitationSchema,
  createPersonalMessageSchema,
  lookupPersonalContactSchema,
  updateFriendAliasSchema,
} from "../src/modules/personal-chats/personal-chats.validator.js";

test("convite exige um identificador publico valido", () => {
  assert.equal(
    createFriendInvitationSchema.safeParse({ publicId: "@guto.12ab" }).success,
    true,
  );
  assert.equal(
    createFriendInvitationSchema.safeParse({ publicId: "  " }).success,
    false,
  );
  assert.equal(
    lookupPersonalContactSchema.safeParse({ publicId: "DTJ:FRIEND:guto.12ab" }).success,
    true,
  );
});

test("mensagem pessoal rejeita texto vazio e limita o tamanho", () => {
  assert.equal(
    createPersonalMessageSchema.safeParse({ message: "Ola" }).success,
    true,
  );
  assert.equal(
    createPersonalMessageSchema.safeParse({ message: "   " }).success,
    false,
  );
  assert.equal(
    createPersonalMessageSchema.safeParse({ message: "a".repeat(2001) }).success,
    false,
  );
});

test("apelido pode ser removido sem aceitar valores excessivos", () => {
  assert.equal(updateFriendAliasSchema.safeParse({ alias: null }).success, true);
  assert.equal(
    updateFriendAliasSchema.safeParse({ alias: "Amigo da faculdade" }).success,
    true,
  );
  assert.equal(
    updateFriendAliasSchema.safeParse({ alias: "a".repeat(81) }).success,
    false,
  );
});
