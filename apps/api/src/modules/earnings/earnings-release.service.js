import { AppError } from "../../utils/errors.js";
import { EARNINGS_HOLD_MS } from "./order-earnings.service.js";
import {
  createEarningsReleaseRepository,
  earningsReleaseRepository,
} from "./earnings-release.repository.js";

const releasableWalletOrigins = [
  "VENDA",
  "CASHBACK",
  "BONUS_INDICACAO",
  "BONUS_VENDEDOR",
  "BONUS_REDE",
];

function cents(value) {
  return Number(value ?? 0);
}

export async function releaseCommercialSettlement(
  database,
  transactionId,
  { holdMs = EARNINGS_HOLD_MS, now = new Date(), reason = "apos 24 horas" } = {},
) {
  const repository = createEarningsReleaseRepository(database);
  await repository.lockCommercialTransaction(transactionId);

  const transaction = await repository.findCommercialTransaction({
    include: {
      lojista: { select: { usuario_id: true } },
      lancamentos_plataforma: {
        where: { status: "PENDENTE", tipo_lancamento: "CREDITO" },
      },
      pagamento: {
        select: {
          id: true,
          status: true,
          cobranca: {
            select: {
              proposta_servico: {
                select: { concluido_em: true, status: true },
              },
            },
          },
        },
      },
      recompensas: {
        select: { tipo_recompensa: true },
        where: { status: "PENDENTE" },
      },
      vendedor: { select: { usuario_id: true } },
    },
    where: { id: transactionId },
  });

  if (!transaction || transaction.status !== "VALIDADA") {
    return { released: false, transactionId, walletUserIds: [] };
  }

  const availableAt = transaction.validada_em
    ? new Date(transaction.validada_em.getTime() + holdMs)
    : null;

  if (!availableAt || availableAt.getTime() > now.getTime()) {
    return { availableAt, released: false, transactionId, walletUserIds: [] };
  }

  if (!["PAGO", "LIQUIDADO"].includes(transaction.pagamento.status)) {
    return { availableAt, released: false, transactionId, walletUserIds: [] };
  }

  // Defesa para transacoes antigas ou criadas por alguma integracao: nunca
  // libera valor de servico enquanto a entrega ainda nao foi confirmada.
  const serviceProposal = transaction.pagamento.cobranca?.proposta_servico;
  if (
    serviceProposal
    && (serviceProposal.status !== "CONCLUIDA" || !serviceProposal.concluido_em)
  ) {
    return { availableAt, released: false, transactionId, walletUserIds: [] };
  }

  const walletCredits = await repository.findWalletEntries({
    orderBy: { id: "asc" },
    where: {
      origem: { in: releasableWalletOrigins },
      origem_id: transaction.id,
      status: "PENDENTE",
      tipo_lancamento: "CREDITO",
    },
  });

  for (const credit of walletCredits) {
    const amount = cents(credit.valor_centavos);
    const moved = await repository.movePendingWalletBalance(credit.carteira_id, amount);

    if (moved.count !== 1) {
      throw new AppError(
        `Saldo pendente inconsistente na carteira ${credit.carteira_id}; liberacao cancelada`,
        409,
      );
    }

    const wallet = await repository.findWallet({
      select: { saldo_disponivel_centavos: true },
      where: { id: credit.carteira_id },
    });
    const balanceAfter = cents(wallet.saldo_disponivel_centavos);

    await repository.updateWalletEntry({
      data: {
        liberado_em: now,
        saldo_anterior_centavos: BigInt(balanceAfter - amount),
        saldo_posterior_centavos: BigInt(balanceAfter),
        status: "PROCESSADO",
      },
      where: { id: credit.id },
    });
  }

  for (const entry of transaction.lancamentos_plataforma) {
    await repository.updatePlatformAccount({
      data: { saldo_centavos: { increment: entry.valor_centavos } },
      where: { id: entry.conta_plataforma_id },
    });
    const processed = await repository.updatePlatformEntries({
      data: { status: "PROCESSADO" },
      where: { id: entry.id, status: "PENDENTE" },
    });

    if (processed.count !== 1) {
      throw new AppError("Lancamento da plataforma mudou durante a liberacao", 409);
    }
  }

  await Promise.all([
    repository.updateRewards({
      data: { liberado_em: now, status: "LIBERADA" },
      where: { status: "PENDENTE", transacao_comercial_id: transaction.id },
    }),
    repository.updateReceivables({
      data: { status: "DISPONIVEL" },
      where: { status: "PENDENTE", transacao_comercial_id: transaction.id },
    }),
  ]);

  const rewardTypes = new Set(
    transaction.recompensas.map((reward) => reward.tipo_recompensa),
  );
  const sellerUserId = transaction.lojista?.usuario_id ?? transaction.vendedor?.usuario_id;
  const indicationUpdates = [];

  if (rewardTypes.has("BONUS_INDICACAO_CONSUMIDOR")) {
    indicationUpdates.push(repository.updateIndications({
      data: { primeira_compra_em: now, status: "CONVERTIDA" },
      where: {
        indicado_usuario_id: transaction.comprador_usuario_id,
        primeira_compra_em: null,
        status: { in: ["ATIVA", "PENDENTE", "CONVERTIDA"] },
      },
    }));
  }

  if (sellerUserId && rewardTypes.has("BONUS_VENDEDOR")) {
    indicationUpdates.push(repository.updateIndications({
      data: { primeira_venda_em: now, status: "CONVERTIDA" },
      where: {
        indicado_usuario_id: sellerUserId,
        primeira_venda_em: null,
        status: { in: ["ATIVA", "PENDENTE", "CONVERTIDA"] },
      },
    }));
  }

  await Promise.all(indicationUpdates);

  const claimed = await repository.updateCommercialTransactions({
    data: { liquidada_em: now, status: "LIQUIDADA" },
    where: { id: transaction.id, status: "VALIDADA" },
  });

  if (claimed.count !== 1) {
    throw new AppError("A transacao mudou durante a liberacao financeira", 409);
  }

  await repository.createFinancialEvent({
    data: {
      dados_json: {
        holdHours: holdMs / (60 * 60 * 1000),
        platformEntries: transaction.lancamentos_plataforma.length,
        walletCredits: walletCredits.length,
      },
      descricao: `Ganhos do pagamento ${transaction.pagamento_id} liberados ${reason}.`,
      pagamento_id: transaction.pagamento_id,
      tipo_evento: "SALDO_LIBERADO",
      transacao_comercial_id: transaction.id,
    },
  });

  return {
    availableAt,
    released: true,
    transactionId: transaction.id,
    walletUserIds: [...new Set(walletCredits.map((credit) => credit.usuario_id))],
  };
}

export async function releaseDueCommercialSettlements({
  batchSize = 50,
  now = new Date(),
} = {}) {
  const cutoff = new Date(now.getTime() - EARNINGS_HOLD_MS);
  const due = await earningsReleaseRepository.findDueTransactions(cutoff, batchSize);
  const released = [];
  const failed = [];

  for (const transaction of due) {
    try {
      const result = await earningsReleaseRepository.transaction((repository, database) =>
        releaseCommercialSettlement(database, transaction.id, { now }),
      );

      if (result.released) {
        released.push(result);
      }
    } catch (error) {
      failed.push({ error, transactionId: transaction.id });
    }
  }

  return { failed, released };
}
