import assert from "node:assert/strict";
import test from "node:test";
import { marketplaceRepository } from "../src/modules/marketplace/marketplace.repository.js";
import { listMarketplaceSuggestions } from "../src/modules/marketplace/marketplace.service.js";

test("moto taxi encontra os servicos relacionados e prioriza Mototaxi", async () => {
  const original = {
    getBaseAddress: marketplaceRepository.getBaseAddress,
    listSuggestions: marketplaceRepository.listSuggestions,
    querySearchMatches: marketplaceRepository.querySearchMatches,
  };
  let searchedPatterns;
  try {
    marketplaceRepository.getBaseAddress = async () => ({ city: "Patos", state: "PB" });
    marketplaceRepository.querySearchMatches = async (patterns, servicePatterns) => {
      searchedPatterns = { patterns, servicePatterns };
      return { categoryIds: [], productIds: [], serviceTypeIds: [1, 2], storeIds: [] };
    };
    marketplaceRepository.listSuggestions = async () => ({
      categories: [],
      products: [],
      serviceTypes: [
        { id: 1, nome: "Motoboy", icone: "bicycle" },
        { id: 2, nome: "Mototaxi", icone: "navigate" },
      ],
      stores: [],
    });

    const response = await listMarketplaceSuggestions(1, { search: "moto táxi" });
    assert.deepEqual(response.suggestions.map((suggestion) => suggestion.label), ["Mototaxi", "Motoboy"]);
    assert.ok(searchedPatterns.patterns.includes("%moto taxi%"));
    assert.ok(searchedPatterns.servicePatterns.includes("%mototaxi%"));
    assert.ok(searchedPatterns.servicePatterns.includes("%motoboy%"));
  } finally {
    Object.assign(marketplaceRepository, original);
  }
});
