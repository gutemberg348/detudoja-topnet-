const weekDays = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

function minuteOfDay(value) {
  const [hour, minute] = String(value ?? "").split(":").map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute)
    ? (hour * 60) + minute
    : null;
}

function brazilClock(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const hour = Number(value("hour")) % 24;

  return {
    minute: (hour * 60) + Number(value("minute")),
    weekDay: String(value("weekday") ?? "").toUpperCase(),
  };
}

function isOpenInSchedule(schedule, minute, { previousDay = false } = {}) {
  if (!schedule?.enabled) return false;
  const opensAt = minuteOfDay(schedule.opensAt);
  const closesAt = minuteOfDay(schedule.closesAt);
  if (opensAt == null || closesAt == null || opensAt === closesAt) return false;

  if (closesAt > opensAt) {
    return !previousDay && minute >= opensAt && minute < closesAt;
  }

  return previousDay ? minute < closesAt : minute >= opensAt;
}

export function evaluateStoreOpeningHours(openingHours, now = new Date()) {
  if (!Array.isArray(openingHours) || openingHours.length === 0) {
    return { configured: false, isOpen: true, reason: null };
  }

  const { minute, weekDay } = brazilClock(now);
  const dayIndex = weekDays.indexOf(weekDay);
  const previousWeekDay = weekDays[(dayIndex + weekDays.length - 1) % weekDays.length];
  const today = openingHours.find((item) => item?.day === weekDay);
  const previousDay = openingHours.find((item) => item?.day === previousWeekDay);
  const isOpen = isOpenInSchedule(today, minute)
    || isOpenInSchedule(previousDay, minute, { previousDay: true });

  return {
    configured: true,
    isOpen,
    reason: isOpen ? null : "A loja esta fechada neste horario",
  };
}

export function assertStoreCanReceiveOrders(store, now = new Date()) {
  if (!store.aberta_para_pedidos) {
    throw new Error("A loja esta fechada para novos pedidos");
  }

  const schedule = evaluateStoreOpeningHours(store.horarios_funcionamento, now);
  if (!schedule.isOpen) {
    throw new Error(schedule.reason);
  }
}
