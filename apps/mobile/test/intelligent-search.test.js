import assert from "node:assert/strict";
import test from "node:test";
import { matchesSearchText, serviceSearchScore, isServiceSearch } from "../src/utils/search.js";
import { resolveSearchVariants, searchTokens } from "shared/search";

test("search handles omissions, adjacent swaps, replacements, accents and incomplete words", () => {
  for (const [query, label] of [
    ["srvico", "Serviço"], ["hagurg", "Hambúrguer artesanal"], ["hambuger", "Hambúrguer"],
    ["eletrisista", "Eletricista"], ["eletric", "Eletricista"], ["frnago", "Frango"],
    ["piza", "Pizza"], ["celualr", "Celular"], ["acai", "Açaí"],
    ["burger", "Hambúrguer"], ["moto taxi", "Mototáxi"], ["moto boy", "Motoboy"],
  ]) assert.equal(matchesSearchText(label, query), true, `${query} => ${label}`);
  assert.equal(isServiceSearch("srvico"), true);
  assert.equal(isServiceSearch("serviços"), true);
  assert.equal(matchesSearchText("Eletricista", "srvico eletrisista"), true);
});

test("all meaningful words are required; unrelated, numeric and transport intents stay distinct", () => {
  assert.equal(matchesSearchText("Pizza de frango", "piza frnago"), true);
  for (const [query, label] of [["pizza frango", "Pizza de queijo"], ["taxi", "Motoboy"],
    ["mototxi", "Motoboy"], ["motoboi", "Mototáxi"], ["iphone 12", "iPhone 13"],
    ["zzzzzzz", "Hambúrguer"], ["pa", "Pizza"], ["", "Produto"]]) {
    assert.equal(matchesSearchText(label, query), false, `${query} != ${label}`);
  }
});

test("exact results rank first, corrections remain bounded and use real catalog words", () => {
  assert.ok(serviceSearchScore({ name: "Eletricista" }, "eletricista")
    < serviceSearchScore({ name: "Elétrica" }, "eletricista"));
  const variants = resolveSearchVariants("piza frnago", ["Pizza", "Frango", "Farmácia", "Queijo"]);
  assert.ok(variants.includes("pizza frango"));
  assert.ok(variants.length <= 6);
  assert.deepEqual(resolveSearchVariants("zzzzzzz", ["Pizza", "Hambúrguer"]), ["zzzzzzz"]);
  assert.deepEqual(resolveSearchVariants("pizza", ["Pizza", "Pista"]), ["pizza"]);
  assert.ok(searchTokens("quero uma pizza de frango").includes("frango"));
});
