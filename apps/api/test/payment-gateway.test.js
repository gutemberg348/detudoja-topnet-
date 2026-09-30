import assert from "node:assert/strict";
import { test } from "node:test";
import { selectPaymentGateway, gatewayAvailability, isExternalPixGateway } from "../src/modules/payments/payment-gateway.js";
import { normalizeSicrediTransfer, sicrediCents, validateSicrediCharge, validateSicrediReceipt, validateSicrediRefund } from "../src/modules/payments/sicredi/sicredi.validation.js";
import { safeRequestPath } from "../src/utils/safe-request-path.js";

const config = {
  PAYMENTS_ENVIRONMENT: "sandbox", SICREDI_APP_SANDBOX_ENABLED: "true",
  ASAAS_ENABLED: "true", ASAAS_API_KEY: "test-key", ASAAS_API_URL: "https://api-sandbox.asaas.com/v3",
  SICREDI_PIX_ENABLED: "true", SICREDI_PIX_ENV: "sandbox", SICREDI_PIX_API_URL: "https://test.sicredi.com.br/api/v2",
  SICREDI_PIX_AUTH_URL: "https://test.sicredi.com.br/oauth/token", SICREDI_PIX_CLIENT_ID: "test", SICREDI_PIX_CLIENT_SECRET: "test",
  SICREDI_PIX_RECEIVING_KEY: "receiver@example.com", SICREDI_MULTIPAG_CERT_PATH: "/test/cert", SICREDI_MULTIPAG_KEY_PATH: "/test/key",
  SICREDI_MULTIPAG_ENV: "sandbox", SICREDI_MULTIPAG_CLIENT_ID: "test", SICREDI_MULTIPAG_CLIENT_SECRET: "test",
  SICREDI_MULTIPAG_CONTA: "000001", SICREDI_MULTIPAG_COOPERATIVA: "0100", SICREDI_MULTIPAG_DOCUMENTO: "11111111000111",
  SICREDI_MULTIPAG_TRANSFER_ENABLED: "true",
};
test("Sicredi e principal para receber e transferir; Asaas e fallback pre-envio", () => {
  assert.equal(selectPaymentGateway("receive", config), "SICREDI");
  assert.equal(selectPaymentGateway("transfer", config), "SICREDI");
  assert.equal(selectPaymentGateway("receive", { ...config, SICREDI_PIX_ENABLED: "false" }), "ASAAS");
  assert.equal(selectPaymentGateway("transfer", { ...config, SICREDI_MULTIPAG_TRANSFER_ENABLED: "false" }), "ASAAS");
});
test("credenciais Multipag nao habilitam recebimentos sem configuracao Pix", () => {
  assert.equal(selectPaymentGateway("receive", { ...config, SICREDI_PIX_CLIENT_ID: "" }), "ASAAS");
});
test("nao mistura ambientes nem habilita Sandbox no app implicitamente", () => {
  assert.equal(gatewayAvailability("receive", { ...config, SICREDI_PIX_ENV: "production" }).SICREDI, false);
  assert.equal(selectPaymentGateway("transfer", { ...config, SICREDI_APP_SANDBOX_ENABLED: "false" }), "ASAAS");
  assert.throws(() => selectPaymentGateway("receive", { ...config, PAYMENTS_ENVIRONMENT: "production" }), /Nenhum gateway/);
  assert.throws(() => selectPaymentGateway("receive", { ...config, SICREDI_PIX_ENABLED: "false", PAYMENTS_FALLBACK_GATEWAY: "NONE" }));
});
test("rotular URL produtiva como sandbox nao habilita operacoes", () => {
  assert.equal(gatewayAvailability("transfer", { ...config, SICREDI_MULTIPAG_API_URL: "https://mtls-api-parceiro.sicredi.com.br/multipag" }).SICREDI, false);
  assert.equal(gatewayAvailability("receive", { ...config, SICREDI_PIX_API_URL: "https://api-pix.sicredi.com.br/api/v2" }).SICREDI, false);
  assert.equal(gatewayAvailability("receive", { ...config, SICREDI_PIX_API_URL: "https://untrusted.example/api" }).SICREDI, false);
});
test("logs ocultam segredo da URL do webhook Pix", () => {
  assert.equal(safeRequestPath("/api/webhooks/sicredi/pix/secret-value/pix"), "/api/webhooks/sicredi/pix/[redacted]/pix");
  assert.equal(safeRequestPath("/api/webhooks/sicredi/multipag"), "/api/webhooks/sicredi/multipag");
});
test("rollback escolhe Asaas so para novos registros e preserva configuracao legada", () => {
  assert.equal(selectPaymentGateway("receive", { ...config, PAYMENTS_PRIMARY_GATEWAY: "ASAAS" }), "ASAAS");
  assert.equal(selectPaymentGateway("receive", { ASAAS_ENABLED: "true", ASAAS_API_KEY: "test", ASAAS_API_URL: "https://api.asaas.com/v3" }), "ASAAS");
  assert.equal(isExternalPixGateway("SICREDI"), true);
  assert.equal(isExternalPixGateway("INTERNO"), false);
});
test("valores monetarios rejeitam fracao de centavo, expoente e nao finitos", () => {
  assert.equal(sicrediCents("118.69"), 11869);
  for (const value of ["1.001", "1e2", -1, NaN, Infinity, null, "", "0.00"]) assert.equal(sicrediCents(value), null);
});
const payment = { gateway_pagamento_id: "DTJ0000000000000000000000000001", valor_pago_pix_centavos: 2010n, gateway_dados_json: { refundId: "DTJR1" } };
test("recebimento confirma TXID, chave, E2E e valor, nao so status", () => {
  const charge = { txid: payment.gateway_pagamento_id, chave: "key", valor: { original: "20.10" } };
  validateSicrediCharge(payment, charge, "key");
  assert.throws(() => validateSicrediCharge(payment, { ...charge, txid: "fixture" }, "key"));
  assert.throws(() => validateSicrediCharge(payment, charge, "another-key"));
  const receipt = { txid: charge.txid, valor: "20.10", endToEndId: "E".repeat(32) };
  validateSicrediReceipt(payment, receipt, receipt.endToEndId);
  assert.throws(() => validateSicrediReceipt(payment, { ...receipt, valor: "10.00" }, receipt.endToEndId));
  validateSicrediRefund(payment, { id: "DTJR1", valor: "20.10" });
  assert.throws(() => validateSicrediRefund(payment, { id: "DTJR2", valor: "20.10" }));
});
const transfer = { referencia_externa: "DTJ-SAQUE-2", valor_liquido_centavos: 2010n, documento_titular: "11111111111" };
test("fixture publico nao quita saque do aplicativo, mesmo com mesmo valor", () => {
  assert.throws(() => normalizeSicrediTransfer(transfer, { idTransacao: "0910F3HT1", valorPagamento: 20.1, status: "SUCESSO" }), (e) => e.providerStateUnknown);
});
test("estados finais Multipag normalizam sem liberar RECEBIDO ou APROVADO", () => {
  for (const [status, expected] of Object.entries({ SUCESSO: "DONE", ERRO: "FAILED", CANCELADO: "CANCELLED", NAO_APROVADO: "FAILED", EXPIRADO: "FAILED", RECEBIDO: "PENDING", APROVADO: "PENDING", AGUARDANDO_APROVACAO: "PENDING", AGENDADO: "PENDING", NOVO: "PENDING" })) {
    assert.equal(normalizeSicrediTransfer(transfer, { idTransacao: transfer.referencia_externa, valorPagamento: 20.1, status }).status, expected);
  }
  assert.throws(() => normalizeSicrediTransfer(transfer, { idTransacao: transfer.referencia_externa, valorPagamento: 20.1, documentoBeneficiario: "22222222222", status: "SUCESSO" }));
});
