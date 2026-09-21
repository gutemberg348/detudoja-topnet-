import { prisma } from "../../config/prisma.js";
import { requireUserBaseAddress } from "../../utils/location.js";
import { requireCommercialTier2 } from "../../utils/commercial-access.js";

export function createCourierRepository(database = prisma) {
  return {
    countCourierRequests(args) { return database.solicitacaoMotoboy.count(args); },
    countTeamMembers(args) { return database.motoboyLoja.count(args); },
    createCourierRequest(args) { return database.solicitacaoMotoboy.create(args); },
    createServiceConversation(args) { return database.conversaServico.create(args); },
    deleteTeamMember(args) { return database.motoboyLoja.delete(args); },
    findCourier(args) { return database.motoboy.findFirst(args); },
    findCourierRequest(args) { return database.solicitacaoMotoboy.findFirst(args); },
    findCourierRequestById(args) { return database.solicitacaoMotoboy.findUnique(args); },
    findCourierRequests(args) { return database.solicitacaoMotoboy.findMany(args); },
    findOrder(args) { return database.pedidoLoja.findFirst(args); },
    findSeller(args) { return database.vendedor.findFirst(args); },
    findSellerServices(args) { return database.servicoVendedor.findMany(args); },
    findServiceConversation(args) { return database.conversaServico.findFirst(args); },
    findServiceConversations(args) { return database.conversaServico.findMany(args); },
    findServiceTypes(args) { return database.tipoServico.findMany(args); },
    findStore(args) { return database.loja.findFirst(args); },
    findTeamMember(args) { return database.motoboyLoja.findFirst(args); },
    findTeamMemberById(args) { return database.motoboyLoja.findUnique(args); },
    findTeamMembers(args) { return database.motoboyLoja.findMany(args); },
    getUserBaseAddress(userId) { return requireUserBaseAddress(database, userId); },
    requireCommercialTier2(userId) { return requireCommercialTier2(database, userId); },
    lockCourier(courierId) {
      return database.$queryRaw`SELECT pg_advisory_xact_lock(71427, ${courierId}::int)::text AS lock_result`;
    },
    lockCustomerDispatch(userId) {
      return database.$queryRaw`SELECT pg_advisory_xact_lock(71429, ${userId}::int)::text AS lock_result`;
    },
    lockStoreDispatch(storeId) {
      return database.$queryRaw`SELECT pg_advisory_xact_lock(71428, ${storeId}::int)::text AS lock_result`;
    },
    transaction(work) { return database.$transaction(work); },
    updateCourier(args) { return database.motoboy.update(args); },
    updateCourierRequest(args) { return database.solicitacaoMotoboy.update(args); },
    updateCourierRequests(args) { return database.solicitacaoMotoboy.updateMany(args); },
    upsertCourier(args) { return database.motoboy.upsert(args); },
    upsertCourierRequestRejection(args) { return database.recusaSolicitacaoMotoboy.upsert(args); },
    upsertTeamMember(args) { return database.motoboyLoja.upsert(args); },
  };
}

export const courierRepository = createCourierRepository();
