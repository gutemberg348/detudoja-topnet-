import assert from "node:assert/strict";
import test from "node:test";
import { matchesSearchText, serviceSearchScore } from "../src/utils/search.js";

test("busca de transporte entende taxi, mototaxi e moto taxi", () => {
  assert.equal(matchesSearchText("Mototaxi", "moto táxi"), true);
  assert.equal(matchesSearchText("Motoboy", "taxi"), false);
  assert.equal(matchesSearchText("Motoboy", "moto táxi"), false);
  assert.equal(matchesSearchText("Motoboy", "moto boy"), true);
  assert.equal(matchesSearchText("Mototaxi", "moto boy"), false);
  assert.equal(matchesSearchText("Pizzaria", "taxi"), false);
});

test("servico com nome correspondente vem antes do relacionado", () => {
  const mototaxi = { name: "Mototaxi", description: "Corridas de passageiros" };
  const motoboy = { name: "Motoboy", description: "Entregas locais" };
  assert.ok(serviceSearchScore(mototaxi, "moto taxi") < serviceSearchScore(motoboy, "moto taxi"));
  assert.ok(serviceSearchScore(mototaxi, "taxi") < serviceSearchScore(motoboy, "taxi"));
});
