import assert from "node:assert/strict";
import test from "node:test";
import { groupServiceConversations, serviceHistoryKey } from "../src/utils/service-history.js";

const item = (id, status, person = 22, extra = {}) => ({
  id, status, isSeller: false, otherPerson: { id: person }, updatedAt: `2026-10-09T12:${String(id).padStart(2, "0")}:00Z`, ...extra,
});
test("historico agrupa encerrados/cancelados por pessoa, sem esconder atendimento ou disputa", () => {
  const original = [item(1, "ENCERRADA", 22, { unreadCount: 2, serviceType: { name: "Motoboy" } }),
    item(2, "CANCELADA", 22, { unreadCount: 3, serviceType: { name: "Eletricista" } }),
    item(3, "ACORDADA"), item(4, "EM_DISPUTA"), item(5, "ENCERRADA", 33)];
  const grouped = groupServiceConversations(original);
  assert.equal(grouped.length, 4);
  assert.ok(grouped.some((v) => v.id === 3 && !v.historyGroup));
  assert.ok(grouped.some((v) => v.id === 4 && !v.historyGroup));
  const history = grouped.find((v) => v.historyCount === 2);
  assert.equal(history.id, 2);
  assert.equal(history.unreadCount, 5);
  assert.deepEqual(history.historyServiceNames, ["Eletricista", "Motoboy"]);
  assert.equal(original[1].unreadCount, 3);
});
test("historico distingue papel de cliente/prestador e loja solicitante", () => {
  const base = item(1, "ENCERRADA");
  assert.notEqual(serviceHistoryKey(base), serviceHistoryKey({ ...base, isSeller: true }));
  assert.notEqual(serviceHistoryKey(base), serviceHistoryKey({ ...base, request: { store: { id: 10 } } }));
  assert.equal(serviceHistoryKey(base), serviceHistoryKey({ ...base, id: 20 }));
});
