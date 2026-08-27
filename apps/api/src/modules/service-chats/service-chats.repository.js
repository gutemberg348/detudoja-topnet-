import { prisma } from "../../config/prisma.js";
import { requireUserBaseAddress } from "../../utils/location.js";

export function createServiceChatsRepository(database = prisma) {
  return {
    createConversation(args) { return database.conversaServico.create(args); },
    createMessage(args) { return database.conversaServicoMensagem.create(args); },
    createProposal(args) { return database.propostaServico.create(args); },
    findConversation(args) { return database.conversaServico.findFirst(args); },
    findConversations(args) { return database.conversaServico.findMany(args); },
    findProposal(args) { return database.propostaServico.findUnique(args); },
    findSeller(args) { return database.vendedor.findFirst(args); },
    findSellerService(args) { return database.servicoVendedor.findFirst(args); },
    findSellerServices(args) { return database.servicoVendedor.findMany(args); },
    findServiceType(args) { return database.tipoServico.findFirst(args); },
    findServiceTypes(args) { return database.tipoServico.findMany(args); },
    findStore(args) { return database.loja.findFirst(args); },
    getUserBaseAddress(userId) { return requireUserBaseAddress(database, userId); },
    transaction(work) { return database.$transaction(work); },
    updateCharges(args) { return database.cobranca.updateMany(args); },
    updateConversation(args) { return database.conversaServico.update(args); },
    updateCourierRequests(args) { return database.solicitacaoMotoboy.updateMany(args); },
    updateMessages(args) { return database.conversaServicoMensagem.updateMany(args); },
    updateProposals(args) { return database.propostaServico.updateMany(args); },
    updateSeller(args) { return database.vendedor.update(args); },
    upsertSellerService(args) { return database.servicoVendedor.upsert(args); },
  };
}

export const serviceChatsRepository = createServiceChatsRepository();
