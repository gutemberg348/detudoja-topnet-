import { AppError } from "./errors.js";

export function normalizeLocation(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

export function sameCity(first, second) {
  if (!first || !second) {
    return false;
  }

  return (
    normalizeLocation(first.cidade ?? first.city)
      === normalizeLocation(second.cidade ?? second.city)
    && String(first.estado ?? first.state ?? "").trim().toUpperCase()
      === String(second.estado ?? second.state ?? "").trim().toUpperCase()
  );
}

export function addressData(address) {
  return {
    bairro: address.district,
    cep: String(address.zipCode ?? "").replace(/\D/g, ""),
    cidade: address.city.trim(),
    complemento: address.complement?.trim() || null,
    estado: address.state.trim().toUpperCase(),
    numero: address.number.trim(),
    referencia: address.reference?.trim() || null,
    rua: address.street.trim(),
  };
}

export async function getUserBaseAddress(database, userId) {
  return database.enderecoUsuario.findFirst({
    orderBy: [{ principal: "desc" }, { criado_em: "asc" }],
    where: { excluido_em: null, usuario_id: userId },
  });
}

export async function requireUserBaseAddress(database, userId) {
  const address = await getUserBaseAddress(database, userId);

  if (!address) {
    throw new AppError(
      "Complete seu CEP e endereco no perfil antes de usar o comercio da sua cidade",
      428,
    );
  }

  return address;
}

export function cityAddressWhere(address, { userAddress = false } = {}) {
  return {
    cidade: { equals: address.cidade, mode: "insensitive" },
    estado: String(address.estado).trim().toUpperCase(),
    ...(userAddress ? { excluido_em: null } : {}),
  };
}
