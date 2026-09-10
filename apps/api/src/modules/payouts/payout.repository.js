import { prisma } from "../../config/prisma.js";

export function createPayoutRepository(database = prisma) {
  return {
    createBankAccount(args) { return database.contaBancaria.create(args); },
    createPayout(args) { return database.repassePix.create(args); },
    createWalletEntry(args) { return database.lancamentoCarteira.create(args); },
    decrementWalletBalance(walletId, amount) {
      return database.carteira.updateMany({
        data: { saldo_disponivel_centavos: { decrement: BigInt(amount) } },
        where: {
          id: walletId,
          saldo_disponivel_centavos: { gte: BigInt(amount) },
          status: "ATIVA",
        },
      });
    },
    findBankAccount(args) { return database.contaBancaria.findFirst(args); },
    findBankAccountByKey(args) { return database.contaBancaria.findUnique(args); },
    findCommercialTransaction(args) { return database.transacaoComercial.findUnique(args); },
    findPayout(args) { return database.repassePix.findUnique(args); },
    findPayoutByReference(args) { return database.repassePix.findUnique(args); },
    findPayoutByTransfer(args) { return database.repassePix.findUnique(args); },
    findPendingPayouts(args) { return database.repassePix.findMany(args); },
    findUser(args) { return database.usuario.findUnique(args); },
    findWallet(args) { return database.carteira.findFirst(args); },
    incrementWalletBalance(walletId, amount) {
      return database.carteira.update({
        data: { saldo_disponivel_centavos: { increment: BigInt(amount) } },
        select: { saldo_disponivel_centavos: true },
        where: { id: walletId },
      });
    },
    transaction(work) { return database.$transaction(work); },
    updateBankAccount(args) { return database.contaBancaria.update(args); },
    updateBankAccounts(args) { return database.contaBancaria.updateMany(args); },
    updateGatewayEvent(args) { return database.eventoGatewayPagamento.update(args); },
    updatePayout(args) { return database.repassePix.update(args); },
    updatePayouts(args) { return database.repassePix.updateMany(args); },
    updateReceivable(args) { return database.recebivel.update(args); },
    upsertGatewayEvent(args) { return database.eventoGatewayPagamento.upsert(args); },
  };
}

export const payoutRepository = createPayoutRepository();
