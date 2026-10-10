import assert from "node:assert/strict";
import test from "node:test";
import { formatCurrencyInput, normalizeCurrencyInput } from "../src/utils/currency-input.js";
import { parseMoneyToCents } from "../src/app/sell/seller.utils.js";

test("valor em reais conserva a escala ao digitar, formatar e enviar", () => {
  for (const [input, display, cents] of [["10", "10,00", 1000], ["49,9", "49,90", 4990],
    ["10.50", "10,50", 1050], ["R$ 1.234,56", "1.234,56", 123456], ["1.234", "1.234,00", 123400], ["0,01", "0,01", 1]]) {
    assert.equal(formatCurrencyInput(input), display);
    assert.equal(parseMoneyToCents(formatCurrencyInput(input)), cents);
    assert.equal(formatCurrencyInput(normalizeCurrencyInput(display)), display);
  }
  assert.equal(formatCurrencyInput(""), "");
  assert.equal(normalizeCurrencyInput("10,"), "10,");
});
