import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../src/config/env.js";
import { isServiceAvailable } from "../src/modules/service-chats/service-availability.js";

test("service availability expires when the provider stops sending heartbeats", () => {
  const now = new Date("2026-09-04T15:00:00.000Z");
  const fresh = {
    disponivel_agora: true,
    disponibilidade_atualizada_em: new Date(now.getTime() - 30_000),
  };
  const expired = {
    disponivel_agora: true,
    disponibilidade_atualizada_em: new Date(
      now.getTime() - ((env.serviceAvailability.heartbeatTimeoutSeconds + 1) * 1_000),
    ),
  };

  assert.equal(isServiceAvailable(fresh, now), true);
  assert.equal(isServiceAvailable(expired, now), false);
  assert.equal(isServiceAvailable({ disponivel_agora: false }, now), false);
});
