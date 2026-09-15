import { emitWalletUpdated } from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { recordFinancialFailure } from "../monitoring/monitoring.service.js";
import { sendExpoPushToUsers } from "../notifications/notifications.service.js";
import {
  createAsaasPixTransfer,
  getAsaasTransfer,
  isAsaasEnabled,
  listAsaasTransfers,
} from "../payments/asaas.client.js";
import { getWithdrawalSettings } from "./withdrawal.config.js";
import {
  createWithdrawalRepository,
  withdrawalRepository,
} from "./withdrawal.repository.js";

const withdrawalInclude = {
  carteira: { include: { tipo_carteira: true } },
  conta_bancaria: true,
  origens_carteira: {
    include: { carteira: { include: { tipo_carteira: true } } },
  },
  usuario: { select: { email: true, id: true, nome: true } },
};

const transferTypeByPixType = {
  ALEATORIA: "EVP",
  CNPJ: "CNPJ",
  CPF: "CPF",
  EMAIL: "EMAIL",
  TELEFONE: "PHONE",
};

const finalStatuses = new Set(["PAGO", "RECUSADO", "CANCELADO", "FALHOU"]);
const withdrawalStatuses = new Set([
  "SOLICITADO",
  "EM_ANALISE",
  "APROVADO",
  "PROCESSANDO",
  "EM_RECONCILIACAO",
  "PAGO",
  "RECUSADO",
  "CANCELADO",
  "FALHOU",
]);

function cents(value) {
  return Number(value ?? 0);
}

function asaasValue(valueCents) {
  return Number((Number(valueCents) / 100).toFixed(2));
}

function parseWithdrawalId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError("Saque invalido", 400);
  return id;
}

