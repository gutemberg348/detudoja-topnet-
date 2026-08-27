import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import {
  getSegmentCommissionDistribution,
} from "../earnings/order-earnings.config.js";
import {
  serializeCategory,
  serializeSalesSegment,
} from "./admin.serializer.js";
import { adminEarningsRepository } from "./admin-earnings.repository.js";

export async function getAdminEarningsSettings() {
  const [categories, segments, distribution] = await Promise.all([
    adminEarningsRepository.listCategories(),
    adminEarningsRepository.listSegments(),
    adminEarningsRepository.getDistribution(),
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
    distribution: await adminEarningsRepository.updateDistribution(adminId, data),
  };
}

export async function updateAdminCategoryFee(categoryId, data) {
  const parsedCategoryId = parsePositiveId(categoryId, "Categoria invalida");
  const existing = await adminEarningsRepository.findCategory(parsedCategoryId);

  if (!existing) {
    throw new AppError("Categoria nao encontrada", 404);
  }

  const category = await adminEarningsRepository.updateCategoryFee(
    parsedCategoryId,
    data.feePercent,
  );

  return { category: serializeCategory(category) };
}

export async function updateAdminSegmentFee(segmentId, data) {
  const parsedSegmentId = parsePositiveId(segmentId, "Segmento invalido");
  const existing = await adminEarningsRepository.findSegment(parsedSegmentId);

  if (!existing) {
    throw new AppError("Segmento nao encontrado", 404);
  }

  const segment = await adminEarningsRepository.updateSegmentFee(
    parsedSegmentId,
    data,
  );

  const distribution = await adminEarningsRepository.getDistribution();

  return {
    segment: {
      ...serializeSalesSegment(segment),
      commission: getSegmentCommissionDistribution(segment, distribution),
    },
  };
}
