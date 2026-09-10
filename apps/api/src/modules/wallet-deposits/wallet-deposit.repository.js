import { prisma } from "../../config/prisma.js";

export function createWalletDepositRepository(database = prisma) {
  return {
    createDepositPayment(data) {
      return database.pagamento.create({
        data,
        include: {
          deposito_carteira: { include: { carteira: { include: { tipo_carteira: true } } } },
        },
      });
    },
    findDeposit(args) { return database.depositoCarteira.findUnique(args); },
    findFirstDeposit(args) { return database.depositoCarteira.findFirst(args); },
    transaction(work) { return database.$transaction(work); },
    updateDeposit(args) { return database.depositoCarteira.update(args); },
    updateDeposits(args) { return database.depositoCarteira.updateMany(args); },
    updatePayment(args) { return database.pagamento.update(args); },
    updatePayments(args) { return database.pagamento.updateMany(args); },
    updatePaymentCompositions(args) { return database.pagamentoComposicao.updateMany(args); },
  };
}

export const walletDepositRepository = createWalletDepositRepository();
