import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createNotificationsRepository } from "../src/modules/notifications/notifications.repository.js";
import { createNotificationsService } from "../src/modules/notifications/notifications.queue.js";
import { createPushDeliveryService } from "../src/modules/notifications/push-delivery.service.js";

test("persistent push queue survives worker restart, concurrent claims and account changes", { skip: !process.env.PUSH_DATABASE_TEST_URL }, async () => {
  const url = new URL(process.env.PUSH_DATABASE_TEST_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/push_validation", "Use only an isolated push_validation database");
  const database = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const userIds = [];
  let offset = 0;
  const now = () => new Date(Date.now() + offset);
  try {
    for (let index = 0; index < 2; index++) {
      const user = await database.usuario.create({ data: { nome: "Push validation", email: `${randomUUID()}@test.invalid`, senha_hash: "test-only-hash" } });
      userIds.push(user.id);
    }
    const repository = createNotificationsRepository(database);
    const token = `ExpoPushToken[${randomUUID()}]`;
    await repository.upsertPushToken(token, { plataforma: "ios", usuario_id: userIds[0] });
    const service = createNotificationsService({ repository, enabled: () => true, wake: () => {}, now });
    assert.equal((await service.sendTestPush(userIds[0], token)).queued, 1);
    const claims = await Promise.all([repository.claimDuePushJobs(now()), repository.claimDuePushJobs(now())]);
    assert.equal(claims.flat().length, 1);
    const claimed = claims.flat()[0];
    // Simulate the first worker disappearing while it held a lease.
    await database.notificacaoPush.update({ where: { id: claimed.id }, data: { bloqueado_ate: new Date(Date.now() - 1) } });
    const requests = [];
    const delivery = createPushDeliveryService({ repository, accessToken: () => "", now, fetcher: async (address) => {
      requests.push(address);
      return { ok: true, json: async () => ({ data: address.endsWith("/send") ? [{ status: "ok", id: "integration-ticket" }] : { "integration-ticket": { status: "ok" } } }) };
    } });
    assert.equal((await delivery.processPushQueue()).accepted, 1);
    assert.equal((await database.notificacaoPush.findUnique({ where: { id: claimed.id } })).status, "AGUARDANDO_RECIBO");
    offset = 15 * 60_000 + 1000;
    assert.equal((await delivery.processPushQueue()).confirmed, 1);
    assert.equal(requests.filter(address => address.endsWith("/send")).length, 1);
    assert.equal((await repository.pushStatus(userIds[0])).lastDelivery.status, "CONFIRMADA");

    await service.sendTestPush(userIds[0], token);
    await repository.upsertPushToken(token, { plataforma: "ios", usuario_id: userIds[1] });
    assert.equal((await delivery.processPushQueue()).cancelled, 1);
    assert.equal(requests.length, 2, "The former account's notification must not reach the new account");
    assert.equal((await service.sendExpoPushToUsers({ userIds: [userIds[0]], title: "Old account" })).queued, 0);
    await assert.rejects(service.sendTestPush(userIds[0], token), error => error.statusCode === 409);
    await repository.removeUserPushToken(userIds[0], token);
    assert.equal(await database.dispositivoPush.count({ where: { token } }), 1, "An old logout cannot unregister the new owner");
    await repository.removeUserPushToken(userIds[1], token);
    assert.equal(await database.notificacaoPush.count({ where: { destinatario_usuario_id: { in: userIds } } }), 0, "Logout removes pending jobs through the device relation");
  } finally {
    await database.usuario.deleteMany({ where: { id: { in: userIds } } });
    await database.$disconnect();
  }
});
