export function createOrderStockRepository(database) {
  return {
    claimStockRelease(orderId) {
      return database.pedidoLoja.updateMany({
        data: { estoque_liberado_em: new Date() },
        where: {
          estoque_liberado_em: null,
          estoque_reservado_em: { not: null },
          id: Number(orderId),
        },
      });
    },

    findOrderItems(orderId) {
      return database.pedidoLojaItem.findMany({
        select: { produto_id: true, quantidade: true },
        where: { pedido_id: Number(orderId), produto_id: { not: null } },
      });
    },

    findProduct(productId) {
      return database.produtoLoja.findUnique({
        select: {
          excluido_em: true,
          estoque_controlado: true,
          estoque_quantidade: true,
          status: true,
        },
        where: { id: productId },
      });
    },

    releaseProductStock(productId, quantity) {
      return database.produtoLoja.updateMany({
        data: { estoque_quantidade: { increment: quantity } },
        where: { estoque_controlado: true, id: productId },
      });
    },

    reserveProductStock(productId, quantity) {
      return database.produtoLoja.updateMany({
        data: { estoque_quantidade: { decrement: quantity } },
        where: {
          estoque_controlado: true,
          estoque_quantidade: { gte: quantity },
          excluido_em: null,
          id: productId,
          status: "ATIVO",
        },
      });
    },
  };
}
