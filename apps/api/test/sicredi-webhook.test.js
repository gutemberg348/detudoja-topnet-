import assert from "node:assert/strict";
import { test } from "node:test";
import { verifySicrediWebhookSecret, sicrediPixWebhookController, sicrediMultipagWebhookController } from "../src/modules/payments/sicredi/sicredi.webhook.controller.js";

test("webhook Sicredi exige segredo configurado forte e comparacao exata", () => {
  assert.throws(() => verifySicrediWebhookSecret("", ""), (error) => error.statusCode === 503);
  assert.throws(() => verifySicrediWebhookSecret("short", "short"), (error) => error.statusCode === 503);
  assert.throws(() => verifySicrediWebhookSecret("wrong", "a".repeat(40)), (error) => error.statusCode === 401);
  assert.throws(() => verifySicrediWebhookSecret(undefined, "a".repeat(40)), (error) => error.statusCode === 401);
  verifySicrediWebhookSecret("a".repeat(40), "a".repeat(40));
});
test("callback nao autenticado nao consulta o banco nem confirma valor do payload", async () => {
  process.env.SICREDI_PIX_WEBHOOK_TOKEN = "test-token-".repeat(4);
  process.env.SICREDI_MULTIPAG_WEBHOOK_TOKEN = "test-token-".repeat(4);
  let error;
  const res = { json() { assert.fail("Nao deve aceitar callback sem autenticacao"); } };
  await sicrediPixWebhookController({ params: { token: "wrong" }, body: { pix: [{ valor: "20.10" }] } }, res, (e) => { error = e; });
  assert.equal(error.statusCode, 401);
  await sicrediMultipagWebhookController({ get: () => "wrong", body: { idTransacao: "DTJ-SAQUE-1", status: "SUCESSO" } }, res, (e) => { error = e; });
  assert.equal(error.statusCode, 401);
});
test("callback autenticado rejeita identificadores malformados antes da consulta", async () => {
  const secret = "test-token-".repeat(4);
  process.env.SICREDI_PIX_WEBHOOK_TOKEN = secret;
  process.env.SICREDI_MULTIPAG_WEBHOOK_TOKEN = secret;
  const res = { json() { assert.fail("Payload invalido"); } };
  let error;
  await sicrediPixWebhookController({ params: { token: secret }, body: { pix: [{ txid: "../unsafe" }] } }, res, (e) => { error = e; });
  assert.equal(error.statusCode, 400);
  await sicrediMultipagWebhookController({ get: () => secret, body: { idTransacao: "../unsafe" } }, res, (e) => { error = e; });
  assert.equal(error.statusCode, 400);
});
