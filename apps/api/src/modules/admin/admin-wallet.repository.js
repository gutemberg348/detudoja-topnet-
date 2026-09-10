import { prisma } from "../../config/prisma.js";

export const adminWalletRepository = {
  aggregateWallets() {
    return prisma.carteira.groupBy({
      _count: { _all: true },
      _sum: {
        saldo_bloqueado_centavos: true,
        saldo_disponivel_centavos: true,
        saldo_pendente_centavos: true,
      },
      by: ["tipo_carteira_id"],
    });
  },

  findType(id) {
    return prisma.tipoCarteira.findUnique({ where: { id } });
  },

  listTypes() {
    return prisma.tipoCarteira.findMany({ orderBy: { id: "asc" } });
  },

  updateType(id, data) {
    return prisma.tipoCarteira.update({ data, where: { id } });
  },
};
