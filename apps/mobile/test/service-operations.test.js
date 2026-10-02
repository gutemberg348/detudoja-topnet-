import assert from "node:assert/strict";
import test from "node:test";
import { serviceModalityDescription, serviceOperationSummary } from "../src/utils/service-operations.js";

test("um perfil de transporte conta como uma area, mesmo com duas modalidades", () => {
  const result = serviceOperationSummary([
    { id: 1, enabled: true, available: true, requiresCourierProfile: true },
    { id: 2, enabled: true, available: true, requiresCourierProfile: true },
    { id: 3, enabled: true, available: false, operationalType: "GERAL" },
  ]);
  assert.equal(result.count, 2);
  assert.equal(result.onlineCount, 1);
  assert.equal(result.registered.length, 3);
});

test("ficar online so considera atividades cadastradas, nunca todo o catalogo", () => {
  const result = serviceOperationSummary([
    { id: 1, enabled: true, available: false, requiresCourierProfile: true },
    { id: 2, enabled: false, available: false, requiresCourierProfile: true },
    { id: 3, enabled: false, available: true },
  ]);
  assert.deepEqual(result.registered.map((service) => service.id), [1]);
  assert.equal(result.count, 1);
  assert.equal(result.onlineCount, 0);
});

test("outros servicos continuam independentes do transporte", () => {
  const result = serviceOperationSummary([
    { id: 1, enabled: true, operationalType: "ENTREGA_LOCAL", available: false },
    { id: 2, enabled: true, available: true },
    { id: 3, enabled: true, available: true },
  ]);
  assert.equal(result.count, 3);
  assert.equal(result.onlineCount, 2);
  assert.deepEqual(serviceOperationSummary(), { count: 0, onlineCount: 0, registered: [] });
});

test("explica entregas e passageiros sem renomear registros", () => {
  assert.equal(serviceModalityDescription({ slug: "motoboy" }), "Entregas e encomendas");
  assert.equal(serviceModalityDescription({ slug: "mototaxi" }), "Transporte de passageiros em moto");
  assert.equal(serviceModalityDescription({ description: "Cortes" }), "Cortes");
});
