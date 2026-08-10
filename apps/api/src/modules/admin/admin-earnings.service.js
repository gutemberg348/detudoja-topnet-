import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import {
  getOrderEarningsDistribution,
  getSegmentCommissionDistribution,
  updateOrderEarningsDistribution,
} from "../earnings/order-earnings.config.js";
import {
  serializeCategory,
  serializeSalesSegment,
} from "./admin.serializer.js";

const categoryInclude = { _count: { select: { lojas: true } } };
const segmentInclude = {
  _count: { select: { vendedores: true, vendas_autonomas: true } },
};

export async function getAdminEarningsSettings() {
  const [categories, segments, distribution] = await Promise.all([
    prisma.categoriaLoja.findMany({
      include: categoryInclude,
      orderBy: { nome: "asc" },
      where: { excluido_em: null },
    }),
    prisma.segmentoVenda.findMany({
      include: segmentInclude,
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      where: { excluido_em: null },
    }),
    getOrderEarningsDistribution(prisma),
  ]);

  return {
    categories: categories.map(serializeCategory),
    distribution: distribution.public,
    segments: segments.map((segment) => ({
      ...serializeSalesSegment(segment),
      commission: getSegmentCommissionDistribution(segment, distribution),
    })),
  };
}

export async function updateAdminOrderEarningsDistribution(adminId, data) {
  return {
    distribution: await updateOrderEarningsDistribution(prisma, adminId, data),
  };
}

export async function updateAdminCategoryFee(categoryId, data) {
  const parsedCategoryId = parsePositiveId(categoryId, "Categoria invalida");
  const existing = await prisma.categoriaLoja.findFirst({
    select: { id: true },
    where: { excluido_em: null, id: parsedCategoryId },
  });

  if (!existing) {
    throw new AppError("Categoria nao encontrada", 404);
  }

  const category = await prisma.categoriaLoja.update({
    data: {
      taxa_plataforma_atualizada_em: new Date(),
      taxa_plataforma_percentual: data.feePercent,
    },
    include: categoryInclude,
    where: { id: parsedCategoryId },
  });

  return { category: serializeCategory(category) };
}

export async function updateAdminSegmentFee(segmentId, data) {
  const parsedSegmentId = parsePositiveId(segmentId, "Segmento invalido");
  const existing = await prisma.segmentoVenda.findFirst({
    select: { id: true },
    where: { excluido_em: null, id: parsedSegmentId },
  });

  if (!existing) {
    throw new AppError("Segmento nao encontrado", 404);
  }

  const segment = await prisma.segmentoVenda.update({
    data: {
      percentual_cashback: data.cashbackPercent,
      percentual_indicacao_consumidor: data.consumerReferralPercent,
      percentual_indicacao_vendedor: data.sellerReferralPercent,
      percentual_rede: data.networkPercent,
      taxa_plataforma_atualizada_em: new Date(),
      taxa_plataforma_percentual: data.feePercent,
    },
    include: segmentInclude,
    where: { id: parsedSegmentId },
  });

  const distribution = await getOrderEarningsDistribution(prisma);

  return {
    segment: {
      ...serializeSalesSegment(segment),
      commission: getSegmentCommissionDistribution(segment, distribution),
    },
  };
}
