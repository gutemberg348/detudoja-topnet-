import assert from "node:assert/strict";
import test from "node:test";
import { safeMultipagAuthDiagnostics } from "../scripts/sicredi-multipag-smoke.js";

test("Multipag refusal shows provider description while hiding credentials and tokens", () => {
  const privateValue = "fake-secret+/%";
  const data = safeMultipagAuthDiagnostics({
    error: "invalid_client",
    error_description: `Invalid client ${privateValue} ${encodeURIComponent(privateValue)} fake-token`,
    access_token: "fake-token",
    unrelated: "must-not-print",
  }, [privateValue]);
  assert.equal(data.error, "invalid_client");
  assert.match(data.errorDescription, /Invalid client/);
  assert.doesNotMatch(JSON.stringify(data), /fake-secret|fake-token|must-not-print/);
  assert.equal(data.errorDescription.split("[oculto]").length - 1, 3);
});

test("Multipag diagnostics redact before truncation and handle unexpected fields", () => {
  const secret = "x".repeat(610);
  const data = safeMultipagAuthDiagnostics({ error_description: `Denied ${secret}\nagain` }, [secret]);
  assert.equal(data.errorDescription, "Denied [oculto] again");
  assert.equal(safeMultipagAuthDiagnostics({ error_description: { nested: "ignored" } }).errorDescription, null);
  assert.equal(safeMultipagAuthDiagnostics({ error_description: "a".repeat(700) }).errorDescription.length, 600);
});
