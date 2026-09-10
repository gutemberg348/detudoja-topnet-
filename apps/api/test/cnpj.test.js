import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidCnpj, normalizeCnpj } from "../src/utils/cnpj.js";

test("valida CNPJ numerico pelos digitos verificadores", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11.222.333/0001-80"), false);
  assert.equal(isValidCnpj("11.111.111/1111-11"), false);
});

test("aceita o novo CNPJ alfanumerico oficial", () => {
  assert.equal(normalizeCnpj("00.000.000/E08G-12"), "00000000E08G12");
  assert.equal(isValidCnpj("00.000.000/E08G-12"), true);
  assert.equal(isValidCnpj("00.000.000/E08G-13"), false);
});
