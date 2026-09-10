export function normalizeCnpj(value = "") {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function calculateDigit(base) {
  let weight = base.length - 7;
  let total = 0;

  for (const character of base) {
    total += (character.charCodeAt(0) - 48) * weight;
    weight -= 1;
    if (weight < 2) weight = 9;
  }

  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value = "") {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) {
    return false;
  }

  const firstDigit = calculateDigit(cnpj.slice(0, 12));
  const secondDigit = calculateDigit(`${cnpj.slice(0, 12)}${firstDigit}`);
  return cnpj.endsWith(`${firstDigit}${secondDigit}`);
}
