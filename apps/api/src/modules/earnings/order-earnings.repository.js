import { prisma } from "../../config/prisma.js";

export function createOrderEarningsRepository(database = prisma) {
  return {
    createFinancialEvent(args) { return database.eventoFinanceiro.create(args); },
    createPlatformEntry(args) { return database.lancamentoPlataforma.create(args); },
    createReceivable(args) { return database.recebivel.create(args); },
    createReward(args) { return database.recompensa.create(args); },
    createWalletEntry(args) { return database.lancamentoCarteira.create(args); },
    findCharge(args) { return database.cobranca.findUnique(args); },
    findSystemConfiguration(args) { return database.configuracaoSistema.findUnique(args); },
    findCommercialTransaction(args) { return database.transacaoComercial.findUnique(args); },
    findIndication(args) { return database.indicacao.findUnique(args); },
    findOrder(args) { return database.pedidoLoja.findUnique(args); },
    findPlatformAccount(args) { return database.contaPlataforma.findUnique(args); },
    findUser(args) { return database.usuario.findUnique(args); },
    findWallet(args) { return database.carteira.findUnique(args); },
    findWalletEntries(args) { return database.lancamentoCarteira.findMany(args); },
    updateCommercialTransaction(args) { return database.transacaoComercial.update(args); },
    updateCommercialTransactions(args) { return database.transacaoComercial.updateMany(args); },
    updateIndications(args) { return database.indicacao.updateMany(args); },
    updatePlatformAccount(args) { return database.contaPlataforma.update(args); },
    updatePlatformAccounts(args) { return database.contaPlataforma.updateMany(args); },
    updatePlatformEntries(args) { return database.lancamentoPlataforma.updateMany(args); },
    updateReceivables(args) { return database.recebivel.updateMany(args); },
    updateRewards(args) { return database.recompensa.updateMany(args); },
    updateWallets(args) { return database.carteira.updateMany(args); },
    updateWalletEntry(args) { return database.lancamentoCarteira.update(args); },
    upsertCommercialTransaction(args) { return database.transacaoComercial.upsert(args); },
    upsertPlatformAccount(args) { return database.contaPlataforma.upsert(args); },
    upsertSystemConfiguration(args) { return database.configuracaoSistema.upsert(args); },
  };
}
