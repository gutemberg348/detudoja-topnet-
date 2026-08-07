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
