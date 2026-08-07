export function formatarDinheiro(valorCentavos = 0) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(Number(valorCentavos) / 100);
}
