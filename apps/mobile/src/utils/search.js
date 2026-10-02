export function normalizeSearchText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function getSearchTerms(value = "", { includeWords = true } = {}) {
  const normalized = normalizeSearchText(value);

  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ").filter(Boolean);
  const singular = words.map(singularizeSearchWord).join(" ");
  const terms = new Set([normalized, singular]);

  if (/\b(?:moto taxi|mototaxi|taxi|taxista)\b/.test(normalized)) {
    terms.add("mototaxi");
    terms.add("moto taxi");
    // Passenger transport must not advertise parcel delivery as the same service.
    return [...terms];
  }
  if (/\bmoto boy\b/.test(normalized)) {
    terms.add("motoboy");
    return [...terms];
  }

  if (includeWords && words.length > 1) {
    words
      .filter((word) => word.length >= 3 && !searchStopWords.has(word))
      .forEach((word) => {
        terms.add(word);
        terms.add(singularizeSearchWord(word));
      });
  }

  return [...terms].filter((term) => term.length >= 2);
}

export function matchesSearchText(value, search) {
  const normalizedValue = normalizeSearchText(value);

  return getSearchTerms(search).some((term) => normalizedValue.includes(term));
}

export function serviceSearchScore(service, search) {
  const label = normalizeSearchText(service.name);
  const description = normalizeSearchText(service.description);
  const query = normalizeSearchText(search);
  if (label === query || label.replaceAll(" ", "") === query.replaceAll(" ", "")) return 0;
  if (label.startsWith(query)) return 1;
  if (label.includes(query)) return 2;
  if (description.includes(query)) return 3;
  if (getSearchTerms(query).some((term) => label.includes(term))) return 4;
  return 5;
}

const searchStopWords = new Set([
  "a", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "na",
  "nas", "no", "nos", "o", "os", "para", "por", "loja", "lojas",
  "produto", "produtos", "servico", "servicos",
]);

function singularizeSearchWord(word) {
  if (word.length <= 3 || !word.endsWith("s")) {
    return word;
  }

  if (word.endsWith("oes")) {
    return `${word.slice(0, -3)}ao`;
  }

  if (word.endsWith("aes")) {
    return `${word.slice(0, -3)}ao`;
  }

  if (word.endsWith("ais")) {
    return `${word.slice(0, -3)}al`;
  }

  if (word.endsWith("eis")) {
    return `${word.slice(0, -3)}el`;
  }

  if (word.endsWith("is")) {
    return `${word.slice(0, -2)}il`;
  }

  return word.slice(0, -1);
}
