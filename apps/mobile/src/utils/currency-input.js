// Keep whole reais while typing: entering 10 must continue to mean R$ 10,00.
export function normalizeCurrencyInput(value = "") {
  const cleaned = String(value).replace(/[^\d.,]/g, "");
  if (!cleaned) return "";
  if (!cleaned.includes(",") && /^\d{1,3}(\.\d{3})+$/.test(cleaned)) return cleaned.replace(/\./g, "");
  const decimal = cleaned.includes(",") ? "," : ".";
  const [whole, ...fractions] = cleaned.split(decimal);
  const integer = whole.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!fractions.length) return integer;
  const cents = fractions.join("").replace(/\D/g, "").slice(0, 2);
  return `${integer || "0"},${cents}`;
}

export function formatCurrencyInput(value = "") {
  const normalized = normalizeCurrencyInput(value);
  if (!normalized) return "";
  const [whole, cents = ""] = normalized.split(",");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents.padEnd(2, "0")}`;
}