function maskPixKey(type, key) {
  if (!key) return null;
  if (type === "EMAIL") {
    const [name, domain] = key.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  if (type === "TELEFONE") return `(**) *****-${key.slice(-4)}`;
  if (["CPF", "CNPJ"].includes(type)) return `${"*".repeat(Math.max(key.length - 4, 0))}${key.slice(-4)}`;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function normalizeWithdrawalSources(data) {
  const sources = data.walletSources?.length
    ? data.walletSources
    : [{ amountCents: data.amountCents, walletCode: data.walletCode }];

  const normalized = sources.map((source) => ({
    amountCents: Number(source.amountCents),
    walletCode: String(source.walletCode ?? "").trim(),
  }));

  if (!normalized.length || normalized.some((source) => !source.walletCode || source.amountCents <= 0)) {
    throw new AppError("Selecione carteiras validas para o saque", 400);
  }
  if (new Set(normalized.map((source) => source.walletCode)).size !== normalized.length) {
    throw new AppError("Uma carteira nao pode ser repetida no mesmo saque", 400);
  }
  if (normalized.reduce((total, source) => total + source.amountCents, 0) !== Number(data.amountCents)) {
    throw new AppError("As origens precisam somar o valor total do saque", 400);
  }
  return normalized;
}

function withdrawalWalletSources(withdrawal) {
  const sources = withdrawal.origens_carteira?.length
    ? withdrawal.origens_carteira.map((origin) => ({
        amountCents: origin.valor_centavos,
        wallet: origin.carteira,
      }))
    : withdrawal.carteira
      ? [{ amountCents: withdrawal.valor_centavos, wallet: withdrawal.carteira }]
      : [];

  return sources.map((source) => ({
    amountCents: BigInt(source.amountCents),
    wallet: source.wallet,
  }));
}

function sourceSignature(sources) {
  return sources
    .map((source) => `${source.walletCode}:${source.amountCents}`)
    .sort()
    .join("|");
}

function serializeWithdrawal(withdrawal) {
  const walletSources = withdrawalWalletSources(withdrawal).map((source) => ({
    amountCents: cents(source.amountCents),
    code: source.wallet?.tipo_carteira?.codigo ?? null,
    id: source.wallet?.id ?? null,
    name: source.wallet?.tipo_carteira?.nome ?? "Carteira",
  }));
  return {
    approvedAt: withdrawal.aprovado_em?.toISOString() ?? null,
    createdAt: withdrawal.solicitado_em.toISOString(),
    failureReason: withdrawal.motivo_falha ?? withdrawal.motivo_cancelamento ?? null,
    feeCents: cents(withdrawal.taxa_saque_centavos),
    grossAmountCents: cents(withdrawal.valor_centavos),
    id: withdrawal.id,
    netAmountCents: cents(withdrawal.valor_liquido_centavos),
    paidAt: withdrawal.processado_em?.toISOString() ?? null,
    pixAccount: {
      holderName: withdrawal.nome_titular ?? withdrawal.conta_bancaria?.nome_titular ?? null,
      keyMasked: maskPixKey(
        withdrawal.tipo_chave_pix ?? withdrawal.conta_bancaria?.tipo_chave,
        withdrawal.chave_pix_destino ?? withdrawal.conta_bancaria?.chave_pix,
      ),
      keyType: withdrawal.tipo_chave_pix ?? withdrawal.conta_bancaria?.tipo_chave ?? null,
    },
    receiptUrl: withdrawal.comprovante_url ?? null,
    reference: withdrawal.referencia_externa ?? `DTJ-SAQUE-${withdrawal.id}`,
    status: withdrawal.status,
    user: withdrawal.usuario
      ? { email: withdrawal.usuario.email, id: withdrawal.usuario.id, name: withdrawal.usuario.nome }
      : null,
    wallet: withdrawal.carteira
      ? {
          code: withdrawal.carteira.tipo_carteira.codigo,
          id: withdrawal.carteira.id,
          name: withdrawal.carteira.tipo_carteira.nome,
        }
      : null,
    walletSources,
  };
}

function assertSameWithdrawalRequest(withdrawal, data) {
  const sameAmount = cents(withdrawal.valor_centavos) === Number(data.amountCents);
  const currentSources = withdrawalWalletSources(withdrawal).map((source) => ({
    amountCents: cents(source.amountCents),
    walletCode: source.wallet?.tipo_carteira?.codigo,
  }));
  const sameSources = sourceSignature(currentSources) === sourceSignature(normalizeWithdrawalSources(data));
  if (!sameAmount || !sameSources) {
    throw new AppError("A chave de idempotencia ja foi usada em outro saque", 409);
  }
}

function brazilianDayStart() {
  const date = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).format(new Date());
  return new Date(`${date}T00:00:00-03:00`);
}

function asaasDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).format(date);
}

