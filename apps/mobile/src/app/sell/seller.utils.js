import { formatarDinheiro } from "../../utils/money";
import { activeOrderStatuses, productTimeUnits, statusCopy } from "./seller.constants";

export function countNewStoreOrders(store, newOrderStatuses) {
  return (store?.orders ?? []).filter((order) => {
    if (Number(order.unreadStoreMessages ?? 0) > 0) {
      return true;
    }

    if (!newOrderStatuses.has(order.status)) {
      return false;
    }

    if (order.status !== "NEGOCIANDO") {
      return true;
    }

    const latestProposal = order.latestProposal ?? order.proposals?.at(-1);

    return latestProposal?.status !== "PENDENTE";
  }).length;
}

export function formatCnpj(value = "") {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function formatPhone(value = "") {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d+)/, "($1) $2");
  if (digits.length <= 10) return digits.replace(/^(\d{2})(\d{4})(\d+)/, "($1) $2-$3");

  return digits.replace(/^(\d{2})(\d{5})(\d+)/, "($1) $2-$3");
}

export function formatCep(value = "") {
  const digits = String(value).replace(/\D/g, "").slice(0, 8);
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function formatStatus(value = "") {
  return statusCopy[value] ?? value.replaceAll("_", " ").toLowerCase();
}

export function formatOrderStatus(value = "") {
  return statusCopy[value] ?? formatStatus(value);
}

export function parseMoneyToCents(value = "") {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/-/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function centsToInput(value) {
  return (Number(value ?? 0) / 100).toFixed(2).replace(".", ",");
}

export function parseEstimatedTimeToMinutes(form) {
  const value = Number(String(form.estimatedTimeValue ?? "").replace(",", "."));
  const unit = productTimeUnits.find((item) => item.value === form.estimatedTimeUnit);

  if (!Number.isFinite(value) || value <= 0 || !unit) return undefined;
  return Math.max(1, Math.round(value * unit.multiplier));
}

export function splitEstimatedTime(minutes) {
  const safeMinutes = Number(minutes ?? 0);
  if (!Number.isFinite(safeMinutes) || safeMinutes <= 0) return { unit: "MINUTES", value: "" };
  if (safeMinutes % 1440 === 0) return { unit: "DAYS", value: String(safeMinutes / 1440) };
  if (safeMinutes % 60 === 0) return { unit: "HOURS", value: String(safeMinutes / 60) };
  return { unit: "MINUTES", value: String(safeMinutes) };
}

export function formatEstimatedTime(minutes) {
  const safeMinutes = Number(minutes ?? 0);
  if (!Number.isFinite(safeMinutes) || safeMinutes <= 0) return "Prazo nao informado";
  if (safeMinutes < 60) return `${safeMinutes} min`;
  if (safeMinutes < 1440) {
    return `${String(Math.round((safeMinutes / 60) * 10) / 10).replace(".", ",")} h`;
  }
  const days = Math.round((safeMinutes / 1440) * 10) / 10;
  return `${String(days).replace(".", ",")} dia${days > 1 ? "s" : ""}`;
}

export function inferOperationalOrderStatus(order) {
  if (order.deliveryMode === "RETIRADA" && order.readyForPickupAt) return "PRONTO_RETIRADA";
  if (order.shippedAt) return "SAIU_ENTREGA";
  if (order.preparingAt) return "PREPARANDO";
  if (order.acceptedAt) return "ACEITO";
  return "RECEBIDO";
}

export function isOrderInPeriod(order, period) {
  if (period === "all") return true;
  const reference = new Date(order.updatedAt ?? order.createdAt ?? Date.now());
  const now = new Date();
  if (period === "today") return reference.toDateString() === now.toDateString();
  if (period === "week") {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    return reference >= sevenDaysAgo;
  }
  return true;
}

export function countActiveOrdersInPeriod(orders = [], period) {
  return orders.filter(
    (order) => activeOrderStatuses.has(order.status) && isOrderInPeriod(order, period),
  ).length;
}

export function compactOrderCode(value = "") {
  if (!value) return "#pedido";
  const suffix = String(value).split("-").at(-1);
  return suffix ? `#${suffix}` : value;
}

export function formatOrderDateTime(value) {
  if (!value) return "Agora";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

export function orderAddressText(order) {
  if (!order.address) return "Retirada na loja";
  return `${order.address.rua}, ${order.address.numero} - ${order.address.bairro}`;
}

export function normalizeSellerOrderMessage(message) {
  const author = message.author === "customer"
    ? "customer"
    : message.author === "system"
      ? "system"
      : "store";

  return {
    author,
    id: message.id,
    text: message.text,
    time: message.time ?? message.createdAt,
    title: message.title ?? (author === "customer" ? "Cliente" : author === "system" ? "Atualizacao" : "Loja"),
  };
}

export function appendUniqueSellerMessage(messages, nextMessage) {
  if (!nextMessage || messages.some((message) => message.id === nextMessage.id)) return messages;
  return [...messages, nextMessage];
}

export function buildSellerOrderMessages(order, options = {}) {
  const itemsText = (order.items ?? [])
    .map((item) => `${item.quantity}x ${item.name} (${formatarDinheiro(item.totalCents)})`)
    .join("\n");
  const messages = [
    {
      author: "system",
      id: "order-created",
      text: `Pedido ${compactOrderCode(order.code)} criado.\n${itemsText || "Sem itens listados"}\nTotal: ${formatarDinheiro(order.totalCents)}.`,
      time: order.createdAt,
      title: "Solicitacao recebida",
    },
    {
      author: "system",
      id: "order-delivery",
      text: `${order.deliveryMode === "RETIRADA" ? "Retirada" : "Entrega"}: ${orderAddressText(order)}.\n${order.payment ? `Pagamento: ${order.payment.method} - ${formatOrderStatus(order.payment.status)}.` : "Pagamento: aguardando proposta e confirmacao do cliente."}`,
      time: order.createdAt,
      title: "Resumo",
    },
  ];

  if (order.notes) {
    messages.push({ author: "customer", id: "order-notes", text: order.notes, time: order.createdAt, title: "Observacao do cliente" });
  }
  if (options.includeStatus === false) return messages;

  [
    ["acceptedAt", "Pedido aceito pela loja."],
    ["preparingAt", "Pedido enviado para preparo."],
    ["readyForPickupAt", "Pedido marcado como pronto para retirada."],
    ["shippedAt", "Pedido saiu para entrega."],
    ["completedAt", "Pedido concluido."],
    ["canceledAt", "Pedido cancelado."],
  ].forEach(([field, text]) => {
    if (order[field]) messages.push({ author: "system", id: field, text, time: order[field], title: "Atualizacao" });
  });

  return messages;
}
