import { prisma } from "../../config/prisma.js";
import { requireUserCpf } from "../../utils/cpf-required.js";

export function createOrdersRepository(database = prisma) {
  return {
    countUserAddresses(args) {
      return database.enderecoUsuario.count(args);
    },
    createOrder(args) {
      return database.pedidoLoja.create(args);
    },
    createOrderMessage(args) {
      return database.pedidoLojaMensagem.create(args);
    },
    createPayment(args) {
      return database.pagamento.create(args);
    },
    createPaymentComposition(args) {
      return database.pagamentoComposicao.create(args);
    },
    createUserAddress(args) {
      return database.enderecoUsuario.create(args);
    },
    findAddress(args) {
      return database.enderecoUsuario.findFirst(args);
    },
    findFirstOrder(args) {
      return database.pedidoLoja.findFirst(args);
    },
    findFirstProposal(args) {
      return database.propostaPedidoLoja.findFirst(args);
    },
    findManyOrderMessages(args) {
      return database.pedidoLojaMensagem.findMany(args);
    },
    findManyOrders(args) {
      return database.pedidoLoja.findMany(args);
    },
    findStore(args) {
      return database.loja.findFirst(args);
    },
    findUniqueOrder(args) {
      return database.pedidoLoja.findUnique(args);
    },
    findUniqueProposal(args) {
      return database.propostaPedidoLoja.findUnique(args);
    },
    lockOrder(orderId) {
      return database.$queryRaw`SELECT pg_advisory_xact_lock(71428, ${orderId}::int)::text AS lock_result`;
    },
    requireUserCpf(userId) { return requireUserCpf(database, userId); },
    transaction(work) {
      return database.$transaction(work);
    },
    updateAddresses(args) {
      return database.enderecoUsuario.updateMany(args);
    },
    updateUserAddress(args) {
      return database.enderecoUsuario.update(args);
    },
    updateOrder(args) {
      return database.pedidoLoja.update(args);
    },
    updateOrderMessages(args) {
      return database.pedidoLojaMensagem.updateMany(args);
    },
    updatePayment(args) {
      return database.pagamento.updateMany(args);
    },
    updateProposal(args) {
      return database.propostaPedidoLoja.update(args);
    },
    updateProposals(args) {
      return database.propostaPedidoLoja.updateMany(args);
    },
  };
}

export const ordersRepository = createOrdersRepository();
