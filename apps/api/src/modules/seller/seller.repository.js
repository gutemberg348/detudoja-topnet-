import { prisma } from "../../config/prisma.js";
import { requireUserCpf } from "../../utils/cpf-required.js";
import { requireUserBaseAddress } from "../../utils/location.js";
import { requireCommercialTier2 } from "../../utils/commercial-access.js";

export function createSellerRepository(database = prisma) {
  return {
    createAutonomousSale(args) { return database.vendaAutonoma.create(args); },
    createOrderMessage(args) { return database.pedidoLojaMensagem.create(args); },
    createProduct(args) { return database.produtoLoja.create(args); },
    createProposal(args) { return database.propostaPedidoLoja.create(args); },
    createStore(args) { return database.loja.create(args); },
    createStoreMember(args) { return database.usuarioLoja.create(args); },
    deleteProduct(args) { return database.produtoLoja.delete(args); },
    findCategories(args) { return database.categoriaLoja.findMany(args); },
    findFirstMerchant(args) { return database.lojista.findFirst(args); },
    findFirstOrder(args) { return database.pedidoLoja.findFirst(args); },
    findFirstProduct(args) { return database.produtoLoja.findFirst(args); },
    findFirstSeller(args) { return database.vendedor.findFirst(args); },
    findMerchantByDocument(field, value, userId) {
      return database.lojista.findFirst({
        select: { id: true },
        where: { [field]: value, usuario_id: { not: userId } },
      });
    },
    findSellerByDocument(field, value, userId) {
      return database.vendedor.findFirst({
        select: { id: true },
        where: { [field]: value, usuario_id: { not: userId } },
      });
    },
    findFirstSegment(args) { return database.segmentoVenda.findFirst(args); },
    findFirstStore(args) { return database.loja.findFirst(args); },
    findOrderMessages(args) { return database.pedidoLojaMensagem.findMany(args); },
    findSales(args) { return database.vendaAutonoma.findMany(args); },
    findSegments(args) { return database.segmentoVenda.findMany(args); },
    findStoreMemberships(args) { return database.usuarioLoja.findMany(args); },
    findUniqueOrder(args) { return database.pedidoLoja.findUnique(args); },
    findUniqueUser(args) { return database.usuario.findUnique(args); },
    getUserBaseAddress(userId) { return requireUserBaseAddress(database, userId); },
    requireCommercialTier2(userId) { return requireCommercialTier2(database, userId); },
    requireUserCpf(userId) { return requireUserCpf(database, userId); },
    transaction(work) { return database.$transaction(work); },
    updateOrder(args) { return database.pedidoLoja.update(args); },
    updateOrders(args) { return database.pedidoLoja.updateMany(args); },
    updateOrderMessages(args) { return database.pedidoLojaMensagem.updateMany(args); },
    updateProduct(args) { return database.produtoLoja.update(args); },
    updateProducts(args) { return database.produtoLoja.updateMany(args); },
    updateProposals(args) { return database.propostaPedidoLoja.updateMany(args); },
    updateStore(args) { return database.loja.update(args); },
    updateStoreMembers(args) { return database.usuarioLoja.updateMany(args); },
    upsertMerchant(args) { return database.lojista.upsert(args); },
    upsertSeller(args) { return database.vendedor.upsert(args); },
  };
}

export const sellerRepository = createSellerRepository();
