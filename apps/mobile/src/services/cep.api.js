export async function fetchCepAddress(cep) {
  const digits = String(cep ?? "").replace(/\D/g, "").slice(0, 8);

  if (digits.length !== 8) {
    throw new Error("CEP invalido");
  }

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  const data = await response.json();

  if (!response.ok || data.erro) {
    throw new Error("CEP nao encontrado");
  }

  return {
    bairro: data.bairro ?? "",
    cep: data.cep ?? digits,
    cidade: data.localidade ?? "",
    estado: data.uf ?? "",
    rua: data.logradouro ?? "",
  };
}

export async function searchAddresses({ city, state, street }) {
  const normalizedState = String(state ?? "").trim().toUpperCase();
  const normalizedCity = String(city ?? "").trim();
  const normalizedStreet = String(street ?? "").trim();

  if (normalizedState.length !== 2 || normalizedCity.length < 3 || normalizedStreet.length < 3) {
    return [];
  }

  const path = [normalizedState, normalizedCity, normalizedStreet]
    .map((part) => encodeURIComponent(part))
    .join("/");
  const response = await fetch(`https://viacep.com.br/ws/${path}/json/`);

  if (!response.ok) {
    throw new Error("Nao foi possivel buscar enderecos");
  }

  const data = await response.json();
  if (!Array.isArray(data)) return [];

  return data.slice(0, 8).map((address) => ({
    city: address.localidade ?? normalizedCity,
    complement: address.complemento ?? "",
    district: address.bairro ?? "",
    state: address.uf ?? normalizedState,
    street: address.logradouro ?? "",
    zipCode: address.cep ?? "",
  }));
}
