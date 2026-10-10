import assert from "node:assert/strict";
import test from "node:test";
import { marketplaceRepository } from "../src/modules/marketplace/marketplace.repository.js";
import { marketplaceSearchRepository } from "../src/modules/marketplace/marketplace-search.repository.js";
import { findMarketplaceSearchMatches } from "../src/modules/marketplace/marketplace-search.service.js";

test("concurrent catalog reads share a search, city scopes stay separate and failures can retry", async () => {
  const originalCandidates = marketplaceSearchRepository.candidateLabels;
  const originalQuery = marketplaceRepository.querySearchMatches;
  let candidates = 0, queries = 0, fail = false;
  const address = { cidade: "Patos", estado: "PB" };
  try {
    marketplaceSearchRepository.candidateLabels = async () => {
      candidates++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (fail) throw new Error("Temporary failure");
      return ["Hambúrguer"];
    };
    marketplaceRepository.querySearchMatches = async (patterns, servicePatterns, groups, location) => {
      queries++;
      assert.ok(patterns.includes("%hamburguer%"));
      return { productIds: [location.cidade === "Patos" ? 1 : 2], storeIds: [], categoryIds: [], serviceTypeIds: [] };
    };
    const results = await Promise.all(Array.from({ length: 3 }, () => findMarketplaceSearchMatches("hagurg", address)));
    assert.equal(candidates, 1);
    assert.equal(queries, 1);
    assert.deepEqual(results[0].searchInfo.suggestedTerms, ["hamburguer"]);
    const other = await findMarketplaceSearchMatches("hagurg", { ...address, cidade: "Sousa" });
    assert.deepEqual(other.productIds, [2]);
    fail = true;
    await assert.rejects(findMarketplaceSearchMatches("hambuger", address), /Temporary failure/);
    fail = false;
    assert.deepEqual((await findMarketplaceSearchMatches("hambuger", address)).productIds, [1]);
  } finally {
    marketplaceSearchRepository.candidateLabels = originalCandidates;
    marketplaceRepository.querySearchMatches = originalQuery;
  }
});
