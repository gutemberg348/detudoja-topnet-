import { prisma } from "../../config/prisma.js";

export function createWithdrawalRepository(database = prisma) {
  return {
    createPlatformEntry(args) { return database.lancamentoPlataforma.create(args); },
    createWalletEntry(args) { return database.lancamentoCarteira.create(args); },
    createWithdrawal(args) { return database.saque.create(args); },
    findBankAccount(args) { return database.contaBancaria.findFirst(args); },
    findPlatformAccount(args) { return database.contaPlataforma.findUnique(args); },
    findUser(args) { return database.usuario.findUnique(args); },
    findWallet(args) { return database.carteira.findFirst(args); },
    listWallets(args) { return database.carteira.findMany(args); },
    findWithdrawal(args) { return database.saque.findFirst(args); },
    findWithdrawalUnique(args) { return database.saque.findUnique(args); },
    listWithdrawals(args) { return database.saque.findMany(args); },
    sumWithdrawals(args) { return database.saque.aggregate(args); },
    transaction(work) { return database.$transaction(work); },
    updatePlatformAccount(args) { return database.contaPlataforma.update(args); },
    updateWallets(args) { return database.carteira.updateMany(args); },
    updateWithdrawal(args) { return database.saque.update(args); },
    updateWithdrawals(args) { return database.saque.updateMany(args); },
    upsertGatewayEvent(args) { return database.eventoGatewayPagamento.upsert(args); },
    upsertPlatformAccount(args) { return database.contaPlataforma.upsert(args); },
    updateGatewayEvent(args) { return database.eventoGatewayPagamento.update(args); },
  };
}

export const withdrawalRepository = createWithdrawalRepository();