async function releaseReservedWithdrawal(withdrawalId, {
  notifyUser = false,
  reason,
  status,
  updateData = {},
}) {
  const released = await withdrawalRepository.transaction(async (database) => {
    const repository = createWithdrawalRepository(database);
    const withdrawal = await repository.findWithdrawalUnique({
      include: withdrawalInclude,
      where: { id: withdrawalId },
    });

    if (!withdrawal || finalStatuses.has(withdrawal.status)) return null;

    const sources = withdrawalWalletSources(withdrawal);
    if (!sources.length) throw new AppError("Origens financeiras do saque nao encontradas", 409);
    const claimed = await repository.updateWithdrawals({
      data: {
        cancelado_em: ["CANCELADO", "RECUSADO"].includes(status) ? new Date() : null,
        falhou_em: status === "FALHOU" ? new Date() : null,
        motivo_cancelamento: ["CANCELADO", "RECUSADO"].includes(status) ? reason : null,
        motivo_falha: status === "FALHOU" ? reason : null,
        status,
        ...updateData,
      },
      where: { id: withdrawal.id, status: withdrawal.status },
    });
    if (claimed.count !== 1) return null;

    for (const source of sources.sort((left, right) => left.wallet.id - right.wallet.id)) {
      const restored = await repository.updateWallets({
        data: {
          saldo_bloqueado_centavos: { decrement: source.amountCents },
          saldo_disponivel_centavos: { increment: source.amountCents },
        },
        where: {
          id: source.wallet.id,
          saldo_bloqueado_centavos: { gte: source.amountCents },
        },
      });
      if (restored.count !== 1) throw new AppError("Reserva do saque nao encontrada", 409);

      const balanceAfter = source.wallet.saldo_disponivel_centavos + source.amountCents;
      await repository.createWalletEntry({
        data: {
          carteira_id: source.wallet.id,
          descricao: `Reserva do saque ${withdrawal.referencia_externa} devolvida. ${reason}`,
          origem: "SAQUE",
          origem_id: withdrawal.id,
          saldo_anterior_centavos: source.wallet.saldo_disponivel_centavos,
          saldo_posterior_centavos: balanceAfter,
          status: "PROCESSADO",
          tipo_lancamento: "DESBLOQUEIO",
          usuario_id: withdrawal.usuario_id,
          valor_centavos: source.amountCents,
        },
      });
    }

    const updated = await repository.findWithdrawalUnique({
      include: withdrawalInclude,
      where: { id: withdrawal.id },
    });
    return { userId: withdrawal.usuario_id, withdrawal: updated };
  });

  if (released) {
    emitWalletUpdated({ userIds: [released.userId] });
    if (notifyUser) {
      void sendExpoPushToUsers({
        body: "O Pix nao foi concluido. Todo o valor reservado voltou para as carteiras usadas no saque.",
        data: { type: "withdrawal_failed", withdrawalId: String(withdrawalId) },
        title: "Saque devolvido ao saldo",
        userIds: [released.userId],
      });
    }
    if (status === "FALHOU") {
      recordFinancialFailure("withdrawals", reason, {
        withdrawalId,
        walletRestored: true,
      });
    }
  }
  return released?.withdrawal ?? null;
}

async function confirmWithdrawal(withdrawalId, transfer = {}) {
  const result = await withdrawalRepository.transaction(async (database) => {
    const repository = createWithdrawalRepository(database);
    const withdrawal = await repository.findWithdrawalUnique({
      include: withdrawalInclude,
      where: { id: withdrawalId },
    });
    if (!withdrawal || withdrawal.status === "PAGO") return withdrawal ? { withdrawal } : null;
    if (!["PROCESSANDO", "EM_RECONCILIACAO"].includes(withdrawal.status)) {
      throw new AppError("Saque nao esta em estado confirmavel", 409);
    }

    const sources = withdrawalWalletSources(withdrawal);
    if (!sources.length) throw new AppError("Origens financeiras do saque nao encontradas", 409);

    for (const source of sources.sort((left, right) => left.wallet.id - right.wallet.id)) {
      const removed = await repository.updateWallets({
        data: { saldo_bloqueado_centavos: { decrement: source.amountCents } },
        where: {
          id: source.wallet.id,
          saldo_bloqueado_centavos: { gte: source.amountCents },
        },
      });
      if (removed.count !== 1) throw new AppError("Reserva financeira do saque esta inconsistente", 409);

      await repository.createWalletEntry({
        data: {
          carteira_id: source.wallet.id,
          descricao: `Saque Pix ${withdrawal.referencia_externa} concluido.`,
          origem: "SAQUE",
          origem_id: withdrawal.id,
          saldo_anterior_centavos: source.wallet.saldo_disponivel_centavos,
          saldo_posterior_centavos: source.wallet.saldo_disponivel_centavos,
          status: "PROCESSADO",
          tipo_lancamento: "DEBITO",
          usuario_id: withdrawal.usuario_id,
          valor_centavos: source.amountCents,
        },
      });
    }

    if (withdrawal.taxa_saque_centavos > 0n) {
      const platformAccount = await repository.upsertPlatformAccount({
        create: {
          nome: "Taxas de pagamento",
          saldo_centavos: withdrawal.taxa_saque_centavos,
          tipo_conta: "TAXAS_PAGAMENTO",
        },
        update: { saldo_centavos: { increment: withdrawal.taxa_saque_centavos } },
        where: { tipo_conta: "TAXAS_PAGAMENTO" },
      });
      await repository.createPlatformEntry({
        data: {
          conta_plataforma_id: platformAccount.id,
          descricao: `Taxa fixa do saque ${withdrawal.referencia_externa}.`,
          saque_id: withdrawal.id,
          status: "PROCESSADO",
          tipo_lancamento: "CREDITO",
          valor_centavos: withdrawal.taxa_saque_centavos,
        },
      });
    }

    const paidAt = new Date();
    const updated = await repository.updateWithdrawal({
      data: {
        comprovante_url: transfer.transactionReceiptUrl ?? withdrawal.comprovante_url,
        gateway_saque_id: transfer.id ?? withdrawal.gateway_saque_id,
        motivo_falha: null,
        processado_em: paidAt,
        status: "PAGO",
      },
      include: withdrawalInclude,
      where: { id: withdrawal.id },
    });
    return { withdrawal: updated };
  });

  if (result) emitWalletUpdated({ userIds: [result.withdrawal.usuario_id] });
  return result?.withdrawal ?? null;
}

