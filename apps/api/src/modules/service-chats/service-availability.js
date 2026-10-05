// Availability is a saved choice. Mobile operating systems suspend foreground
// heartbeats when the professional leaves the app or locks the phone.
export function availableServiceWhere() {
  return {
    disponivel_agora: true,
  };
}

export function isServiceAvailable(service) {
  return Boolean(
    service?.disponivel_agora
    && !service.excluido_em
    && (!service.status || service.status === "ATIVO"),
  );
}
