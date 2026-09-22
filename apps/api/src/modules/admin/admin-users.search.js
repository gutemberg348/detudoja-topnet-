// Numeric identifiers are searched only when the entire query looks numeric.
// Extracting digits from an email/name would also match unrelated CPF/phones.
export function userSearchConditions(value, operator = "contains") {
  const search = String(value ?? "").trim();
  if (!search) return [];
  const digits = search.replace(/\D/g, "");
  const numeric = digits.length > 0 && /^[\d\s()+.\-/]+$/.test(search);
  return [
    { nome: { [operator]: search, mode: "insensitive" } },
    { email: { [operator]: search, mode: "insensitive" } },
    ...(numeric ? [
      { telefone: { [operator]: digits } },
      { cpf: { [operator]: digits } },
    ] : []),
  ];
}
