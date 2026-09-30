import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertSandboxApproval, assertSandboxLedgerIsolation, sandboxApprovalEnabled, sandboxOnlyConfiguration,
} from "../src/modules/payments/sandbox-approval.js";
import { sandboxPaymentApprovalSchema } from "../src/modules/admin/admin.validator.js";

const config = { PAYMENTS_ENVIRONMENT: "sandbox", PAYMENTS_SANDBOX_MANUAL_APPROVAL_ENABLED: "true",
  SICREDI_PIX_ENV: "sandbox", SICREDI_MULTIPAG_ENV: "sandbox", ASAAS_ENABLED: "true",
  ASAAS_API_URL: "https://api-sandbox.asaas.com/v3" };
const payment = { gateway: "SICREDI", gateway_ambiente: "sandbox", status: "AGUARDANDO_PAGAMENTO", valor_pago_pix_centavos: 1000n };

test("aprovacao e opt-in e exige todo o ambiente Sandbox", () => {
  assert.equal(sandboxApprovalEnabled(config), true);
  assert.equal(sandboxApprovalEnabled({}), false);
  for (const changed of [
    { PAYMENTS_ENVIRONMENT: "production" }, { SICREDI_PIX_ENV: "production" },
    { SICREDI_MULTIPAG_ENV: "production" }, { ASAAS_API_URL: "https://api.asaas.com/v3" },
    { SICREDI_PIX_API_URL: "https://api-pix.sicredi.com.br/api/v2" },
    { SICREDI_MULTIPAG_API_URL: "https://mtls-api-parceiro.sicredi.com.br/multipag" },
  ]) assert.equal(sandboxApprovalEnabled({ ...config, ...changed }), false);
});
test("registros antigos, de producao, internos ou ja pagos nao podem ser aprovados", () => {
  assert.doesNotThrow(() => assertSandboxApproval(payment, "PAYMENT_RECEIVED", config));
  for (const changed of [{ gateway_ambiente: null }, { gateway_ambiente: "production" },
    { gateway: "INTERNO" }, { status: "PAGO" }, { status: "CANCELADO" }, { valor_pago_pix_centavos: 0n }]) {
    assert.throws(() => assertSandboxApproval({ ...payment, ...changed }, "PAYMENT_RECEIVED", config));
  }
});
test("estorno simulado exige aprovacao manual anterior e solicitacao de estorno", () => {
  assert.throws(() => assertSandboxApproval({ ...payment, status: "EM_DISPUTA" }, "PAYMENT_REFUNDED", config));
  assert.doesNotThrow(() => assertSandboxApproval({ ...payment, status: "EM_DISPUTA",
    gateway_dados_json: { sandboxManualApproval: { adminId: 1 } } }, "PAYMENT_REFUNDED", config));
  assert.throws(() => assertSandboxApproval(payment, "qualquer", config));
});
test("schema exige confirmacao explicita e motivo; rejeita dados extras", () => {
  const valid = { action: "pay", confirmation: "CONFIRMO_SANDBOX", reason: "Teste do checkout" };
  assert.equal(sandboxPaymentApprovalSchema.safeParse(valid).success, true);
  for (const changed of [{ confirmation: "sim" }, { reason: "ok" }, { action: "withdraw" }, { adminId: 42 }]) {
    assert.equal(sandboxPaymentApprovalSchema.safeParse({ ...valid, ...changed }).success, false);
  }
});
test("historico de simulacoes bloqueia producao mesmo apos desligar a flag", async () => {
  const database = { auditoriaAdministrativa: { async findFirst() { return { id: 1 }; } } };
  await assert.rejects(assertSandboxLedgerIsolation(database, { PAYMENTS_ENVIRONMENT: "production" }), /banco limpo/);
  await assert.doesNotReject(assertSandboxLedgerIsolation(database, { ...config, PAYMENTS_SANDBOX_MANUAL_APPROVAL_ENABLED: "false" }));
});
test("banco limpo pode operar em producao, mas nao com a flag de simulacao ligada", async () => {
  const database = { auditoriaAdministrativa: { async findFirst() { return null; } } };
  await assert.doesNotReject(assertSandboxLedgerIsolation(database, { PAYMENTS_ENVIRONMENT: "production" }));
  await assert.rejects(assertSandboxLedgerIsolation(database, { ...config, PAYMENTS_ENVIRONMENT: "production" }));
  assert.equal(sandboxOnlyConfiguration({ PAYMENTS_ENVIRONMENT: "sandbox", SICREDI_PIX_AUTH_URL: "invalid" }), false);
});