export async function getWithdrawalOverview(userId) {
  const [settings, account, wallets, withdrawals] = await Promise.all([
    getWithdrawalSettings(),
    withdrawalRepository.findBankAccount({
      where: { excluido_em: null, principal: true, usuario_id: userId },
    }),
    withdrawalRepository.listWallets({
      include: { tipo_carteira: true },
      orderBy: { tipo_carteira: { nome: "asc" } },
      where: {
        status: "ATIVA",
        tipo_carteira: { permite_saque: true, status: "ATIVO" },
        usuario_id: userId,
      },
    }),
    withdrawalRepository.listWithdrawals({
      include: withdrawalInclude,
      orderBy: { solicitado_em: "desc" },
      take: 50,
      where: { usuario_id: userId },
    }),
  ]);
  return {
    account: account
      ? {
          holderName: account.nome_titular,
          keyMasked: maskPixKey(account.tipo_chave, account.chave_pix),
          keyType: account.tipo_chave,
          status: account.status,
        }
      : null,
    settings,
    wallets: wallets.map((wallet) => ({
      availableCents: cents(wallet.saldo_disponivel_centavos),
      code: wallet.tipo_carteira.codigo,
      id: wallet.id,
      name: wallet.tipo_carteira.nome,
    })),
    withdrawals: withdrawals.map(serializeWithdrawal),
  };
}

