import { prisma } from "../../config/prisma.js";

export function createEarningsReleaseRepository(database = prisma) {
  return {
    createFinancialEvent(args) {
      return database.eventoFinanceiro.create(args);
    },

    findCommercialTransaction(args) {
      return database.transacaoComercial.findUnique(args);
    },

    findDueTransactions(cutoff, take) {
      return database.transacaoComercial.findMany({
        orderBy: { validada_em: "asc" },
        select: { id: true },
        take,
        where: {
          pagamento: { status: { in: ["PAGO", "LIQUIDADO"] } },
          status: "VALIDADA",
          validada_em: { lte: cutoff },
        },
      });
    },

    findWallet(args) {
      return database.carteira.findUnique(args);
    },

    findWalletEntries(args) {
      return database.lancamentoCarteira.findMany(args);
    },

    lockCommercialTransaction(transactionId) {
      const lockKey = 724_010_000_000 + Number(transactionId);
      return database.$queryRaw`
        SELECT pg_advisory_xact_lock(CAST(${lockKey} AS bigint))::text AS locked
      `;
    },

    movePendingWalletBalance(walletId, amount) {
      return database.carteira.updateMany({
        data: {
          saldo_disponivel_centavos: { increment: BigInt(amount) },
          saldo_pendente_centavos: { decrement: BigInt(amount) },
        },
        where: {
          id: walletId,
          saldo_pendente_centavos: { gte: BigInt(amount) },
          status: "ATIVA",
        },
      });
    },

    transaction(work) {
      return database.$transaction((transaction) =>
        work(createEarningsReleaseRepository(transaction), transaction),
      );
    },

    updateCommercialTransactions(args) {
      return database.transacaoComercial.updateMany(args);
    },

    updateIndications(args) {
      return database.indicacao.updateMany(args);
    },

    updatePlatformAccount(args) {
      return database.contaPlataforma.update(args);
    },

    updatePlatformEntries(args) {
      return database.lancamentoPlataforma.updateMany(args);
    },

    updateReceivables(args) {
      return database.recebivel.updateMany(args);
    },

    updateRewards(args) {
      return database.recompensa.updateMany(args);
    },

    updateWalletEntry(args) {
      return database.lancamentoCarteira.update(args);
    },
  };
}

export const earningsReleaseRepository = createEarningsReleaseRepository();
