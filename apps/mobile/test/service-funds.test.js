import assert from "node:assert/strict";
import test from "node:test";
import { serviceFundsCopy } from "../src/utils/service-funds.js";

test("prazo de servico nao depende de confirmacao nem confunde pagamento com saldo liberado", () => {
  assert.match(serviceFundsCopy({ state: "AWAITING_SERVICE" }, true).text, /reservado/);
  assert.match(serviceFundsCopy({ state: "PENDING_RELEASE" }, true).text, /sem depender/);
  assert.match(serviceFundsCopy({ state: "PENDING_RELEASE" }, false).text, /conteste/);
  assert.match(serviceFundsCopy({ state: "DISPUTED" }, true).text, /bloqueou/);
  assert.match(serviceFundsCopy({ state: "AWAITING_SERVICE", requiresDeliveryConfirmation: true }, true).text, /vinculada a uma loja/);
});

test("somente repasse confirmado e apresentado como Pix enviado", () => {
  for (const status of [null, "PENDENTE", "PROCESSANDO", "EM_RECONCILIACAO", "FALHOU", "CANCELADO"]) {
    assert.notEqual(serviceFundsCopy({ state: "RELEASED", payoutStatus: status, destination: "PIX" }, true).title, "Pix enviado");
  }
  assert.equal(serviceFundsCopy({ state: "RELEASED", payoutStatus: "PAGO" }, true).title, "Pix enviado");
  assert.match(serviceFundsCopy({ state: "RELEASED", destination: "SALES_WALLET" }, true).text, /carteira de vendas/);
});
