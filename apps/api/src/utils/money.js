export function cents(value) {
  return Math.round(Number(value) * 100);
}

export function formatMoney(valueCents = 0) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(Number(valueCents) / 100);
}
