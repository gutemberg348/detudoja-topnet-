import assert from "node:assert/strict";
import test from "node:test";
import { marketplaceRepository } from "../src/modules/marketplace/marketplace.repository.js";
import { buildServiceSearchPatterns, listMarketplaceSuggestions } from "../src/modules/marketplace/marketplace.service.js";

test("moto taxi procura passageiros sem incluir motoboy de entregas", async () => {
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
        { id: 2, nome: "Mototaxi", icone: "navigate" },
      ],
      stores: [],
    });

    const response = await listMarketplaceSuggestions(1, { search: "moto táxi" });
    assert.deepEqual(response.suggestions.map((suggestion) => suggestion.label), ["Mototaxi"]);
    assert.ok(searchedPatterns.patterns.includes("%moto taxi%"));
    assert.ok(searchedPatterns.servicePatterns.includes("%mototaxi%"));
    assert.equal(searchedPatterns.servicePatterns.includes("%motoboy%"), false);
  } finally {
    Object.assign(marketplaceRepository, original);
  }
});

test("fallback de palavras nao mistura modalidades de transporte", () => {
  assert.equal(buildServiceSearchPatterns("moto taxi", ["%moto%", "%taxi%"]).includes("%moto%"), false);
  assert.deepEqual(buildServiceSearchPatterns("moto boy", ["%moto%", "%boy%"]), ["%motoboy%"]);
  assert.deepEqual(buildServiceSearchPatterns("eletricista", ["%eletricista%"]), ["%eletricista%"]);
});
