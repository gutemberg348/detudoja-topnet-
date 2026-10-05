import assert from "node:assert/strict";
import test from "node:test";
import { serviceRegistrationFeedback, withdrawalFeedback } from "../src/utils/action-feedback.js";
import { recentConversationsLayout } from "../src/utils/recent-conversations-layout.js";

test("recent conversations fit complete pages on small phones and wider screens", () => {
  const items = Array.from({ length: 8 }, (_item, id) => ({ id }));
  for (const width of [280, 320, 346, 390, 400, 430, 540]) {
    const { columns, itemWidth, pages } = recentConversationsLayout(width, items);
    assert.equal(columns, width < 400 ? 3 : 4);
    assert.ok(Math.abs(itemWidth * columns + (columns - 1) * 8 + 32 - width) < 0.001);
    assert.deepEqual(pages.flat(), items);
    assert.ok(pages.every((page) => page.length <= columns));
  }
});

test("fewer contacts keep their slot width so the last page can be centered", () => {
  for (const count of [0, 1, 2, 3, 4, 7, 8]) {
    const items = Array.from({ length: count }, (_item, id) => ({ id }));
    const result = recentConversationsLayout(346, items);
    assert.equal(result.pages.length, Math.ceil(count / 3));
    assert.equal(result.itemWidth, recentConversationsLayout(346, Array(8).fill({})).itemWidth);
  }
});

test("service registration describes the server's canonical name and actual availability", () => {
  const active = serviceRegistrationFeedback({ name: "Eletricista residencial", available: true }, { name: "eletricista", available: false });
  assert.match(active[1], /Eletricista residencial/);
  assert.match(active[1], /disponibilidade ativada/);
  const paused = serviceRegistrationFeedback({ name: "Eletricista", available: false }, { name: "eletricista", available: true });
  assert.match(paused[1], /Ative a disponibilidade/);
});

test("a withdrawal request is never described as paid before bank confirmation", () => {
  for (const status of [undefined, "SOLICITADO", "EM_ANALISE", "APROVADO", "PROCESSANDO", "EM_RECONCILIACAO"]) {
    const [title, message, tone] = withdrawalFeedback(status);
    assert.doesNotMatch(`${title} ${message}`, /Pix enviado|banco confirmou/);
    assert.equal(tone, "info");
  }
  assert.equal(withdrawalFeedback("PAGO")[0], "Pix enviado");
});

test("withdrawal failures do not show successful completion or promise a refund", () => {
  for (const status of ["FALHOU", "CANCELADO", "RECUSADO"]) {
    const [title, message, tone] = withdrawalFeedback(status);
    assert.equal(title, "Saque não enviado");
    assert.equal(tone, "error");
    assert.doesNotMatch(message, /voltou|devolvido|enviado com sucesso/);
  }
});
