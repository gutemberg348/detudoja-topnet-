import assert from "node:assert/strict";
import test from "node:test";
import { createNotificationsService } from "../src/modules/notifications/notifications.queue.js";
import { createPushDeliveryService } from "../src/modules/notifications/push-delivery.service.js";
import { createNotificationsRepository } from "../src/modules/notifications/notifications.repository.js";

const clock = new Date("2026-10-04T12:00:00Z");
function job(overrides = {}) { return { id: "job-1", dispositivo_id: 1, destinatario_usuario_id: 7, status: "PENDENTE", tentativas: 0, expira_em: new Date(clock.getTime() + 120_000), conteudo: { title: "Chamado", body: "Novo chamado", channelId: "courier-calls", data: { recipientUserId: 7 } }, ...overrides }; }
function harness({ jobs = [job()], devices = [{ id: 1, usuario_id: 7, plataforma: "android", token: "ExpoPushToken[test-token-123]" }], reply = { data: [{ status: "ok", id: "ticket-1" }] }, http = 200, networkError = false } = {}) {
  const updates = [], requests = [], disabled = [];
  const repository = {
    claimDuePushJobs: async () => jobs, findActivePushTokens: async () => devices,
    findActionableCallJobIds: async () => new Set(jobs.filter(item => !item.closedCall).map(item => item.id)),
    updatePushJob: async (item, data) => { updates.push({ id: item.id, ...data }); },
    deactivatePushTokens: async tokens => disabled.push(...tokens),
  };
  const service = createPushDeliveryService({ repository, now: () => clock, accessToken: () => "", fetcher: async (url, options) => {
    requests.push({ url, ...options, payload: JSON.parse(options.body) });
    if (networkError) throw new Error("secret network details");
    return { ok: http < 400, status: http, json: async () => reply };
  } });
  return { ...service, updates, requests, disabled };
}

test("push sends in a batch with expiry, sound and a stable duplicate identifier; tickets await receipts", async () => {
  const h = harness();
  const report = await h.processPushQueue();
  assert.equal(report.accepted, 1);
  assert.equal(report.confirmed, 0);
  assert.equal(h.requests[0].payload[0].priority, "high");
  assert.equal(h.requests[0].payload[0].collapseId, "job-1");
  assert.equal(h.requests[0].payload[0].tag, "job-1");
  assert.equal(h.requests[0].payload[0].expiration, Math.floor(job().expira_em.getTime() / 1000));
  assert.equal(h.updates[0].status, "AGUARDANDO_RECIBO");
  assert.equal(h.updates[0].proxima_tentativa_em.getTime(), clock.getTime() + 15 * 60_000);
});

test("service calls retain a compatible Android channel for old app installations", async () => {
  for (const [channels, expected] of [[[], "messages"], [["messages", "service-calls"], "service-calls"]]) {
    const h = harness({ jobs: [job({ conteudo: { channelId: "service-calls" } })], devices: [{ id: 1, usuario_id: 7, plataforma: "android", token: "phone", canais_notificacao: channels }] });
    await h.processPushQueue();
    assert.equal(h.requests[0].payload[0].channelId, expected);
  }
});

test("temporary network, throttling and server failures retain a scheduled retry", async () => {
  for (const options of [{ networkError: true }, { http: 429 }, { http: 500 }, { reply: null }, { reply: { data: [] } }]) {
    const h = harness(options);
    assert.equal((await h.processPushQueue()).retried, 1);
    assert.equal(h.updates[0].tentativas, 1);
    assert.equal(h.updates[0].proxima_tentativa_em.getTime(), clock.getTime() + 5_000);
    assert.equal(h.updates[0].status, undefined);
  }
});

test("expired calls, logged-out devices and devices moved to another account are never sent", async () => {
  for (const options of [{ jobs: [job({ expira_em: clock })] }, { devices: [] }, { devices: [{ id: 1, usuario_id: 9 }] }]) {
    const h = harness(options);
    await h.processPushQueue();
    assert.equal(h.requests.length, 0);
    assert.ok(["EXPIRADA", "CANCELADA"].includes(h.updates[0].status));
  }
});

test("permanent ticket failures are recorded and invalid devices are deactivated", async () => {
  for (const code of ["DeviceNotRegistered", "InvalidCredentials", "MessageTooBig"]) {
    const h = harness({ reply: { data: [{ status: "error", details: { error: code } }] } });
    assert.equal((await h.processPushQueue()).failed, 1);
    assert.equal(h.updates[0].ultimo_erro, code);
    assert.equal(h.disabled.length, code === "DeviceNotRegistered" ? 1 : 0);
  }
});

