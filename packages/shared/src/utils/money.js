export function formatCents(amountCents) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(amountCents / 100);
}
