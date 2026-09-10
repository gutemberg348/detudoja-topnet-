import { AppError } from "../../utils/errors.js";
import { createWalletRepository, walletRepository } from "./wallet.repository.js";

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
  const earningsOrigins = new Set([
    "VENDA",
    "CASHBACK",
    "BONUS_INDICACAO",
    "BONUS_VENDEDOR",
    "BONUS_REDE",
  ]);
  const availableAt = movement.status === "PENDENTE" && earningsOrigins.has(movement.origem)
    ? new Date(movement.criado_em.getTime() + (24 * 60 * 60 * 1000)).toISOString()
    : null;

  return {
    availableAt,
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

export async function ensureUserWallets(userId, database) {
  const repository = database ? createWalletRepository(database) : walletRepository;
  const walletTypes = [];

  for (const definition of walletTypeDefinitions) {
    const walletType = await repository.upsertWalletType(definition);
    walletTypes.push(walletType);
  }

  await repository.createMissingWallets(userId, walletTypes);
}

export async function creditUserWallet({
  availableAt = null,
  database,
  description,
  origin,
  originId,
  userId,
  valueCents,
  walletCode,
}) {
  const repository = database ? createWalletRepository(database) : walletRepository;
  const amount = Number(valueCents ?? 0);

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new AppError("Valor de credito da carteira invalido", 400);
  }

  if (amount === 0) {
    return null;
  }

  await ensureUserWallets(userId, database);

  const wallet = await repository.findActiveWalletByCode(userId, walletCode);

  if (!wallet) {
    throw new AppError("Carteira ativa nao encontrada para o credito", 409);
  }

  const releaseAt = availableAt ? new Date(availableAt) : null;
  const isPending = releaseAt && releaseAt.getTime() > Date.now();

  if (isPending) {
    const updatedWallet = await repository.incrementPendingBalance(wallet.id, amount);
    const availableBalance = Number(updatedWallet.saldo_disponivel_centavos);

    return repository.createMovement({
      carteira_id: wallet.id,
      descricao: description,
      origem: origin,
      origem_id: originId,
      saldo_anterior_centavos: BigInt(availableBalance),
      saldo_posterior_centavos: BigInt(availableBalance),
      status: "PENDENTE",
      tipo_lancamento: "CREDITO",
      usuario_id: userId,
      valor_centavos: BigInt(amount),
    });
  }

  const updatedWallet = await repository.incrementAvailableBalance(wallet.id, amount);
  const balanceAfterCents = Number(updatedWallet.saldo_disponivel_centavos);

  return repository.createMovement({
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
  });
}

export async function debitUserWallet({
  database,
  description,
  origin = "PAGAMENTO",
  originId,
  userId,
  valueCents,
  walletId,
}) {
  const repository = database ? createWalletRepository(database) : walletRepository;
  const amount = Number(valueCents ?? 0);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError("Valor de debito da carteira invalido", 400);
  }

  const wallet = await repository.findActivePurchaseWallet(userId, walletId);

  if (!wallet) {
    throw new AppError("Carteira nao encontrada para o pagamento", 404);
  }

  const updated = await repository.decrementAvailableBalance(wallet.id, amount);

  if (updated.count !== 1) {
    throw new AppError(`Saldo insuficiente na carteira ${wallet.tipo_carteira.nome}`, 409);
  }

  const balanceAfterCents = Number(wallet.saldo_disponivel_centavos) - amount;

  await repository.createMovement({
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
  });

  return {
    amountCents: amount,
    code: wallet.tipo_carteira.codigo,
    id: wallet.id,
  };
}

export async function adjustUserWallet({
  adminId,
  database,
  description,
  operation,
  userId,
  valueCents,
  walletCode,
}) {
  const repository = database ? createWalletRepository(database) : walletRepository;
  const amount = Number(valueCents ?? 0);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError("Valor do ajuste da carteira invalido", 400);
  }

  if (operation === "CREDIT") {
    return creditUserWallet({
      database,
      description,
      origin: "AJUSTE_ADMIN",
      originId: adminId,
      userId,
      valueCents: amount,
      walletCode,
    });
  }

  if (operation !== "DEBIT") {
    throw new AppError("Operacao de ajuste invalida", 400);
  }

  await ensureUserWallets(userId, database);
  const wallet = await repository.findActiveWalletWithTypeByCode(userId, walletCode);

  if (!wallet) {
    throw new AppError("Carteira ativa nao encontrada para o ajuste", 404);
  }

  const updated = await repository.decrementAvailableBalance(wallet.id, amount);

  if (updated.count !== 1) {
    throw new AppError(`Saldo insuficiente na carteira ${wallet.tipo_carteira.nome}`, 409);
  }

  const balanceBeforeCents = Number(wallet.saldo_disponivel_centavos);
  return repository.createMovement({
    carteira_id: wallet.id,
    descricao: description,
    origem: "AJUSTE_ADMIN",
    origem_id: adminId,
    saldo_anterior_centavos: BigInt(balanceBeforeCents),
    saldo_posterior_centavos: BigInt(balanceBeforeCents - amount),
    status: "PROCESSADO",
    tipo_lancamento: "DEBITO",
    usuario_id: userId,
    valor_centavos: BigInt(amount),
  });
}

const purchaseWalletPriority = ["cashback", "saldo_pix", "rede", "vendas"];

export async function allocateUserWalletsForPayment({
  database,
  userId,
  valueCents,
}) {
  const repository = database ? createWalletRepository(database) : walletRepository;
  const requested = Number(valueCents ?? 0);

  if (!Number.isSafeInteger(requested) || requested < 0) {
    throw new AppError("Valor de uso das carteiras invalido", 400);
  }

  if (requested === 0) {
    return [];
  }

  await ensureUserWallets(userId, database);
  const wallets = await repository.findPurchaseWallets(userId);
  const sorted = [...wallets].sort((left, right) =>
    purchaseWalletPriority.indexOf(left.tipo_carteira.codigo)
    - purchaseWalletPriority.indexOf(right.tipo_carteira.codigo),
  );
  const allocations = [];
  let remaining = requested;

  for (const wallet of sorted) {
    const available = cents(wallet.saldo_disponivel_centavos);
    const amountCents = Math.min(available, remaining);

    if (amountCents > 0) {
      allocations.push({
        amountCents,
        code: wallet.tipo_carteira.codigo,
        id: wallet.id,
      });
      remaining -= amountCents;
    }

    if (remaining === 0) {
      break;
    }
  }

  if (remaining > 0) {
    throw new AppError("Saldo insuficiente nas carteiras selecionadas", 409);
  }

  return allocations;
}

export async function getWalletOverview(userId) {
  await ensureUserWallets(userId);

  const [wallets, movements] = await Promise.all([
    walletRepository.findWallets(userId),
    walletRepository.findMovements(userId),
  ]);
  const paymentIds = [
    ...new Set(
      movements
        .filter((movement) => movement.origem === "PAGAMENTO" && movement.origem_id)
        .map((movement) => movement.origem_id),
    ),
  ];
  const payments = paymentIds.length > 0
    ? await walletRepository.findPayments(userId, paymentIds)
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

  const wallet = await walletRepository.findWalletByCode(userId, code);

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
