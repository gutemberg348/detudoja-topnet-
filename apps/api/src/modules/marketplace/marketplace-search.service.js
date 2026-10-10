import { getSearchTerms, isServiceSearch, normalizeSearchText, resolveSearchVariants, searchTokens, singularizeSearchWord } from "shared/search";
import { createCacheKey, getOrSetJsonCache } from "../cache/cache.service.js";
import { marketplaceSearchRepository } from "./marketplace-search.repository.js";
import { normalizeLocation } from "../../utils/location.js";
import { marketplaceRepository } from "./marketplace.repository.js";

const matchingInFlight = new Map();

export async function resolveMarketplaceSearch(search, address) {
  const normalized = normalizeSearchText(search).slice(0, 120);
  const labels = await marketplaceSearchRepository.candidateLabels(searchTokens(normalized), address);
  const variants = [...new Set([normalized, ...resolveSearchVariants(normalized, labels)])];
  const patterns = /[0-9]/.test(normalized) ? []
    : [...new Set(variants.flatMap((value) => getSearchTerms(value, { includeWords: false })))].map((term) => `%${term}%`);
  return { patterns, variants, serviceIntent: isServiceSearch(normalized) };
}

async function loadMarketplaceSearchMatches(search, address) {
  const normalizedSearch = normalizeSearchText(search);
  const plan = await resolveMarketplaceSearch(normalizedSearch, address);
  const patterns = plan.patterns;
  const servicePatterns = plan.serviceIntent ? ["%"] : buildServiceSearchPatterns(normalizedSearch, patterns);
  const tokenGroups = plan.variants.map((variant) => searchTokens(variant).map(singularizeSearchWord)).filter((tokens) => tokens.length);
  const matches = await marketplaceRepository.querySearchMatches(patterns, servicePatterns, tokenGroups, address);
  return { ...matches, searchInfo: {
    query: normalizedSearch,
    suggestedTerms: plan.variants.filter((variant) => variant !== normalizedSearch).slice(0, 3),
    serviceIntent: plan.serviceIntent,
  } };
}

export function buildServiceSearchPatterns(search, patterns) {
  const aliases = /\b(?:moto taxi|mototaxi|taxi|taxista)\b/.test(search)
    ? ["mototaxi", "moto taxi", "taxi", "taxista"]
    : /\bmoto boy\b/.test(search)
      ? ["motoboy"]
      : [];
  // Do not reintroduce the isolated word "moto" from the broad fallback search.
  return aliases.length
    ? aliases.map((alias) => `%${alias}%`)
    : patterns;
}


export async function findMarketplaceSearchMatches(search, address) {
  if (normalizeSearchText(search).length < 2) {
    return { categoryIds: [], productIds: [], serviceTypeIds: [], storeIds: [],
      searchInfo: { query: normalizeSearchText(search), suggestedTerms: [], serviceIntent: false } };
  }
  const key = createCacheKey("marketplace-search-result-v2", {
    query: normalizeSearchText(search), city: normalizeLocation(address.cidade ?? address.city), state: String(address.estado ?? address.state).trim().toUpperCase(),
  });
  if (matchingInFlight.has(key)) return matchingInFlight.get(key);
  const pending = getOrSetJsonCache({ key, ttlSeconds: 45, load: () => loadMarketplaceSearchMatches(search, address) });
  matchingInFlight.set(key, pending);
  try { return await pending; } finally { matchingInFlight.delete(key); }
}
