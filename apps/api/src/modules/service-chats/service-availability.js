import { env } from "../../config/env.js";

export function serviceAvailabilityCutoff(now = new Date()) {
  return new Date(now.getTime() - (env.serviceAvailability.heartbeatTimeoutSeconds * 1_000));
}

export function availableServiceWhere(now = new Date()) {
  return {
    disponibilidade_atualizada_em: { gte: serviceAvailabilityCutoff(now) },
    disponivel_agora: true,
  };
}

export function isServiceAvailable(service, now = new Date()) {
  return Boolean(
    service?.disponivel_agora
    && service.disponibilidade_atualizada_em
    && new Date(service.disponibilidade_atualizada_em) >= serviceAvailabilityCutoff(now),
  );
}
