import { prisma } from "../../config/prisma.js";

const userInclude = {
  enderecos: {
    orderBy: [{ principal: "desc" }, { criado_em: "desc" }],
    where: { excluido_em: null },
  },
  kyc: true,
  lojista: true,
  vendedor: true,
};

export function createUsersRepository(database = prisma) {
  return {
    countVerifiedDirects(userId) {
      return database.indicacao.count({
        where: {
          indicador_usuario_id: userId,
          indicado: {
            status: "ATIVO",
            kyc: { is: { status: "APROVADO" } },
          },
        },
      });
    },

    createMainAddress(userId, data) {
      return database.enderecoUsuario.create({
        data: {
          ...data,
          nome_endereco: "Endereco principal",
          principal: true,
          usuario_id: userId,
        },
      });
    },

    findAddresses(userId) {
      return database.enderecoUsuario.findMany({
        orderBy: [{ principal: "desc" }, { criado_em: "desc" }],
        where: { excluido_em: null, usuario_id: userId },
      });
    },

    findCurrentAddress(userId) {
      return database.enderecoUsuario.findFirst({
        orderBy: [{ principal: "desc" }, { criado_em: "asc" }],
        where: { excluido_em: null, usuario_id: userId },
      });
    },

    findMarketplaceLocation(userId) {
      return database.usuario.findUnique({
        select: { cidade_busca: true, estado_busca: true },
        where: { id: userId },
      });
    },

    findUser(userId) {
      return database.usuario.findUnique({
        include: userInclude,
        where: { id: userId },
      });
    },

    transaction(work) {
      return database.$transaction(async (transaction) =>
        work(createUsersRepository(transaction)),
      );
    },

    updateAddress(addressId, data) {
      return database.enderecoUsuario.update({
        data: { ...data, principal: true },
        where: { id: addressId },
      });
    },

    updateUser(userId, data) {
      return database.usuario.update({ data, where: { id: userId } });
    },
  };
}

export const usersRepository = createUsersRepository();
