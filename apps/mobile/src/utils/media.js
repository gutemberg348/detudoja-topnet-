import { apiBaseUrl } from "../services/api";

export function resolveMediaUrl(value) {
  const normalized = String(value ?? "").trim().replace(/\\/g, "/");

  if (!normalized) {
    return null;
  }

  if (/^(https?:|data:|blob:)/i.test(normalized)) {
    return normalized;
  }

  const path = normalized.startsWith("/") ? normalized : `/${normalized}`;

  if (path.startsWith("/uploads/")) {
    return `${apiBaseUrl}${path}`;
  }

  return `${apiBaseUrl}${path}`;
}
