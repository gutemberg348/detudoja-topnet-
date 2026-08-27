import { prisma } from "../src/config/prisma.js";
import { settleCompletedStoreOrderEarnings } from "../src/modules/earnings/order-earnings.service.js";

const apply = process.argv.includes("--apply");
const confirmedStatuses = ["PAGO", "LIQUIDADO"];

async function reconcile() {
  const orders = await prisma.pedidoLoja.findMany({
    include: {
      pagamento: { select: { id: true, status: true } },
    },
    orderBy: { id: "asc" },
    where: {
      status: "CONCLUIDO",
      OR: [
        { pagamento: null },
        { pagamento: { transacao_comercial: null } },
      ],
    },
  });
  const eligible = orders.filter((order) => confirmedStatuses.includes(order.pagamento?.status));
  const manualReview = orders.filter((order) => !confirmedStatuses.includes(order.pagamento?.status));

  console.log(`Pedidos concluidos sem liquidacao: ${orders.length}`);
  console.log(`Elegiveis para liquidar: ${eligible.length}`);
  console.log(`Revisao manual obrigatoria: ${manualReview.length}`);

  if (eligible.length > 0) {
    console.log(`Elegiveis: ${eligible.map((order) => `${order.id}/${order.codigo}`).join(", ")}`);
  }
  if (manualReview.length > 0) {
    console.log(
      `Sem pagamento confirmado: ${manualReview
        .map((order) => `${order.id}/${order.codigo}/${order.pagamento?.status ?? "SEM_PAGAMENTO"}`)
        .join(", ")}`,
    );
  }

  if (!apply) {
    console.log("Modo leitura: nenhum ganho foi criado. Use --apply somente apos revisar a lista elegivel.");
    return;
  }

  for (const order of eligible) {
    const result = await prisma.$transaction((database) =>
      settleCompletedStoreOrderEarnings(database, order.id),
    );
    console.log(`Liquidado pedido ${order.id}/${order.codigo}: transacao ${result.transactionId}.`);
  }
}

try {
  await reconcile();
} finally {
  await prisma.$disconnect();
}
