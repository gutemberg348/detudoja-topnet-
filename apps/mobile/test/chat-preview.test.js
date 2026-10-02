import assert from "node:assert/strict";
import test from "node:test";
import { chatMessagePreview } from "../src/utils/chat-preview.js";

for (const [type, label] of Object.entries({ IMAGE: "Foto", VIDEO: "Vídeo", AUDIO: "Áudio", LOCATION: "Localização" })) {
  test(`${type} is described instead of falling back to the contact ID`, () => {
    for (const text of [null, undefined, "", "   "]) {
      assert.equal(chatMessagePreview({ attachment: { type }, text }, "@guto"), label);
    }
  });
}

test("keeps captions alongside the attachment type", () => {
  assert.equal(chatMessagePreview({ attachment: { type: "IMAGE" }, text: "  Comprovante  " }), "Foto · Comprovante");
});

test("plain text and system messages remain readable", () => {
  assert.equal(chatMessagePreview({ text: "Oi!", attachment: null }), "Oi!");
  assert.equal(chatMessagePreview({ text: "Pedido concluído" }), "Pedido concluído");
});

test("uses the fallback only for an absent or empty message", () => {
  for (const message of [null, undefined, {}, { text: "  " }]) {
    assert.equal(chatMessagePreview(message, "@guto"), "@guto");
  }
});

test("unknown attachments do not leak file paths or fall back to the contact ID", () => {
  assert.equal(chatMessagePreview({ attachment: { type: "FILE", url: "/private/file" } }, "@guto"), "Anexo");
});