export async function requestWithdrawal(userId, data) {
  const settings = await getWithdrawalSettings();
  if (!settings.enabled) throw new AppError("Saques estao temporariamente indisponiveis", 503);
  if (!settings.manualApproval && !isAsaasEnabled()) {
    throw new AppError("Gateway Asaas indisponivel para saque automatico", 503);
  }

  const amount = Number(data.amountCents);
  const requestedSources = normalizeWithdrawalSources(data);
  if (amount < settings.minimumCents || amount > settings.maximumCents) {
    throw new AppError("O valor esta fora dos limites permitidos para saque", 400);
  }
  if (settings.fixedFeeCents >= amount) {
    throw new AppError("O valor precisa ser maior que a taxa de saque", 400);
  }

  let outcome;
  try {
    outcome = await withdrawalRepository.transaction(async (database) => {
      const repository = createWithdrawalRepository(database);
      const duplicate = await repository.findWithdrawal({
        include: withdrawalInclude,
        where: { chave_idempotencia: data.idempotencyKey, usuario_id: userId },
      });
      if (duplicate) {
        assertSameWithdrawalRequest(duplicate, data);
        return { created: false, withdrawal: duplicate };
      }

      const user = await repository.findUser({
        include: { kyc: true },
        where: { excluido_em: null, id: userId, status: "ATIVO" },
      });
      if (!user) throw new AppError("Usuario nao encontrado", 404);
      if (user.nivel_kyc !== "TIER_2" || user.kyc?.status !== "APROVADO") {
        throw new AppError("Conclua a verificacao KYC antes de solicitar um saque", 428);
      }

      const account = await repository.findBankAccount({
        where: {
          chave_pix: { not: null },
          excluido_em: null,
          principal: true,
          status: "ATIVA",
          tipo_chave: { not: null },
          usuario_id: userId,
        },
      });
      if (!account) throw new AppError("Cadastre uma chave Pix ativa antes de solicitar o saque", 428);

      const wallets = await repository.listWallets({
        include: { tipo_carteira: true },
        where: {
          status: "ATIVA",
          tipo_carteira: {
            codigo: { in: requestedSources.map((source) => source.walletCode) },
            permite_saque: true,
            status: "ATIVO",
          },
          usuario_id: userId,
        },
      });
      const walletsByCode = new Map(wallets.map((wallet) => [wallet.tipo_carteira.codigo, wallet]));
      const sources = requestedSources.map((source) => ({
        ...source,
        wallet: walletsByCode.get(source.walletCode),
      }));
      if (sources.some((source) => !source.wallet)) {
        throw new AppError("Uma das carteiras selecionadas nao esta habilitada para saque", 409);
      }

      const usedToday = await repository.sumWithdrawals({
        _sum: { valor_centavos: true },
        where: {
          solicitado_em: { gte: brazilianDayStart() },
          status: { notIn: ["RECUSADO", "CANCELADO", "FALHOU"] },
          usuario_id: userId,
        },
      });
      if (cents(usedToday._sum.valor_centavos) + amount > settings.dailyLimitCents) {
        throw new AppError("O limite diario de saque foi atingido", 409);
      }

      for (const source of [...sources].sort((left, right) => left.wallet.id - right.wallet.id)) {
        const sourceAmount = BigInt(source.amountCents);
        const reserved = await repository.updateWallets({
          data: {
            saldo_bloqueado_centavos: { increment: sourceAmount },
            saldo_disponivel_centavos: { decrement: sourceAmount },
          },
          where: {
            id: source.wallet.id,
            saldo_disponivel_centavos: { gte: sourceAmount },
            status: "ATIVA",
          },
        });
        if (reserved.count !== 1) throw new AppError("Saldo disponivel insuficiente em uma das carteiras selecionadas", 409);
      }

      const withdrawal = await repository.createWithdrawal({
        data: {
          carteira_id: sources[0].wallet.id,
          chave_idempotencia: data.idempotencyKey,
          chave_pix_destino: account.chave_pix,
          conta_bancaria_id: account.id,
          documento_titular: account.documento_titular,
          nome_titular: account.nome_titular,
          status: settings.manualApproval ? "SOLICITADO" : "APROVADO",
          taxa_saque_centavos: BigInt(settings.fixedFeeCents),
          tipo_chave_pix: account.tipo_chave,
          usuario_id: userId,
          valor_centavos: BigInt(amount),
          valor_liquido_centavos: BigInt(amount - settings.fixedFeeCents),
          origens_carteira: {
            create: sources.map((source) => ({
              carteira_id: source.wallet.id,
              valor_centavos: BigInt(source.amountCents),
            })),
          },
          ...(settings.manualApproval ? {} : { aprovado_em: new Date() }),
        },
        include: withdrawalInclude,
      });
      const referenced = await repository.updateWithdrawal({
        data: { referencia_externa: `DTJ-SAQUE-${withdrawal.id}` },
        include: withdrawalInclude,
        where: { id: withdrawal.id },
      });
      for (const source of sources) {
        const sourceAmount = BigInt(source.amountCents);
        await repository.createWalletEntry({
          data: {
            bloqueado_em: new Date(),
            carteira_id: source.wallet.id,
            descricao: `Valor reservado para o saque ${referenced.referencia_externa}.`,
            origem: "SAQUE",
            origem_id: referenced.id,
            saldo_anterior_centavos: source.wallet.saldo_disponivel_centavos,
            saldo_posterior_centavos: source.wallet.saldo_disponivel_centavos - sourceAmount,
            status: "BLOQUEADO",
            tipo_lancamento: "BLOQUEIO",
            usuario_id: userId,
            valor_centavos: sourceAmount,
          },
        });
      }
      return { created: true, withdrawal: referenced };
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const duplicate = await withdrawalRepository.findWithdrawal({
      include: withdrawalInclude,
      where: { chave_idempotencia: data.idempotencyKey, usuario_id: userId },
    });
    if (!duplicate) throw error;
    assertSameWithdrawalRequest(duplicate, data);
    outcome = { created: false, withdrawal: duplicate };
  }

  if (outcome.created) {
    emitWalletUpdated({ userIds: [userId] });
    if (!settings.manualApproval) await submitApprovedWithdrawal(outcome.withdrawal.id);
  }
  const current = outcome.created && !settings.manualApproval
    ? await withdrawalRepository.findWithdrawalUnique({ include: withdrawalInclude, where: { id: outcome.withdrawal.id } })
    : outcome.withdrawal;
  return { withdrawal: serializeWithdrawal(current) };
}

export async function cancelWithdrawal(userId, withdrawalId) {
  const withdrawal = await withdrawalRepository.findWithdrawal({
    where: { id: parseWithdrawalId(withdrawalId), usuario_id: userId },
  });
  if (!withdrawal) throw new AppError("Saque nao encontrado", 404);
  if (!["SOLICITADO", "EM_ANALISE"].includes(withdrawal.status)) {
    throw new AppError("Este saque nao pode mais ser cancelado pelo aplicativo", 409);
  }
  const released = await releaseReservedWithdrawal(withdrawal.id, {
    reason: "Cancelado pelo usuario antes do envio.",
    status: "CANCELADO",
  });
  if (!released) throw new AppError("O saque foi alterado por outra operacao", 409);
  return { withdrawal: serializeWithdrawal({ ...withdrawal, ...released }) };
}

export async function listAdminWithdrawals(query = {}) {
  const status = String(query.status ?? "").toUpperCase();
  if (status && !withdrawalStatuses.has(status)) throw new AppError("Status de saque invalido", 400);
  const withdrawals = await withdrawalRepository.listWithdrawals({
    include: withdrawalInclude,
    orderBy: { solicitado_em: "desc" },
    take: Math.min(Math.max(Number(query.limit) || 100, 1), 200),
    where: status ? { status } : {},
  });
  return { withdrawals: withdrawals.map(serializeWithdrawal) };
}

export async function approveWithdrawal(adminId, withdrawalId) {
  if (!isAsaasEnabled()) throw new AppError("Gateway Asaas indisponivel para enviar o saque", 503);
  const id = parseWithdrawalId(withdrawalId);
  const claimed = await withdrawalRepository.updateWithdrawals({
    data: { aprovado_em: new Date(), aprovado_por_admin_id: adminId, status: "APROVADO" },
    where: { id, status: { in: ["SOLICITADO", "EM_ANALISE"] } },
  });
  if (claimed.count !== 1) throw new AppError("Saque nao encontrado ou ja analisado", 409);
  await submitApprovedWithdrawal(id);
  const withdrawal = await withdrawalRepository.findWithdrawalUnique({ include: withdrawalInclude, where: { id } });
  return { withdrawal: serializeWithdrawal(withdrawal) };
}

export async function rejectWithdrawal(adminId, withdrawalId, reason) {
  const id = parseWithdrawalId(withdrawalId);
  const withdrawal = await withdrawalRepository.findWithdrawalUnique({ where: { id } });
  if (!withdrawal || !["SOLICITADO", "EM_ANALISE", "APROVADO"].includes(withdrawal.status)) {
    throw new AppError("Saque nao encontrado ou ja enviado", 409);
  }

  const released = await releaseReservedWithdrawal(id, {
    reason,
    status: "RECUSADO",
    updateData: { recusado_por_admin_id: adminId },
  });
  if (!released) throw new AppError("O saque foi alterado por outra operacao", 409);

  const complete = await withdrawalRepository.findWithdrawalUnique({ include: withdrawalInclude, where: { id } });
  return { withdrawal: serializeWithdrawal(complete) };
}

export async function submitApprovedWithdrawal(withdrawalId) {
  if (!isAsaasEnabled()) return null;
  const claimed = await withdrawalRepository.updateWithdrawals({
    data: { status: "PROCESSANDO", tentativas: { increment: 1 } },
    where: { id: withdrawalId, status: "APROVADO" },
  });
  if (claimed.count !== 1) return null;

  const withdrawal = await withdrawalRepository.findWithdrawalUnique({
    include: withdrawalInclude,
    where: { id: withdrawalId },
  });

  try {
    const transfer = await createAsaasPixTransfer({
      description: `Saque Brasil Cashback ${withdrawal.referencia_externa}`,
      externalReference: withdrawal.referencia_externa,
      operationType: "PIX",
      pixAddressKey: withdrawal.chave_pix_destino,
      pixAddressKeyType: transferTypeByPixType[withdrawal.tipo_chave_pix],
      value: asaasValue(withdrawal.valor_liquido_centavos),
    });
    await withdrawalRepository.updateWithdrawal({
      data: {
        enviado_em: new Date(),
        gateway_saque_id: transfer.id,
        motivo_falha: null,
      },
      where: { id: withdrawal.id },
    });
    return String(transfer.status ?? "PENDING").toUpperCase() === "DONE"
      ? confirmWithdrawal(withdrawal.id, transfer)
      : transfer;
  } catch (error) {
    if (
      error.providerStateUnknown
      || error.providerStatusCode === 429
      || error.providerStatusCode >= 500
    ) {
      await withdrawalRepository.updateWithdrawal({
        data: { motivo_falha: error.message, status: "EM_RECONCILIACAO" },
        where: { id: withdrawal.id },
      });
      return null;
    }
    await releaseReservedWithdrawal(withdrawal.id, {
      notifyUser: true,
      reason: error.message,
      status: "FALHOU",
    });
    return null;
  }
}

async function findUnknownTransfer(withdrawal) {
  const date = asaasDate(withdrawal.enviado_em ?? withdrawal.aprovado_em ?? withdrawal.solicitado_em);
  for (let offset = 0; offset < 1000; offset += 100) {
    const response = await listAsaasTransfers({
      "dateCreated[ge]": date,
      "dateCreated[le]": date,
      limit: 100,
      offset,
    });
    const transfer = response?.data?.find(
      (item) => item.externalReference === withdrawal.referencia_externa,
    );
    if (transfer) return transfer;
    if (!response?.hasMore) return null;
  }
  return null;
}

export async function reconcileWithdrawal(withdrawalId) {
  const id = parseWithdrawalId(withdrawalId);
  const withdrawal = await withdrawalRepository.findWithdrawalUnique({ where: { id } });
  if (!withdrawal || !["PROCESSANDO", "EM_RECONCILIACAO"].includes(withdrawal.status)) return null;

  await withdrawalRepository.updateWithdrawal({
    data: { tentativas: { increment: 1 } },
    where: { id: withdrawal.id },
  });
  try {
    const transfer = withdrawal.gateway_saque_id
      ? await getAsaasTransfer(withdrawal.gateway_saque_id)
      : await findUnknownTransfer(withdrawal);
    if (!transfer) return null;

    if (!withdrawal.gateway_saque_id) {
      await withdrawalRepository.updateWithdrawal({
        data: { gateway_saque_id: transfer.id, enviado_em: withdrawal.enviado_em ?? new Date() },
        where: { id: withdrawal.id },
      });
    }
    const status = String(transfer.status ?? "PENDING").toUpperCase();
    if (status === "DONE") return confirmWithdrawal(withdrawal.id, transfer);
    if (["FAILED", "CANCELLED"].includes(status)) {
      return releaseReservedWithdrawal(withdrawal.id, {
        notifyUser: true,
        reason: transfer.failReason ?? "Transferencia nao concluida",
        status: status === "CANCELLED" ? "CANCELADO" : "FALHOU",
      });
    }
    await withdrawalRepository.updateWithdrawal({
      data: { motivo_falha: null, status: "PROCESSANDO" },
      where: { id: withdrawal.id },
    });
    return transfer;
  } catch (error) {
    await withdrawalRepository.updateWithdrawal({
      data: { motivo_falha: error.message, status: "EM_RECONCILIACAO" },
      where: { id: withdrawal.id },
    });
    return null;
  }
}

export async function processAsaasWithdrawalWebhook(payload) {
  const eventId = String(payload?.id ?? "").trim();
  const event = String(payload?.event ?? "").trim().toUpperCase();
  const transferId = String(payload?.transfer?.id ?? "").trim();
  const externalReference = String(payload?.transfer?.externalReference ?? "").trim();
  if (!eventId || !event || !transferId) throw new AppError("Evento de transferencia Asaas invalido", 400);

  const withdrawal = await withdrawalRepository.findWithdrawal({
    where: {
      OR: [
        { gateway_saque_id: transferId },
        ...(externalReference ? [{ referencia_externa: externalReference }] : []),
      ],
    },
  });
  if (!withdrawal) return { handled: false };

  const gatewayEvent = await withdrawalRepository.upsertGatewayEvent({
    create: {
      gateway: "ASAAS",
      gateway_evento_id: eventId,
      payload_json: payload,
      tipo_evento: event,
    },
    update: {},
    where: { gateway_evento_id: eventId },
  });
  if (gatewayEvent.processado_em) return { duplicate: true, handled: true, processed: true };

  try {
    if (event === "TRANSFER_DONE") await confirmWithdrawal(withdrawal.id, payload.transfer);
    if (["TRANSFER_FAILED", "TRANSFER_CANCELLED"].includes(event)) {
      await releaseReservedWithdrawal(withdrawal.id, {
        notifyUser: true,
        reason: payload.transfer?.failReason ?? "Transferencia nao concluida",
        status: event === "TRANSFER_CANCELLED" ? "CANCELADO" : "FALHOU",
      });
    }
    await withdrawalRepository.updateGatewayEvent({
      data: { erro_processamento: null, processado_em: new Date() },
      where: { gateway_evento_id: eventId },
    });
  } catch (error) {
    await withdrawalRepository.updateGatewayEvent({
      data: { erro_processamento: error.message },
      where: { gateway_evento_id: eventId },
    });
    throw error;
  }
  return { duplicate: false, handled: true, processed: true };
}

export async function processPendingWithdrawals({ batchSize = 25 } = {}) {
  if (!isAsaasEnabled()) return { processed: 0, reconciled: 0 };
  const reconcileBefore = new Date(Date.now() - 30_000);
  const [approved, processing] = await Promise.all([
    withdrawalRepository.listWithdrawals({
      orderBy: { aprovado_em: "asc" },
      select: { id: true },
      take: batchSize,
      where: { status: "APROVADO" },
    }),
    withdrawalRepository.listWithdrawals({
      orderBy: { atualizado_em: "asc" },
      select: { id: true },
      take: batchSize,
      where: {
        atualizado_em: { lte: reconcileBefore },
        status: { in: ["PROCESSANDO", "EM_RECONCILIACAO"] },
      },
    }),
  ]);
  for (const item of approved) await submitApprovedWithdrawal(item.id);
  for (const item of processing) await reconcileWithdrawal(item.id);
  return { processed: approved.length, reconciled: processing.length };
}
