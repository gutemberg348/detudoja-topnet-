import {
  createDefaultStoreOpeningHours,
  storeWeekDays,
} from "./seller.constants";

export function normalizeStoreOpeningHours(hours) {
  const savedHours = new Map(
    (Array.isArray(hours) ? hours : []).map((item) => [item.day, item]),
  );

  return createDefaultStoreOpeningHours().map((fallback) => ({
    ...fallback,
    ...(savedHours.get(fallback.day) ?? {}),
  }));
}

export function formatClockInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 4);

  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

export function hasValidStoreOpeningHours(hours) {
  const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const normalizedHours = Array.isArray(hours) ? hours : [];

  return (
    normalizedHours.length === storeWeekDays.length &&
    new Set(normalizedHours.map((item) => item.day)).size === storeWeekDays.length &&
    normalizedHours.every(
      (item) =>
        !item.enabled ||
        (clockPattern.test(item.opensAt) &&
          clockPattern.test(item.closesAt) &&
          item.opensAt !== item.closesAt),
    )
  );
}

export function todayWeekDay() {
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][
    new Date().getDay()
  ];
}
