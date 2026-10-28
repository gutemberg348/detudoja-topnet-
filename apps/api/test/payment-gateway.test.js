import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredPaymentGateway, selectPaymentGateway, gatewayAvailability, isExternalPixGateway, isStoredTransferGatewayEnabled, assertTransferEnvironment } from "../src/modules/payments/payment-gateway.js";
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
test("Sicredi e principal; indisponibilidade nunca seleciona Asaas automaticamente", () => {
  assert.equal(selectPaymentGateway("receive", config), "SICREDI");
  assert.equal(selectPaymentGateway("transfer", config), "SICREDI");
  assert.throws(() => selectPaymentGateway("receive", { ...config, SICREDI_PIX_ENABLED: "false" }), /selecionado indisponivel/);
  assert.throws(() => selectPaymentGateway("transfer", { ...config, SICREDI_MULTIPAG_TRANSFER_ENABLED: "false" }), /selecionado indisponivel/);
});
test("credenciais Multipag nao habilitam recebimentos sem configuracao Pix", () => {
  assert.throws(() => selectPaymentGateway("receive", { ...config, SICREDI_PIX_CLIENT_ID: "" }), /selecionado indisponivel/);
});
test("nao mistura ambientes nem habilita Sandbox no app implicitamente", () => {
  assert.equal(gatewayAvailability("receive", { ...config, SICREDI_PIX_ENV: "production" }).SICREDI, false);
  assert.throws(() => selectPaymentGateway("transfer", { ...config, SICREDI_APP_SANDBOX_ENABLED: "false" }));
  assert.throws(() => selectPaymentGateway("receive", { ...config, PAYMENTS_ENVIRONMENT: "production" }), /selecionado indisponivel/);
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
test("Asaas exige escolha manual mesmo com credenciais disponiveis", () => {
  assert.equal(selectPaymentGateway("receive", { ...config, PAYMENTS_PRIMARY_GATEWAY: "ASAAS" }), "ASAAS");
  assert.throws(() => selectPaymentGateway("receive", { ASAAS_ENABLED: "true", ASAAS_API_KEY: "test", ASAAS_API_URL: "https://api.asaas.com/v3" }));
  assert.equal(isExternalPixGateway("SICREDI"), true);
  assert.equal(isExternalPixGateway("INTERNO"), false);
});
test("fallback legado e ignorado nos dois sentidos e na fila de transferencias", () => {
  for (const fallback of [undefined, "ASAAS", "SICREDI", "NONE"]) {
    const source = { ...config, PAYMENTS_FALLBACK_GATEWAY: fallback, SICREDI_PIX_ENABLED: "false", SICREDI_MULTIPAG_TRANSFER_ENABLED: "false" };
    assert.equal(configuredPaymentGateway(source), "SICREDI");
    for (const capability of ["receive", "transfer"]) assert.throws(() => selectPaymentGateway(capability, source));
    assert.throws(() => selectPaymentGateway("receive", { ...config, PAYMENTS_PRIMARY_GATEWAY: "ASAAS", ASAAS_ENABLED: "false", PAYMENTS_FALLBACK_GATEWAY: fallback }));
  }
  assert.throws(() => configuredPaymentGateway({ PAYMENTS_PRIMARY_GATEWAY: "INVALIDO" }));
});
test("recebimento Sicredi producao funciona sem habilitar Multipag sandbox ou Asaas", () => {
  const production = { ...config, PAYMENTS_ENVIRONMENT: "production", SICREDI_PIX_ENV: "production",
    SICREDI_PIX_API_URL: "https://api-pix.sicredi.com.br/api/v2", SICREDI_PIX_AUTH_URL: "https://api-pix.sicredi.com.br/oauth/token" };
  assert.equal(selectPaymentGateway("receive", production), "SICREDI");
  assert.throws(() => selectPaymentGateway("transfer", production));
});
test("valores monetarios rejeitam fracao de centavo, expoente e nao finitos", () => {
  assert.equal(sicrediCents("118.69"), 11869);
  for (const value of ["1.001", "1e2", -1, NaN, Infinity, null, "", "0.00"]) assert.equal(sicrediCents(value), null);
});
test("envio de transferencia usa gateway persistido e nunca o novo principal", () => {
  const record = { gateway: "SICREDI", gateway_ambiente: "sandbox" };
  assert.equal(isStoredTransferGatewayEnabled(record, { ...config, PAYMENTS_PRIMARY_GATEWAY: "ASAAS" }), true);
  assert.equal(isStoredTransferGatewayEnabled(record, { ...config, PAYMENTS_PRIMARY_GATEWAY: "ASAAS", SICREDI_MULTIPAG_TRANSFER_ENABLED: "false" }), false);
  assert.equal(isStoredTransferGatewayEnabled({ ...record, gateway: "ASAAS" }, { ...config, ASAAS_ENABLED: "false" }), false);
  for (const bad of [{ ...record, gateway_ambiente: "production" }, { ...record, gateway_ambiente: null }, { ...record, gateway: "INVALIDO" }]) {
    assert.equal(isStoredTransferGatewayEnabled(bad, config), false);
    assert.throws(() => assertTransferEnvironment(bad, config));
  }
  assert.doesNotThrow(() => assertTransferEnvironment(record, { ...config, SICREDI_MULTIPAG_TRANSFER_ENABLED: "false" }));
  assert.throws(() => assertTransferEnvironment({ gateway: "ASAAS", gateway_ambiente: "production" }, { ...config, PAYMENTS_ENVIRONMENT: "production" }));
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
test("consulta Multipag rejeita chave ou documento divergente sem liberar reserva", () => {
  const record = { ...transfer, tipo_chave_pix: "EMAIL", chave_pix_destino: "recebedor@example.com" };
  const response = { idTransacao: transfer.referencia_externa, valorPagamento: 20.1, status: "SUCESSO", chavePix: "RECEBEDOR@example.com" };
  assert.equal(normalizeSicrediTransfer(record, response).status, "DONE");
  for (const changed of [{ chavePix: "outro@example.com" }, { chavePix: {} }, { documentoBeneficiario: "22222222222" }]) {
    assert.throws(() => normalizeSicrediTransfer(record, { ...response, ...changed }), (error) => error.providerStateUnknown === true);
  }
});
test("estados finais Multipag normalizam sem liberar RECEBIDO ou APROVADO", () => {
  for (const [status, expected] of Object.entries({ SUCESSO: "DONE", ERRO: "FAILED", CANCELADO: "CANCELLED", NAO_APROVADO: "FAILED", EXPIRADO: "FAILED", RECEBIDO: "PENDING", APROVADO: "PENDING", AGUARDANDO_APROVACAO: "PENDING", AGENDADO: "PENDING", NOVO: "PENDING" })) {
    assert.equal(normalizeSicrediTransfer(transfer, { idTransacao: transfer.referencia_externa, valorPagamento: 20.1, status }).status, expected);
  }
  assert.throws(() => normalizeSicrediTransfer(transfer, { idTransacao: transfer.referencia_externa, valorPagamento: 20.1, documentoBeneficiario: "22222222222", status: "SUCESSO" }));
});
