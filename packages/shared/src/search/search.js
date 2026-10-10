// Pure search policy shared by API and mobile: no network, catalog or UI state.
export function normalizeSearchText(value = "") {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

const stopWords = new Set("a as com da das de do dos e em na nas no nos o os para por um uma quero preciso encontrar buscar".split(" "));
const genericWords = new Set(["loja", "lojas", "produto", "produtos", "servico", "servicos"]);
// Semantic aliases, not a growing list of spelling mistakes.
const aliases = new Map([
  ["taxi", "mototaxi"], ["taxista", "mototaxi"],
  ["hamburger", "hamburguer"], ["burger", "hamburguer"],
]);

export function singularizeSearchWord(word) {
  if (word.length <= 3 || !word.endsWith("s")) return word;
  if (/oes$|aes$/.test(word)) return `${word.slice(0, -3)}ao`;
  if (word.endsWith("ais")) return `${word.slice(0, -3)}al`;
  if (word.endsWith("eis")) return `${word.slice(0, -3)}el`;
  if (word.endsWith("is")) return `${word.slice(0, -2)}il`;
  return word.slice(0, -1);
}

export function searchTokens(value, { maxLength = 120, maxTokens = 8 } = {}) {
  const normalized = normalizeSearchText(value).slice(0, maxLength)
    .replace(/\bmoto taxi\b/g, "mototaxi").replace(/\bmoto boy\b/g, "motoboy");
  let words = normalized.split(" ").filter((word) => word && !stopWords.has(word));
  if (words.length > 1) words = words.map((word) => searchWordScore("servico", word) >= 0.8 ? "servico" : word);
  if (words.some((word) => !genericWords.has(word))) words = words.filter((word) => !genericWords.has(word));
  return [...new Set(words.map((word) => aliases.get(word) ?? word))].slice(0, maxTokens);
}

export function getSearchTerms(value, { includeWords = true } = {}) {
  const normalized = normalizeSearchText(value);
  const tokens = searchTokens(value);
  const terms = [normalized, tokens.join(" "), tokens.map(singularizeSearchWord).join(" ")];
  if (includeWords) terms.push(...tokens);
  return [...new Set(terms.filter((term) => term.length >= 2))];
}

// Optimal string alignment: insertion, omission, replacement and adjacent swap.
export function editDistance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= right.length; j++) rows[0][j] = j;
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[left.length][right.length];
}

export function searchWordScore(candidate, query) {
  if (candidate === query) return 1;
  if (/\d/.test(query) || /\d/.test(candidate)) return 0;
  if (singularizeSearchWord(candidate) === singularizeSearchWord(query)) return 0.98;
  if (query.length >= 2 && candidate.startsWith(query)) return 0.94;
  if (query.length < 4 || candidate.length < 4) return 0;
  if ((query.startsWith("motot") && candidate === "motoboy")
    || (query.startsWith("motob") && candidate === "mototaxi")) return 0;
  const maximumEdits = query.length < 5 ? 1 : 2;
  let score = 0;
  const compare = (text, penalty = 0) => {
    if (Math.abs(text.length - query.length) > maximumEdits) return;
    const distance = editDistance(text, query);
    if (distance <= maximumEdits) score = Math.max(score, 1 - distance / Math.max(text.length, query.length) - penalty);
  };
  compare(candidate);
  if (query.length >= 5 && candidate[0] === query[0]) {
    for (let size = query.length; size <= Math.min(candidate.length - 1, query.length + 2); size++) {
      compare(candidate.slice(0, size), 0.04);
    }
  }
  return score >= 0.67 ? score : 0;
}

export function searchTextScore(value, search) {
  const query = searchTokens(search);
  const words = searchTokens(value, { maxLength: 2000, maxTokens: 128 });
  if (!query.length) return 0;
  if (normalizeSearchText(value) === normalizeSearchText(search)) return 1;
  const scores = query.map((term) => Math.max(0, ...words.map((word) => searchWordScore(word, term))));
  // Every meaningful token must match: pizza frango cannot match only pizza.
  return scores.every(Boolean) ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
}

export function matchesSearchText(value, search) {
  return searchTextScore(value, search) > 0;
}

export function serviceSearchScore(service, search) {
  return 1 - Math.max(searchTextScore(service.name, search), searchTextScore(service.description, search) * 0.8);
}

export function isServiceSearch(value) {
  const terms = searchTokens(value);
  return terms.length === 1 && searchWordScore("servico", terms[0]) >= 0.8;
}

// Bounded expansion keeps multiword queries predictable. Original input is retained.
export function resolveSearchVariants(search, labels = []) {
  const tokens = searchTokens(search);
  const vocabulary = [...new Set(labels.flatMap((label) => searchTokens(label, { maxLength: 300, maxTokens: 32 })))];
  let beam = [{ words: [], score: 1 }];
  for (const token of tokens) {
    const candidates = vocabulary.map((word) => ({ word, score: searchWordScore(word, token) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
    const alternatives = candidates.some((item) => item.score >= 0.94)
      ? [{ word: token, score: 1 }]
      : [...candidates.slice(0, 2), { word: token, score: 0.5 }];
    beam = beam.flatMap((entry) => alternatives.map((item) => ({ words: [...entry.words, item.word], score: entry.score * item.score })))
      .sort((a, b) => b.score - a.score).slice(0, 6);
  }
  return beam.map((entry) => entry.words.join(" ")).filter(Boolean);
}