test("calls that were already accepted or cancelled are not delivered from the pending queue", async () => {
  const h = harness({ jobs: [job({ closedCall: true })] });
  assert.equal((await h.processPushQueue()).cancelled, 1);
  assert.equal(h.requests.length, 0);
});

test("receipts confirm the provider handoff without resending the notification", async () => {
  const h = harness({ jobs: [job({ status: "AGUARDANDO_RECIBO", ticket_id: "ticket-1" })], reply: { data: { "ticket-1": { status: "ok" } } } });
  assert.equal((await h.processPushQueue()).confirmed, 1);
  assert.ok(h.requests[0].url.endsWith("/getReceipts"));
  assert.deepEqual(h.requests[0].payload, { ids: ["ticket-1"] });
  assert.equal(h.updates[0].status, "CONFIRMADA");
});

test("missing receipts retry only receipt queries and stop at the attempt limit", async () => {
  for (const [attempts, expected] of [[0, "retried"], [9, "failed"]]) {
    const h = harness({ jobs: [job({ status: "AGUARDANDO_RECIBO", ticket_id: "ticket-1", tentativas: attempts, expira_em: clock })], reply: { data: {} } });
    assert.equal((await h.processPushQueue())[expected], 1);
    assert.ok(h.requests.every(request => request.url.endsWith("/getReceipts")));
    assert.equal(h.updates[0].ultimo_erro, "RECEIPT_PENDING");
  }
});

test("malformed receipt responses retry and credential failures are visible", async () => {
  const pending = job({ status: "AGUARDANDO_RECIBO", ticket_id: "ticket-1" });
  const malformed = harness({ jobs: [pending], reply: { data: null } });
  assert.equal((await malformed.processPushQueue()).retried, 1);
  const failed = harness({ jobs: [pending], reply: { data: { "ticket-1": { status: "error", details: { error: "InvalidCredentials" } } } } });
  assert.equal((await failed.processPushQueue()).failed, 1);
  assert.equal(failed.updates[0].ultimo_erro, "InvalidCredentials");
});

test("queued test notifications target only the requesting user's selected device", async () => {
  const records = [], lookups = [];
  const service = createNotificationsService({ enabled: () => true, now: () => clock, wake: () => {}, repository: {
    findActivePushTokens: async ids => { lookups.push(ids); return [{ id: 1, usuario_id: 7, token: "phone-a" }, { id: 2, usuario_id: 7, token: "phone-b" }]; },
    enqueuePushJobs: async data => records.push(...data),
  } });
  assert.equal((await service.sendTestPush(7, "phone-a")).queued, 1);
  assert.deepEqual(lookups[0], [7]);
  assert.equal(records[0].dispositivo_id, 1);
  assert.equal(records[0].conteudo.data.recipientUserId, 7);
  await assert.rejects(service.sendTestPush(7, "unknown"), error => error.statusCode === 409);
});

test("disabled push never sends and enqueue failures cannot break a committed chat action", async () => {
  const disabled = createNotificationsService({ enabled: () => false });
  assert.equal((await disabled.sendExpoPushToUsers({ userIds: [7] })).queued, 0);
  await assert.rejects(disabled.sendTestPush(7, "phone"), error => error.statusCode === 503);
  const failures = [];
  const service = createNotificationsService({ enabled: () => true, onError: (...args) => failures.push(args), repository: { findActivePushTokens: async () => { throw new Error("Database unavailable"); } } });
  assert.equal((await service.sendExpoPushToUsers({ userIds: [7] })).error, true);
  assert.equal(failures.length, 1);
});

test("only the worker that claims a row can process it; expired leases can be recovered", async () => {
  const claims = [];
  const stored = { ...job(), bloqueado_ate: null, proxima_tentativa_em: clock };
  const database = { notificacaoPush: {
    findMany: async () => [{ ...stored }],
    updateMany: async query => {
      claims.push(query);
      if (stored.bloqueado_ate && stored.bloqueado_ate > clock) return { count: 0 };
      stored.bloqueado_ate = query.data.bloqueado_ate;
      return { count: 1 };
    },
  } };
  const repository = createNotificationsRepository(database);
  const [first, second] = await Promise.all([repository.claimDuePushJobs(clock), repository.claimDuePushJobs(clock)]);
  assert.equal(first.length + second.length, 1);
  assert.equal(claims[0].where.tentativas, 0);
  stored.bloqueado_ate = new Date(clock.getTime() - 1);
  assert.equal((await repository.claimDuePushJobs(clock)).length, 1);
});
