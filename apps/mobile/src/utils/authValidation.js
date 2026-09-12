const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function onlyDigits(value = "") {
  return value.replace(/\D/g, "");
}

export function formatCpf(value = "") {
  const digits = onlyDigits(value).slice(0, 11);

  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatCep(value = "") {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function isValidCpf(value = "") {
  const cpf = onlyDigits(value);

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

export function formatPhone(value = "") {
  const digits = onlyDigits(value).slice(0, 11);

  if (!digits) {
    return "";
  }

  if (digits.length < 3) {
    return `(${digits}`;
  }

  const areaCode = digits.slice(0, 2);
  const number = digits.slice(2);
  const splitAt = digits.length === 11 ? 5 : 4;
  const firstPart = number.slice(0, splitAt);
  const secondPart = number.slice(splitAt);

  return `(${areaCode}) ${firstPart}${secondPart ? `-${secondPart}` : ""}`;
}

export function formatLogin(value = "") {
  if (/[a-z@]/i.test(value)) {
    const atIndex = value.indexOf("@");

    if (atIndex > -1) {
      const localPart = value.slice(0, atIndex).replace(/[()\s-]/g, "");
      return `${localPart}${value.slice(atIndex)}`.slice(0, 255);
    }

    return value.replace(/\s/g, "").slice(0, 255);
  }

  return formatPhone(value);
}

export function isValidEmail(value = "") {
  return emailPattern.test(value.trim().toLowerCase());
}

export function isValidPhone(value = "") {
  const digits = onlyDigits(value);
  return /^[1-9]{2}\d{8,9}$/.test(digits);
}

export function normalizeLogin(value = "") {
  return isValidPhone(value)
    ? onlyDigits(value)
    : value.trim().toLowerCase();
}

export function validateLoginFields({ login, password }) {
  const errors = {};

  if (!login.trim()) {
    errors.login = "Informe seu e-mail ou telefone.";
  } else if (!isValidEmail(login) && !isValidPhone(login)) {
    errors.login = "Digite um e-mail ou telefone valido.";
  }

  if (!password) {
    errors.password = "Informe sua senha.";
  }

  return errors;
}

export function validateRegistrationFields({ email, name, password, phone }) {
  const errors = {};

  if (name.trim().length < 3) {
    errors.name = "Informe seu nome completo.";
  }

  if (phone.trim() && !isValidPhone(phone)) {
    errors.phone = "Digite um telefone com DDD.";
  }

  if (!isValidEmail(email)) {
    errors.email = "Digite um e-mail valido.";
  }

  if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
    errors.password = "Use 8 caracteres, com pelo menos uma letra e um numero.";
  }

  return errors;
}
