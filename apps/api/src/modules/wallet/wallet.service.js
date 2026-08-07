import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";

export const walletTypeDefinitions = [
  {
    code: "saldo_pix",
    description: "Saldo adicionado por Pix para uso dentro da plataforma.",
    name: "Saldo Pix",
    permiteSaque: true,
    permiteUsoEmCompra: true,
  },
  {
    code: "cashback",
    description: "Valores recebidos por cashback em compras confirmadas.",
    name: "Cashback",
    permiteSaque: false,
    permiteUsoEmCompra: true,
  },
  {
    code: "rede",
    description: "Recompensas liberadas por eventos validos da rede.",
    name: "Rede",
    permiteSaque: true,
    permiteUsoEmCompra: true,
  },
  {
    code: "vendas",
    description: "Recebimentos de vendas confirmadas na plataforma.",
    name: "Vendas",
    permiteSaque: true,
    permiteUsoEmCompra: true,
  },
];

function cents(value) {
  return Number(value ?? 0);
}

function serializePaymentReceipt(payment) {
  if (!payment) {
    return null;
  }

  const recipient = payment.loja
    ? {
        id: payment.loja.id,
        name: payment.loja.nome,
        type: "STORE",
      }
    : payment.vendedor
      ? {
          id: payment.vendedor.id,
          name: payment.vendedor.nome_publico,
          type: "SELLER",
        }
      : null;

  return {
    charge: payment.cobranca
      ? {
          code: payment.cobranca.codigo_publico,
          origin: payment.cobranca.origem,
          title: payment.cobranca.titulo,
        }
      : null,
    id: payment.id,
    method: payment.metodo_principal,
    orderCode: payment.pedido_loja?.codigo ?? null,
    paidAt: payment.pago_em?.toISOString() ?? null,
    recipient,
    status: payment.status,
    totalAmountCents: cents(payment.valor_total_centavos),
  };
}

function serializeMovement(movement, payment = null) {
  return {
    balanceAfterCents: cents(movement.saldo_posterior_centavos),
    balanceBeforeCents: cents(movement.saldo_anterior_centavos),
    data: movement.criado_em.toISOString(),
    descricao: movement.descricao ?? "Movimentacao da carteira",
    id: movement.id,
    origem: movement.origem,
    originId: movement.origem_id,
    payment: serializePaymentReceipt(payment),
    status: movement.status,
    tipo: movement.tipo_lancamento,
    valor_centavos: cents(movement.valor_centavos),
    walletCode: movement.carteira.tipo_carteira.codigo,
    walletName: movement.carteira.tipo_carteira.nome,
  };
}

function serializeWallet(wallet) {
  const availableCents = cents(wallet.saldo_disponivel_centavos);
  const blockedCents = cents(wallet.saldo_bloqueado_centavos);
  const pendingCents = cents(wallet.saldo_pendente_centavos);

  return {
    availableCents,
    blockedCents,
    canUseForPurchase: wallet.tipo_carteira.permite_uso_em_compra,
    canWithdraw: wallet.tipo_carteira.permite_saque,
    code: wallet.tipo_carteira.codigo,
    description: wallet.tipo_carteira.descricao,
    id: wallet.id,
    name: wallet.tipo_carteira.nome,
    pendingCents,
    status: wallet.status,
    totalCents: availableCents + pendingCents + blockedCents,
  };
}

export async function ensureUserWallets(userId, database = prisma) {
  const walletTypes = [];

  for (const definition of walletTypeDefinitions) {
    const walletType = await database.tipoCarteira.upsert({
      create: {
        codigo: definition.code,
        descricao: definition.description,
        nome: definition.name,
        permite_saque: definition.permiteSaque,
        permite_uso_em_compra: definition.permiteUsoEmCompra,
      },
      update: {
        descricao: definition.description,
        nome: definition.name,
        permite_saque: definition.permiteSaque,
        permite_uso_em_compra: definition.permiteUsoEmCompra,
        status: "ATIVO",
      },
      where: { codigo: definition.code },
    });
    walletTypes.push(walletType);
  }

  await database.carteira.createMany({
    data: walletTypes.map((walletType) => ({
      saldo_bloqueado_centavos: 0,
      saldo_disponivel_centavos: 0,
      saldo_pendente_centavos: 0,
      tipo_carteira_id: walletType.id,
      usuario_id: userId,
    })),
    skipDuplicates: true,
  });
}

