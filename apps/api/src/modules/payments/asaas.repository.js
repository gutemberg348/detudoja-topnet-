import { prisma } from "../../config/prisma.js";

export function createAsaasRepository(database = prisma) {
  return {
    createGatewayEvent(args) { return database.eventoGatewayPagamento.create(args); },
    createOrderMessage(args) { return database.pedidoLojaMensagem.create(args); },
    findFirstOrder(args) { return database.pedidoLoja.findFirst(args); },
    findFirstPayment(args) { return database.pagamento.findFirst(args); },
    findPayment(args) { return database.pagamento.findUnique(args); },
    findUniqueOrder(args) { return database.pedidoLoja.findUnique(args); },
    findUser(args) { return database.usuario.findUnique(args); },
    transaction(work) { return database.$transaction(work); },
    updateGatewayEvent(args) { return database.eventoGatewayPagamento.update(args); },
    updateOrder(args) { return database.pedidoLoja.update(args); },
    updateOrders(args) { return database.pedidoLoja.updateMany(args); },
    updatePayment(args) { return database.pagamento.update(args); },
    updatePayments(args) { return database.pagamento.updateMany(args); },
    updatePaymentCompositions(args) { return database.pagamentoComposicao.updateMany(args); },
    updateProposals(args) { return database.propostaPedidoLoja.updateMany(args); },
    updateUser(args) { return database.usuario.update(args); },
  };
}

export const asaasRepository = createAsaasRepository();
