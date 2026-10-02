import assert from "node:assert/strict";
import test from "node:test";
import { addressDirectionsUrl } from "../src/utils/chat-address.js";
import { attachmentPermissionError, chatAttachmentNotice } from "../src/utils/chat-attachment-errors.js";

test("denied chat permissions become discreet notices without forcing settings", () => {
  for (const resource of ["location", "camera", "photos", "microphone"]) {
    const notice = chatAttachmentNotice(attachmentPermissionError(resource, { canAskAgain: true }));
    assert.match(notice.text, /Sem acesso/);
    assert.equal(notice.settings, false);
  }
});

test("permanently blocked permissions offer settings", () => {
  const notice = chatAttachmentNotice(attachmentPermissionError("location", { canAskAgain: false }));
  assert.match(notice.text, /ajustes/);
  assert.equal(notice.settings, true);
});

test("Android unsatisfied device settings is translated to GPS guidance", () => {
  for (const message of ["Location request failed due to unsatisfied device settings", "GPS desativado"]) {
    const notice = chatAttachmentNotice(new Error(message));
    assert.match(notice.text, /Ative o GPS/);
    assert.doesNotMatch(notice.text, /request failed|unsatisfied/);
    assert.equal(notice.settings, false);
  }
});

test("native permission errors are handled but upload errors stay in the error flow", () => {
  assert.equal(chatAttachmentNotice(new Error("Permission denied")).settings, true);
  assert.equal(chatAttachmentNotice(new Error("O arquivo excede 10 MB")), null);
});

test("directions target the shared full address, safely encoding accents and punctuation", () => {
  const url = new URL(addressDirectionsUrl({ street: "Rua São Pedro", number: "88", district: "Jatobá", city: "Patos", state: "PB", zipCode: "58707480", complement: "Casa & fundos", reference: "Portão azul" }));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/dir/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("destination"), "Rua São Pedro, 88, Jatobá, Patos, PB, 58707480, Brasil");
  assert.equal(url.searchParams.has("origin"), false);
});

test("older addresses with optional fields missing still form a clean map query", () => {
  const url = new URL(addressDirectionsUrl({ street: "Rua A", number: 0, city: "Patos", state: "PB" }));
  assert.equal(url.searchParams.get("destination"), "Rua A, 0, Patos, PB, Brasil");
});
