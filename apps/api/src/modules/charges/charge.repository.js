import { prisma } from "../../config/prisma.js";
import { requireUserCpf } from "../../utils/cpf-required.js";

export function createChargeRepository(database = prisma) {
  return {
    aggregateCharges(args) { return database.cobranca.aggregate(args); },
    createCharge(args) { return database.cobranca.create(args); },
    createPayment(args) { return database.pagamento.create(args); },
    createPaymentComposition(args) { return database.pagamentoComposicao.create(args); },
    createServiceMessage(args) { return database.conversaServicoMensagem.create(args); },
    findCharge(args) { return database.cobranca.findFirst(args); },
    findCharges(args) { return database.cobranca.findMany(args); },
    findSeller(args) { return database.vendedor.findUnique(args); },
    findStore(args) { return database.loja.findFirst(args); },
    findUniqueCharge(args) { return database.cobranca.findUnique(args); },
    findWallets(args) { return database.carteira.findMany(args); },
    requireUserCpf(userId) { return requireUserCpf(database, userId); },
    transaction(work) { return database.$transaction(work); },
    updateAutonomousSale(args) { return database.vendaAutonoma.update(args); },
    updateCharge(args) { return database.cobranca.update(args); },
    updateCharges(args) { return database.cobranca.updateMany(args); },
    updateServiceConversation(args) { return database.conversaServico.update(args); },
    updateServiceProposal(args) { return database.propostaServico.update(args); },
  };
}

export const chargeRepository = createChargeRepository();
