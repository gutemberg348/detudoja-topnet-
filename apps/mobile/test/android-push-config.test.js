import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { androidPushConfig } from "../scripts/android-push-config.cjs";

test("configuracao Android detecta ausencia, pacote incorreto e arquivo de conta de servico", () => {
  const dir = mkdtempSync(join(tmpdir(), "detudoja-push-config-test-"));
  const file = join(dir, "google-services.json");
  assert.deepEqual(androidPushConfig(dir, "com.detudoja.mobile"), { configured: false });
  assert.throws(() => androidPushConfig(dir, "com.detudoja.mobile", "missing.json"), /inexistente/);
  writeFileSync(file, JSON.stringify({ type: "service_account" }));
  assert.throws(() => androidPushConfig(dir, "com.detudoja.mobile"), /Nao use a chave privada/);
  writeFileSync(file, JSON.stringify({ project_info: { project_number: "test", project_id: "test" },
    client: [{ client_info: { android_client_info: { package_name: "com.detudoja.mobile" }, mobilesdk_app_id: "test" }, api_key: [{ current_key: "fixture-not-a-real-key" }] }] }));
  assert.throws(() => androidPushConfig(dir, "other.package"), /other.package/);
  assert.deepEqual(androidPushConfig(dir, "com.detudoja.mobile"), { configured: true, file });
  assert.deepEqual(androidPushConfig(dir, "com.detudoja.mobile", file), { configured: true, file });
});