export async function creditUserWallet({
  database = prisma,
  description,
  origin,
  originId,
  userId,
  valueCents,
  walletCode,
}) {
  const amount = Number(valueCents ?? 0);

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new AppError("Valor de credito da carteira invalido", 400);
  }

  if (amount === 0) {
    return null;
  }

  await ensureUserWallets(userId, database);

  const wallet = await database.carteira.findFirst({
    select: { id: true },
    where: {
      status: "ATIVA",
      tipo_carteira: { codigo: walletCode },
      usuario_id: userId,
    },
  });

  if (!wallet) {
    throw new AppError("Carteira ativa nao encontrada para o credito", 409);
  }

  const updatedWallet = await database.carteira.update({
    data: { saldo_disponivel_centavos: { increment: BigInt(amount) } },
    select: { saldo_disponivel_centavos: true },
    where: { id: wallet.id },
  });
  const balanceAfterCents = Number(updatedWallet.saldo_disponivel_centavos);

  return database.lancamentoCarteira.create({
    data: {
      carteira_id: wallet.id,
      descricao: description,
      origem: origin,
      origem_id: originId,
      saldo_anterior_centavos: BigInt(balanceAfterCents - amount),
      saldo_posterior_centavos: BigInt(balanceAfterCents),
      status: "PROCESSADO",
      tipo_lancamento: "CREDITO",
      usuario_id: userId,
      valor_centavos: BigInt(amount),
    },
  });
}

export async function debitUserWallet({
  database = prisma,
  description,
  origin = "PAGAMENTO",
  originId,
  userId,
  valueCents,
  walletId,
}) {
  const amount = Number(valueCents ?? 0);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError("Valor de debito da carteira invalido", 400);
  }

  const wallet = await database.carteira.findFirst({
    include: { tipo_carteira: true },
    where: {
      id: Number(walletId),
      status: "ATIVA",
      tipo_carteira: { permite_uso_em_compra: true },
      usuario_id: userId,
    },
  });

  if (!wallet) {
    throw new AppError("Carteira nao encontrada para o pagamento", 404);
  }

  const updated = await database.carteira.updateMany({
    data: { saldo_disponivel_centavos: { decrement: BigInt(amount) } },
    where: {
      id: wallet.id,
      saldo_disponivel_centavos: { gte: BigInt(amount) },
      status: "ATIVA",
    },
  });

  if (updated.count !== 1) {
    throw new AppError(`Saldo insuficiente na carteira ${wallet.tipo_carteira.nome}`, 409);
  }

  const balanceAfterCents = Number(wallet.saldo_disponivel_centavos) - amount;

  await database.lancamentoCarteira.create({
    data: {
      carteira_id: wallet.id,
      descricao: description,
      origem: origin,
      origem_id: originId,
      saldo_anterior_centavos: wallet.saldo_disponivel_centavos,
      saldo_posterior_centavos: BigInt(balanceAfterCents),
      status: "PROCESSADO",
      tipo_lancamento: "DEBITO",
      usuario_id: userId,
      valor_centavos: BigInt(amount),
    },
  });

  return {
    amountCents: amount,
    code: wallet.tipo_carteira.codigo,
    id: wallet.id,
  };
}

export async function getWalletOverview(userId) {
  await ensureUserWallets(userId);

  const [wallets, movements] = await Promise.all([
    prisma.carteira.findMany({
      include: { tipo_carteira: true },
      orderBy: { tipo_carteira: { nome: "asc" } },
      where: { usuario_id: userId },
    }),
    prisma.lancamentoCarteira.findMany({
      include: { carteira: { include: { tipo_carteira: true } } },
      orderBy: { criado_em: "desc" },
      take: 30,
      where: { usuario_id: userId },
    }),
  ]);
  const paymentIds = [
    ...new Set(
      movements
        .filter((movement) => movement.origem === "PAGAMENTO" && movement.origem_id)
        .map((movement) => movement.origem_id),
    ),
  ];
  const payments = paymentIds.length > 0
    ? await prisma.pagamento.findMany({
        include: {
          cobranca: {
            select: {
              codigo_publico: true,
              origem: true,
              titulo: true,
            },
          },
          loja: { select: { id: true, nome: true } },
          pedido_loja: { select: { codigo: true } },
          vendedor: { select: { id: true, nome_publico: true } },
        },
        where: {
          id: { in: paymentIds },
          usuario_pagador_id: userId,
        },
      })
    : [];
  const paymentsById = new Map(payments.map((payment) => [payment.id, payment]));
  const serializedWallets = wallets.map(serializeWallet);

  return {
    movements: movements.map((movement) =>
      serializeMovement(movement, paymentsById.get(movement.origem_id)),
    ),
    summary: serializedWallets.reduce(
      (summary, wallet) => ({
        availableCents: summary.availableCents + wallet.availableCents,
        blockedCents: summary.blockedCents + wallet.blockedCents,
        pendingCents: summary.pendingCents + wallet.pendingCents,
        totalCents: summary.totalCents + wallet.totalCents,
      }),
      { availableCents: 0, blockedCents: 0, pendingCents: 0, totalCents: 0 },
    ),
    wallets: serializedWallets,
  };
}

export async function getWalletByCode(userId, code) {
  await ensureUserWallets(userId);

  const wallet = await prisma.carteira.findFirst({
    include: {
      lancamentos: { orderBy: { criado_em: "desc" }, take: 50 },
      tipo_carteira: true,
    },
    where: { tipo_carteira: { codigo: code }, usuario_id: userId },
  });

  if (!wallet) {
    throw new AppError("Carteira nao encontrada", 404);
  }

  return {
    movements: wallet.lancamentos.map((movement) =>
      serializeMovement({ ...movement, carteira: wallet }),
    ),
    wallet: serializeWallet(wallet),
  };
}
