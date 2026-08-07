export function normalizeCpf(value = "") {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value = "") {
  const cpf = normalizeCpf(value);

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  for (let digitIndex = 9; digitIndex < 11; digitIndex += 1) {
    let sum = 0;

    for (let index = 0; index < digitIndex; index += 1) {
      sum += Number(cpf[index]) * (digitIndex + 1 - index);
    }

    const remainder = (sum * 10) % 11;
    const expectedDigit = remainder === 10 ? 0 : remainder;

    if (expectedDigit !== Number(cpf[digitIndex])) {
      return false;
    }
  }

  return true;
}
