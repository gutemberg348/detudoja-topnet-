import { AppError } from "../../utils/errors.js";
import { creditUserWallet } from "../wallet/wallet.service.js";

function cents(value) {
  return Number(value ?? 0);
}

export async function restorePaymentWalletCompositions(
  database,
  payment,
  { reason, requireFullAmount = false } = {},
) {
  const compositions = payment.composicoes ?? await database.pagamentoComposicao.findMany({
    include: { carteira: true },
    where: { pagamento_id: payment.id },
  });
  const walletCompositions = compositions.filter((composition) => (
    composition.carteira_id && composition.status === "CONFIRMADO"
  ));
  const restoredCents = walletCompositions.reduce(
    (total, composition) => total + cents(composition.valor_centavos),
    0,
  );

  if (requireFullAmount && restoredCents !== cents(payment.valor_total_centavos)) {
    throw new AppError(
      "Pagamento antigo sem origem completa de carteira; encaminhe para revisao financeira manual",
      409,
    );
  }

  const userIds = new Set();

  for (const composition of walletCompositions) {
    const amount = cents(composition.valor_centavos);
    const wallet = await database.carteira.update({
      data: { saldo_disponivel_centavos: { increment: BigInt(amount) } },
      select: { saldo_disponivel_centavos: true, usuario_id: true },
      where: { id: composition.carteira_id },
    });
    const balanceAfter = cents(wallet.saldo_disponivel_centavos);

    await database.lancamentoCarteira.create({
      data: {
        carteira_id: composition.carteira_id,
        descricao: `Estorno do pagamento ${payment.id}. ${reason ?? "Pagamento cancelado."}`,
        origem: "ESTORNO",
        origem_id: payment.id,
        saldo_anterior_centavos: BigInt(balanceAfter - amount),
        saldo_posterior_centavos: BigInt(balanceAfter),
        status: "PROCESSADO",
        tipo_lancamento: "ESTORNO",
        usuario_id: wallet.usuario_id,
        valor_centavos: BigInt(amount),
      },
    });
    userIds.add(wallet.usuario_id);
  }

  if (walletCompositions.length) {
    await database.pagamentoComposicao.updateMany({
      data: { status: "ESTORNADO" },
      where: {
        carteira_id: { not: null },
        pagamento_id: payment.id,
        status: "CONFIRMADO",
      },
    });
  }

  return { restoredCents, userIds: [...userIds] };
}

export async function creditPaymentRefundToBalance(database, payment, reason) {
  await creditUserWallet({
    database,
    description: `Credito pelo cancelamento do pedido ${payment.pedido_loja?.codigo ?? payment.id}. ${reason}`,
    origin: "ESTORNO",
    originId: payment.id,
    userId: payment.usuario_pagador_id,
    valueCents: cents(payment.valor_total_centavos),
    walletCode: "saldo_pix",
  });

  await database.pagamentoComposicao.updateMany({
    data: { status: "ESTORNADO" },
    where: {
      pagamento_id: payment.id,
      status: { in: ["PENDENTE", "CONFIRMADO"] },
    },
  });

  return {
    creditedCents: cents(payment.valor_total_centavos),
    userIds: [payment.usuario_pagador_id],
  };
}
