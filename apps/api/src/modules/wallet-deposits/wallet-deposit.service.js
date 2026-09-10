import { emitWalletUpdated } from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { creditUserWallet, ensureUserWallets } from "../wallet/wallet.service.js";
import { createAsaasPixPayment, getAsaasPixQrCode, isAsaasEnabled } from "../payments/asaas.client.js";
import { ensureAsaasCustomer } from "../payments/asaas-customer.service.js";
import { calculateWalletDepositAmounts } from "./wallet-deposit.config.js";
import { createWalletDepositRepository, walletDepositRepository } from "./wallet-deposit.repository.js";

function asaasValue(cents) {
  return Number((Number(cents) / 100).toFixed(2));
}

function dueDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .filter((part) => part.type !== "literal");
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function pixQrDataUrl(encodedImage) {
  return encodedImage ? `data:image/png;base64,${encodedImage}` : null;
}

function serializeDeposit(deposit) {
  const payment = deposit.pagamento;
  return {
    amountCents: Number(deposit.valor_centavos),
    feeCents: Number(deposit.taxa_processamento_centavos),
    grossAmountCents: Number(deposit.valor_centavos),
    netAmountCents: Number(deposit.valor_liquido_centavos),
    createdAt: deposit.criado_em.toISOString(),
    creditedAt: deposit.creditado_em?.toISOString() ?? null,
    id: deposit.id,
    payment: payment ? {
      expiresAt: payment.expira_em?.toISOString() ?? null,
      gatewayPaymentId: payment.gateway_pagamento_id,
      id: payment.id,
      pixCopyPaste: payment.copia_cola_pix,
      qrImageDataUrl: payment.qr_code,
      status: payment.status,
    } : null,
    status: deposit.status,
    wallet: {
      code: deposit.carteira?.tipo_carteira?.codigo ?? "saldo_pix",
      id: deposit.carteira_id,
      name: deposit.carteira?.tipo_carteira?.nome ?? "Saldo Pix",
    },
  };
}

const depositInclude = {
  carteira: { include: { tipo_carteira: true } },
  pagamento: true,
};

export async function getWalletDeposit(userId, depositId) {
  const parsedId = Number(depositId);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
    throw new AppError("Deposito invalido", 400);
  }

  const deposit = await walletDepositRepository.findFirstDeposit({
    include: depositInclude,
    where: { id: parsedId, usuario_id: userId },
  });

  if (!deposit) throw new AppError("Deposito nao encontrado", 404);
  return { deposit: serializeDeposit(deposit) };
}

