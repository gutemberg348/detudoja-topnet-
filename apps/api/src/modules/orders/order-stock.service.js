import { AppError } from "../../utils/errors.js";
import { createOrderStockRepository } from "./order-stock.repository.js";

export async function reserveOrderStock(database, items) {
  const repository = createOrderStockRepository(database);

  for (const item of items) {
    const product = await repository.findProduct(item.productId);

    if (product?.status !== "ATIVO" || product.excluido_em) {
      throw new AppError("Um ou mais produtos nao estao disponiveis", 409);
    }

    if (!product.estoque_controlado) {
      continue;
    }

    const reserved = await repository.reserveProductStock(
      item.productId,
      item.quantity,
    );

    if (reserved.count !== 1) {
      throw new AppError("Estoque insuficiente para um ou mais produtos", 409);
    }
  }
}

export async function releaseReservedOrderStock(database, orderId) {
  const repository = createOrderStockRepository(database);
  const released = await repository.claimStockRelease(orderId);

  if (released.count !== 1) {
    return false;
  }

  const items = await repository.findOrderItems(orderId);

  for (const item of items) {
    await repository.releaseProductStock(item.produto_id, item.quantidade);
  }

  return true;
}
