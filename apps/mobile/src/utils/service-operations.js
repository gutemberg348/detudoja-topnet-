// A courier profile is one work area, with independently selected modalities.
export function serviceOperationSummary(services = []) {
  const registered = services.filter((service) => service.enabled);
  const groups = new Map();
  for (const service of registered) {
    const key = service.requiresCourierProfile || service.operationalType === "ENTREGA_LOCAL"
      ? "transport"
      : `service:${service.id}`;
    groups.set(key, Boolean(groups.get(key) || service.available));
  }
  return {
    registered,
    count: groups.size,
    onlineCount: [...groups.values()].filter(Boolean).length,
  };
}

export function serviceModalityDescription(service) {
  if (service.slug === "motoboy") return "Entregas e encomendas";
  if (["mototaxi", "moto-taxi"].includes(service.slug)) return "Transporte de passageiros em moto";
  return service.description || "Atendimento por chamado no aplicativo.";
}