export async function createWalletDeposit(userId, { amountCents, idempotencyKey }) {
  if (!isAsaasEnabled()) {
    throw new AppError("Os depositos Pix estao indisponiveis no momento", 503);
  }

  const amounts = calculateWalletDepositAmounts(amountCents);
  if (amounts.netCents <= 0) {
    throw new AppError("O deposito precisa ser maior que a taxa Pix de R$ 0,99", 400);
  }

  let result;
  try {
    result = await walletDepositRepository.transaction(async (database) => {
      const repository = createWalletDepositRepository(database);
      await ensureUserWallets(userId, database);
      const wallet = await database.carteira.findFirst({
        include: { tipo_carteira: true },
        where: { status: "ATIVA", tipo_carteira: { codigo: "saldo_pix", status: "ATIVO" }, usuario_id: userId },
      });
      if (!wallet) throw new AppError("Carteira Saldo Pix nao esta disponivel", 409);

      const existing = await repository.findFirstDeposit({
        include: depositInclude,
        where: { chave_idempotencia: idempotencyKey, usuario_id: userId },
      });
      if (existing) return { created: false, deposit: existing };

      const payment = await repository.createDepositPayment({
        gateway: "ASAAS",
        metodo_principal: "PIX",
        status: "AGUARDANDO_PAGAMENTO",
        usuario_pagador_id: userId,
        valor_pago_pix_centavos: BigInt(amountCents),
        valor_total_centavos: BigInt(amountCents),
        composicoes: { create: { status: "PENDENTE", tipo_origem: "PIX", valor_centavos: BigInt(amountCents) } },
        deposito_carteira: {
          create: {
            carteira_id: wallet.id,
            chave_idempotencia: idempotencyKey,
            taxa_processamento_centavos: BigInt(amounts.feeCents),
            usuario_id: userId,
            valor_centavos: BigInt(amounts.grossCents),
            valor_liquido_centavos: BigInt(amounts.netCents),
          },
        },
      });
      return { created: true, deposit: payment.deposito_carteira };
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const existing = await walletDepositRepository.findFirstDeposit({
      include: depositInclude,
      where: { chave_idempotencia: idempotencyKey, usuario_id: userId },
    });
    if (!existing) throw error;
    result = { created: false, deposit: existing };
  }

  let deposit = result.deposit;
  if (result.created) {
    let remotePayment = null;
    try {
      const customerId = await ensureAsaasCustomer(userId);
      remotePayment = await createAsaasPixPayment({
        billingType: "PIX",
        customer: customerId,
        description: `Recarga da carteira Saldo Pix - Brasil Cashback`,
        dueDate: dueDate(),
        externalReference: `DTJ:WALLET_DEPOSIT:${deposit.id}`,
        value: asaasValue(deposit.valor_centavos),
      });

      await walletDepositRepository.updatePayment({
        data: { gateway_pagamento_id: remotePayment.id },
        where: { id: deposit.pagamento_id },
      });
      const pix = await getAsaasPixQrCode(remotePayment.id);
      await walletDepositRepository.updatePayment({
        data: {
          copia_cola_pix: pix.payload ?? null,
          expira_em: pix.expirationDate ? new Date(pix.expirationDate) : null,
          gateway_pagamento_id: remotePayment.id,
          qr_code: pixQrDataUrl(pix.encodedImage),
        },
        where: { id: deposit.pagamento_id },
      });
    } catch (error) {
      // O POST pode ter sido aceito pelo Asaas mesmo sem resposta. A referencia
      // externa do deposito permite que o worker ligue a cobranca depois.
      if (error.providerStateUnknown || remotePayment?.id) {
        if (remotePayment?.id) {
          await walletDepositRepository.updatePayment({
            data: { gateway_pagamento_id: remotePayment.id },
            where: { id: deposit.pagamento_id },
          });
        }
        await walletDepositRepository.updatePayments({
          data: { status: "EM_RECONCILIACAO" },
          where: {
            id: deposit.pagamento_id,
            status: "AGUARDANDO_PAGAMENTO",
          },
        });
      } else {
        await walletDepositRepository.transaction(async (database) => {
          const repository = createWalletDepositRepository(database);
          await repository.updateDeposits({ data: { status: "FALHOU" }, where: { id: deposit.id, status: "PENDENTE" } });
          await repository.updatePayments({ data: { status: "FALHOU" }, where: { id: deposit.pagamento_id, status: "AGUARDANDO_PAGAMENTO" } });
          await repository.updatePaymentCompositions({ data: { status: "CANCELADO" }, where: { pagamento_id: deposit.pagamento_id } });
        });
        throw error;
      }
    }
  }

  return getWalletDeposit(userId, deposit.id);
}

export async function settleWalletDepositPayment(database, paymentId, event) {
  const repository = createWalletDepositRepository(database);
  const deposit = await repository.findFirstDeposit({
    include: depositInclude,
    where: { pagamento_id: paymentId },
  });
  if (!deposit) return null;

  if (["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event)) {
    const claimed = await repository.updateDeposits({
      data: { creditado_em: new Date(), status: "CONFIRMADO" },
      where: { id: deposit.id, status: "PENDENTE" },
    });
    if (claimed.count !== 1) return { handled: true, walletUserIds: [] };

    await repository.updatePayments({
      data: { pago_em: new Date(), status: "PAGO" },
      where: { id: paymentId, status: { in: ["PENDENTE", "AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"] } },
    });
    await repository.updatePaymentCompositions({ data: { status: "CONFIRMADO" }, where: { pagamento_id: paymentId, tipo_origem: "PIX" } });
    await creditUserWallet({
      database,
      description: "Deposito Pix confirmado pelo Asaas",
      origin: "DEPOSITO_PIX",
      originId: deposit.id,
      userId: deposit.usuario_id,
      valueCents: deposit.valor_liquido_centavos,
      walletCode: "saldo_pix",
    });
    return { handled: true, walletUserIds: [deposit.usuario_id] };
  }

  if (["PAYMENT_DELETED", "PAYMENT_OVERDUE"].includes(event)) {
    await repository.updateDeposits({ data: { status: "CANCELADO" }, where: { id: deposit.id, status: "PENDENTE" } });
    await repository.updatePayments({ data: { cancelado_em: new Date(), status: "CANCELADO" }, where: { id: paymentId, status: { in: ["PENDENTE", "AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"] } } });
    await repository.updatePaymentCompositions({ data: { status: "CANCELADO" }, where: { pagamento_id: paymentId, tipo_origem: "PIX" } });
    return { handled: true, walletUserIds: [] };
  }

  if (["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"].includes(event)) {
    await repository.updateDeposits({ data: { status: "EM_REVISAO" }, where: { id: deposit.id, status: "CONFIRMADO" } });
    await repository.updatePayments({ data: { status: "EM_DISPUTA" }, where: { id: paymentId, status: "PAGO" } });
    return { handled: true, walletUserIds: [] };
  }

  if (["PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", "PAYMENT_REPROVED_BY_RISK_ANALYSIS"].includes(event)) {
    await repository.updateDeposits({ data: { status: "FALHOU" }, where: { id: deposit.id, status: "PENDENTE" } });
    await repository.updatePayments({ data: { cancelado_em: new Date(), status: "FALHOU" }, where: { id: paymentId, status: { in: ["PENDENTE", "AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"] } } });
    return { handled: true, walletUserIds: [] };
  }

  return { handled: true, walletUserIds: [] };
}

export function emitWalletDepositUpdate(userIds) {
  if (userIds.length) emitWalletUpdated({ transactionId: `wallet-deposit:${Date.now()}`, userIds });
}
