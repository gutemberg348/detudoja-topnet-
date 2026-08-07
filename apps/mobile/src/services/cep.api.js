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
