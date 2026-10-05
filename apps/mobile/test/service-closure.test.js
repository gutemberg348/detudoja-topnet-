import assert from "node:assert/strict";
import test from "node:test";
import { canCancelServiceConversation, serviceProposalHasPlatformPayment, serviceQrActions } from "../src/utils/service-closure.js";

const charge = { status: "ATIVA", serviceConversationId: 1, serviceProposalId: 2,
  serviceProposalStatus: "ACEITA", serviceConversationStatus: "ACORDADA", servicePaymentMode: "QR_PRESENCIAL" };

test("QR closure actions disappear for paid, processing, cancelled and linked order services", () => {
  assert.equal(serviceQrActions(charge).canCompleteOutsideApp, true);
  for (const changes of [{ status: "PAGA" }, { status: "PROCESSANDO" }, { status: "CANCELADA" },
    { payment: { status: "PENDENTE" } }, { paidAt: "2026-10-05" }, { serviceProposalStatus: "PENDENTE" },
    { serviceConversationStatus: "ENCERRADA" }, { serviceLinkedOrder: true }, { servicePaymentMode: "ONLINE" }]) {
    assert.equal(serviceQrActions({ ...charge, ...changes }).canCompleteOutsideApp, false);
  }
});

test("external completion is shown as a service outcome without claiming platform payment", () => {
  const proposal = { status: "CONCLUIDA", completedOutsideApp: true, charge: { status: "CANCELADA" } };
  assert.equal(serviceProposalHasPlatformPayment(proposal), false);
  assert.equal(canCancelServiceConversation({ status: "ENCERRADA", proposals: [proposal] }), false);
  assert.equal(serviceQrActions({ ...charge, status: "CANCELADA", serviceCompletedOutsideApp: true }).completedOutsideApp, true);
});

test("chat cancellation is allowed before payment and blocked by pending or confirmed payments", () => {
  assert.equal(canCancelServiceConversation({ status: "ACORDADA", proposals: [{ status: "ACEITA", charge: { status: "ATIVA" } }] }), true);
  for (const proposal of [{ status: "PAGA" }, { status: "CONCLUIDA" }, { status: "ACEITA", charge: { status: "PROCESSANDO" } },
    { status: "ACEITA", charge: { status: "ATIVA", paymentStatus: "PENDENTE" } }]) {
    assert.equal(canCancelServiceConversation({ status: "ACORDADA", proposals: [proposal] }), false);
  }
});
