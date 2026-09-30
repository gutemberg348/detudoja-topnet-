import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "../../../config/prisma.js";
import { AppError } from "../../../utils/errors.js";
import { reconcileSicrediPayment } from "./sicredi.payment.service.js";
import { reconcilePayout } from "../../payouts/payout.service.js";
import { reconcileWithdrawal } from "../../withdrawals/withdrawal.service.js";

export function verifySicrediWebhookSecret(received, expected) {
  if (!expected || expected.length < 32) throw new AppError("Webhook Sicredi nao configurado", 503);
  const hash = (value) => createHash("sha256").update(String(value ?? "")).digest();
  if (!timingSafeEqual(hash(received), hash(expected))) throw new AppError("Webhook Sicredi nao autorizado", 401);
}

export async function sicrediPixWebhookController(req, res, next) {
  try {
    verifySicrediWebhookSecret(req.params.token, process.env.SICREDI_PIX_WEBHOOK_TOKEN);
    const ids = [...new Set((Array.isArray(req.body?.pix) ? req.body.pix : []).map((item) => item?.txid))];
    if (ids.length > 100 || ids.some((id) => !/^[a-zA-Z0-9]{26,35}$/.test(id ?? ""))) throw new AppError("Notificacao Pix invalida", 400);
    const payments = ids.length ? await prisma.pagamento.findMany({
      select: { id: true }, where: { gateway: "SICREDI", gateway_pagamento_id: { in: ids } },
    }) : [];
    // A notification is only a hint to query mTLS. Ignore amount/status supplied
    // by the caller, including authenticated callbacks; bank evidence wins.
    for (const payment of payments) await reconcileSicrediPayment(payment.id);
    res.json({ processed: payments.length });
  } catch (error) { next(error); }
}

export async function sicrediMultipagWebhookController(req, res, next) {
  try {
    verifySicrediWebhookSecret(req.get("authorization"), process.env.SICREDI_MULTIPAG_WEBHOOK_TOKEN);
    const id = req.body?.idTransacao;
    if (!/^[a-zA-Z0-9:-]{1,100}$/.test(id ?? "")) throw new AppError("Notificacao Multipag invalida", 400);
    const [withdrawal, payout] = await Promise.all([
      prisma.saque.findFirst({ select: { id: true }, where: { gateway: "SICREDI", referencia_externa: id } }),
      prisma.repassePix.findFirst({ select: { id: true }, where: { gateway: "SICREDI", referencia_externa: id } }),
    ]);
    if (withdrawal) await reconcileWithdrawal(withdrawal.id);
    if (payout) await reconcilePayout(payout.id);
    res.json({ processed: Boolean(withdrawal || payout) });
  } catch (error) { next(error); }
}
