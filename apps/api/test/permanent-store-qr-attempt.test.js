import assert from "node:assert/strict";
import { test } from "node:test";
import { permanentQrAttemptRetryDetails } from "../src/modules/charges/charge.service.js";

test("QR permanente permite nova chave quando a tentativa nem iniciou ou terminou", () => {
  assert.deepEqual(permanentQrAttemptRetryDetails({ status: "ATIVA", pagamento: null }), {
    code: "PAYMENT_ATTEMPT_NOT_STARTED",
    retryWithNewKey: true,
  });
  assert.deepEqual(permanentQrAttemptRetryDetails({ status: "CANCELADA", pagamento: { status: "FALHOU" } }), {
    code: "PAYMENT_ATTEMPT_FINAL_FAILURE",
    retryWithNewKey: true,
  });
});

test("QR permanente conserva a chave em pagamento pendente ou incerto", () => {
  assert.equal(permanentQrAttemptRetryDetails({ status: "PROCESSANDO", pagamento: { status: "AGUARDANDO_PAGAMENTO" } }), null);
  assert.equal(permanentQrAttemptRetryDetails({ status: "PROCESSANDO", pagamento: { status: "EM_RECONCILIACAO" } }), null);
  assert.equal(permanentQrAttemptRetryDetails(null), null);
});
