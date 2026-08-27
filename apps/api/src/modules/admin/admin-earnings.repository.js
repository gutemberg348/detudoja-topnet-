import { prisma } from "../../config/prisma.js";
import {
  getOrderEarningsDistribution,
  updateOrderEarningsDistribution,
} from "../earnings/order-earnings.config.js";

const categoryInclude = { _count: { select: { lojas: true } } };
const segmentInclude = {
  _count: { select: { vendedores: true, vendas_autonomas: true } },
};

export const adminEarningsRepository = {
  findCategory(id) {
    return prisma.categoriaLoja.findFirst({
      select: { id: true },
      where: { excluido_em: null, id },
    });
  },

  findSegment(id) {
    return prisma.segmentoVenda.findFirst({
      select: { id: true },
      where: { excluido_em: null, id },
    });
  },

  getDistribution() {
    return getOrderEarningsDistribution(prisma);
  },

  listCategories() {
    return prisma.categoriaLoja.findMany({
      include: categoryInclude,
      orderBy: { nome: "asc" },
      where: { excluido_em: null },
    });
  },

  listSegments() {
    return prisma.segmentoVenda.findMany({
      include: segmentInclude,
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      where: { excluido_em: null },
    });
  },

  updateCategoryFee(id, feePercent) {
    return prisma.categoriaLoja.update({
      data: {
        taxa_plataforma_atualizada_em: new Date(),
        taxa_plataforma_percentual: feePercent,
      },
      include: categoryInclude,
      where: { id },
    });
  },

  updateDistribution(adminId, data) {
    return updateOrderEarningsDistribution(prisma, adminId, data);
  },

  updateSegmentFee(id, data) {
    return prisma.segmentoVenda.update({
      data: {
        percentual_cashback: data.cashbackPercent,
        percentual_indicacao_consumidor: data.consumerReferralPercent,
        percentual_indicacao_vendedor: data.sellerReferralPercent,
        percentual_rede: data.networkPercent,
        taxa_plataforma_atualizada_em: new Date(),
        taxa_plataforma_percentual: data.feePercent,
      },
      include: segmentInclude,
      where: { id },
    });
  },
};
