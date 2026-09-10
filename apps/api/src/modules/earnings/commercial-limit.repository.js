export function createCommercialLimitRepository(database) {
  return {
    findPayment(paymentId) {
      return database.pagamento.findUnique({
        select: {
          id: true,
          loja_id: true,
          valor_total_centavos: true,
          vendedor_id: true,
        },
        where: { id: Number(paymentId) },
      });
    },

    findSeller(sellerId) {
      return database.vendedor.findUnique({ where: { id: Number(sellerId) } });
    },

    findStore(storeId) {
      return database.loja.findUnique({
        include: { lojista: true },
        where: { id: Number(storeId) },
      });
    },

    lockCommercialEntity(lockId) {
      return database.$queryRaw`SELECT pg_advisory_xact_lock(71431, ${lockId}::int)::text AS lock_result`;
    },

    sumPaidSince(paymentWhere, paidStatuses, startDate) {
      return database.pagamento.aggregate({
        _sum: { valor_total_centavos: true },
        where: {
          AND: [
            paymentWhere,
            {
              OR: [
                {
                  pago_em: { gte: startDate },
                  status: { in: paidStatuses },
                },
                {
                  criado_em: { gte: startDate },
                  status: "AGUARDANDO_PAGAMENTO",
                },
              ],
            },
          ],
        },
      });
    },
  };
}
