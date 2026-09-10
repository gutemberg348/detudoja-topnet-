import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateStoreOpeningHours } from "../src/modules/orders/store-opening-hours.js";

const everyDay = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
].map((day) => ({ closesAt: "18:00", day, enabled: day !== "SUNDAY", opensAt: "09:00" }));

test("horario comercial respeita dia fechado e preserva lojas sem agenda legada", () => {
  assert.equal(evaluateStoreOpeningHours(null, new Date("2026-09-06T15:00:00.000Z")).isOpen, true);
  assert.equal(evaluateStoreOpeningHours(everyDay, new Date("2026-09-06T15:00:00.000Z")).isOpen, false);
  assert.equal(evaluateStoreOpeningHours(everyDay, new Date("2026-09-07T15:00:00.000Z")).isOpen, true);
});

test("horario que atravessa a meia-noite permanece aberto no inicio do dia seguinte", () => {
  const hours = everyDay.map((item) => (
    item.day === "MONDAY"
      ? { ...item, closesAt: "02:00", enabled: true, opensAt: "22:00" }
      : { ...item, enabled: false }
  ));
  assert.equal(evaluateStoreOpeningHours(hours, new Date("2026-09-08T04:30:00.000Z")).isOpen, true);
  assert.equal(evaluateStoreOpeningHours(hours, new Date("2026-09-08T05:30:00.000Z")).isOpen, false);
});
