function toValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatarHora(value) {
  const date = toValidDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatarDataHora(value, { incluirAno = false } = {}) {
  const date = toValidDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    ...(incluirAno ? { year: "numeric" } : {}),
  }).format(date);
}
