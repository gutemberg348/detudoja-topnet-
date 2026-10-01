import { prisma } from "../../config/prisma.js";
import { emitServiceChatUpdated } from "../../realtime/socket.server.js";

export async function notifyOrderCouriers(orderId) {
  const rides = await prisma.conversaServico.findMany({
    select: {
      cliente_usuario_id: true,
      id: true,
      vendedor: { select: { usuario_id: true } },
    },
    where: { pedido_loja_id: orderId },
  });
  for (const ride of rides) {
    emitServiceChatUpdated({
      conversationId: ride.id,
      customerUserId: ride.cliente_usuario_id,
      reason: "order-status-updated",
      sellerUserId: ride.vendedor.usuario_id,
    });
  }
}
