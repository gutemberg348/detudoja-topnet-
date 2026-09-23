import { prisma } from "../../config/prisma.js";

const refundablePaymentStatuses = ["PAGO", "LIQUIDADO"];

export function createOrderTimeoutRepository(database = prisma) {
  return {
    findAsaasRefundsAwaitingConfirmation() {
      return database.pagamento.findMany({
        select: { id: true, pedido_loja: { select: { id: true } } },
        take: 10,
        where: {
          gateway: "ASAAS",
          pedido_loja: { is: { status: "CANCELADO" } },
          status: "EM_DISPUTA",
        },
      });
    },

    findUnattendedPaidOrders(cutoff) {
      return database.pedidoLoja.findMany({
        select: {
          id: true,
          loja_id: true,
          pagamento_id: true,
          usuario_id: true,
        },
        take: 25,
        where: {
          aceito_em: null,
          pagamento: {
            is: {
              pago_em: { lte: cutoff },
              status: { in: refundablePaymentStatuses },
            },
          },
          status: "RECEBIDO",
        },
      });
    },
  };
}

export const orderTimeoutRepository = createOrderTimeoutRepository();
