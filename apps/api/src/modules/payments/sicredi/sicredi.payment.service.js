import QRCode from "qrcode";
import { AppError } from "../../../utils/errors.js";
import { asaasRepository } from "../asaas.repository.js";
import { processVerifiedPaymentEvent } from "../asaas.service.js";
import { assertSicrediEnvironment } from "../payment-gateway.js";
import { createSicrediPixClient, sicrediPixConfigFromEnv, sicrediTxidForPayment } from "./sicredi.pix.client.js";
import { validateSicrediCharge, validateSicrediReceipt, validateSicrediRefund } from "./sicredi.validation.js";

export function createSicrediPaymentService({
  repository = asaasRepository, pixClient, settleEvent = processVerifiedPaymentEvent,
  assertEnvironment = assertSicrediEnvironment, receivingKey,
} = {}) {
  let cachedClient;
  function client() { return pixClient ?? (cachedClient ??= createSicrediPixClient(sicrediPixConfigFromEnv())); }
  function serialize(payment) {
    return { id: payment.id, gateway: payment.gateway, status: payment.status,
      pixCopyPaste: payment.copia_cola_pix, qrImageDataUrl: payment.qr_code,
      expiresAt: payment.expira_em?.toISOString() ?? null };
  }
  async function paymentRecord(id) {
    const payment = await repository.findPayment({ where: { id: Number(id) }, include: { deposito_carteira: true } });
    if (payment?.gateway !== "SICREDI") throw new AppError("Pagamento Sicredi nao encontrado", 404);
    assertEnvironment(payment, "receive");
    return payment;
  }
  async function settle(payment, event, suffix) {
    return settleEvent({
      id: `sicredi:${payment.gateway_ambiente}:${payment.gateway_pagamento_id}:${suffix}`,
      event, payment: { id: payment.gateway_pagamento_id },
    }, "SICREDI");
  }
  async function saveCharge(payment, charge) {
    validateSicrediCharge(payment, charge, payment.gateway_dados_json?.receivingKey ?? receivingKey ?? sicrediPixConfigFromEnv().pixKey);
    const expires = new Date(new Date(charge.calendario?.criacao).getTime() + Number(charge.calendario?.expiracao) * 1000);
    const data = {
      ...(charge.pixCopiaECola ? {
        copia_cola_pix: charge.pixCopiaECola,
        qr_code: await QRCode.toDataURL(charge.pixCopiaECola, { margin: 2, width: 512 }),
      } : {}),
      ...(Number.isFinite(expires.getTime()) ? { expira_em: expires } : {}),
    };
    await repository.updatePayments({ data, where: { id: payment.id, status: { in: ["AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"] } } });
    if (charge.status === "ATIVA" && charge.pixCopiaECola) {
      await repository.updatePayments({ data: { status: "AGUARDANDO_PAGAMENTO" }, where: { id: payment.id, status: "EM_RECONCILIACAO" } });
    }
  }

  async function createPendingSicrediPix({ description, paymentId, userId }) {
    const payment = await paymentRecord(paymentId);
    if (payment.usuario_pagador_id !== userId) throw new AppError("Pagamento nao encontrado", 404);
    if (payment.gateway_pagamento_id || payment.status === "EM_RECONCILIACAO") return serialize(payment);
    const id = sicrediTxidForPayment(payment.id);
    const claimed = await repository.updatePayments({
      data: { gateway_pagamento_id: id, status: "EM_RECONCILIACAO",
        gateway_dados_json: { receivingKey: receivingKey ?? sicrediPixConfigFromEnv().pixKey } },
      where: { id: payment.id, gateway_pagamento_id: null, status: "AGUARDANDO_PAGAMENTO" },
    });
    if (claimed.count !== 1) return serialize(await paymentRecord(payment.id));
    const persisted = { ...payment, gateway_pagamento_id: id };
    try {
      const charge = await client().createCharge({ amountCents: payment.valor_pago_pix_centavos, description, id });
      await saveCharge(persisted, charge);
    } catch (error) {
      // The deterministic TXID was committed BEFORE the PUT. A timeout, conflict,
      // invalid response or local persistence failure stays with this bank.
      // All failures after claiming are reconciled with this TXID. Even a failed
      // DB update must not let an outer catch cancel an accepted bank charge.
    }
    return serialize(await paymentRecord(payment.id));
  }

  async function reconcileSicrediPayment(paymentId) {
    const payment = await paymentRecord(paymentId);
    if (payment.gateway_dados_json?.sandboxManualApproval) {
      return { gatewayStatus: "SANDBOX_MANUAL", checkedAt: new Date().toISOString() };
    }
    if (!payment.gateway_pagamento_id) return { gatewayStatus: "RECONCILING", checkedAt: new Date().toISOString() };
    let gatewayStatus;
    if (payment.status === "EM_DISPUTA" && payment.gateway_dados_json?.refundId) {
      const metadata = payment.gateway_dados_json;
      const refund = await client().getRefund({ e2eId: metadata.e2eId, refundId: metadata.refundId });
      validateSicrediRefund(payment, refund);
      gatewayStatus = refund.status;
      if (refund.status === "DEVOLVIDO") await settle(payment, "PAYMENT_REFUNDED", `refund:${metadata.refundId}`);
      // NAO_REALIZADO needs operator review, never a fallback or an automatic resend.
      if (refund.status === "NAO_REALIZADO") throw new AppError("Sicredi nao realizou a devolucao; revisao financeira necessaria", 409);
    } else {
      const charge = await client().getCharge(payment.gateway_pagamento_id);
      await saveCharge(payment, charge);
      gatewayStatus = charge.status;
      if (charge.status === "CONCLUIDA") {
        if (charge.pix?.length !== 1) throw new AppError("Pix Sicredi requer conciliacao manual dos recebimentos", 409);
        const receipt = await client().getReceivedPix(charge.pix[0].endToEndId);
        validateSicrediReceipt(payment, receipt, charge.pix[0].endToEndId);
        await repository.updatePayments({
          data: { gateway_dados_json: { ...(payment.gateway_dados_json ?? {}), e2eId: receipt.endToEndId } },
          where: { id: payment.id, status: { in: ["AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"] } },
        });
        await settle(payment, "PAYMENT_RECEIVED", `paid:${receipt.endToEndId}`);
        const returnedCents = (receipt.devolucoes ?? []).filter((item) => item.status === "DEVOLVIDO")
          .reduce((sum, item) => sum + Math.round(Number(item.valor) * 100), 0);
        if (returnedCents === Number(payment.valor_pago_pix_centavos)) {
          await settle(payment, "PAYMENT_REFUNDED", `returned:${receipt.endToEndId}`);
        } else if (returnedCents > 0) {
          await repository.updatePayments({ data: { status: "EM_DISPUTA" },
            where: { id: payment.id, status: { in: ["PAGO", "LIQUIDADO"] } } });
          throw new AppError("Devolucao parcial Sicredi exige revisao financeira", 409);
        }
      } else if (["REMOVIDA_PELO_USUARIO_RECEBEDOR", "REMOVIDA_PELO_PSP"].includes(charge.status)) {
        await settle(payment, "PAYMENT_DELETED", "removed");
      }
    }
    return { gatewayStatus, checkedAt: new Date().toISOString() };
  }

  async function requestSicrediRefund(paymentId) {
    let payment = await paymentRecord(paymentId);
    if (payment.deposito_carteira) throw new AppError("Depositos exigem analise antes da devolucao", 409);
    if (!["PAGO", "LIQUIDADO"].includes(payment.status)) throw new AppError("Pagamento nao pode ser estornado novamente", 409);
    if (!payment.gateway_dados_json?.e2eId) {
      await reconcileSicrediPayment(payment.id);
      payment = await paymentRecord(payment.id);
    }
    const e2eId = payment.gateway_dados_json?.e2eId;
    if (!e2eId) throw new AppError("Recebimento Sicredi ainda nao identificado", 409);
    const refundId = `DTJR${payment.id}`;
    const claimed = await repository.updatePayments({
      data: { status: "EM_DISPUTA", gateway_dados_json: { ...payment.gateway_dados_json, refundId } },
      where: { id: payment.id, status: { in: ["PAGO", "LIQUIDADO"] } },
    });
    if (claimed.count !== 1) throw new AppError("Estorno ja solicitado", 409);
    // Keep EM_DISPUTA even on rejection: retry/reconciliation must reuse refundId.
    try {
      const refund = await client().requestRefund({ amountCents: payment.valor_pago_pix_centavos, e2eId, refundId });
      validateSicrediRefund({ ...payment, gateway_dados_json: { ...payment.gateway_dados_json, refundId } }, refund);
      // The worker confirms even an immediate DEVOLVIDO response, after the
      // cancellation transaction has finished releasing stock and publishing.
      return { gatewayStatus: refund.status };
    } catch {
      // Do not restore the order/allow a new refund when delivery is uncertain.
      return { gatewayStatus: "RECONCILING", refundId };
    }
  }

  async function cancelSicrediPayment(paymentId) {
    const payment = await paymentRecord(paymentId);
    if (payment.status !== "AGUARDANDO_PAGAMENTO" || !payment.gateway_pagamento_id) throw new AppError("Pix precisa ser conciliado antes do cancelamento", 409);
    await client().cancelCharge(payment.gateway_pagamento_id);
    await reconcileSicrediPayment(payment.id);
    const updated = await paymentRecord(payment.id);
    if (updated.status !== "CANCELADO") throw new AppError("Pagamento mudou; atualize o pedido antes de cancelar", 409);
  }

  async function reconcilePendingSicrediPayments({ batchSize = 25 } = {}) {
    const payments = await repository.findPayments({
      where: { gateway: "SICREDI", status: { in: ["AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO", "EM_DISPUTA"] } },
      orderBy: { atualizado_em: "asc" }, take: batchSize,
    });
    const failed = [];
    for (const payment of payments) {
      try { await reconcileSicrediPayment(payment.id); }
      catch (error) { failed.push({ paymentId: payment.id, message: error.message }); }
      // Rotate the queue on errors too, so an unresolved 404 cannot starve others.
      await repository.updatePayment({ data: { atualizado_em: new Date() }, where: { id: payment.id } });
    }
    return { scanned: payments.length, failed };
  }

  return { createPendingSicrediPix, reconcileSicrediPayment, requestSicrediRefund, cancelSicrediPayment, reconcilePendingSicrediPayments };
}

export const { createPendingSicrediPix, reconcileSicrediPayment, requestSicrediRefund,
  cancelSicrediPayment, reconcilePendingSicrediPayments } = createSicrediPaymentService();
