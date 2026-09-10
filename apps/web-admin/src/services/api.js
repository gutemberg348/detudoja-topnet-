export const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest(
  path,
  { body, method = "GET", token } = {},
) {
  const headers = {};
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (body && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    headers,
    method,
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      data?.message ?? `Request failed with status ${response.status}`,
      response.status,
      data,
    );
  }

  return data;
}

export function apiGet(path, token) {
  return apiRequest(path, { token });
}

export async function apiBlob(path, token) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.message ?? "Nao foi possivel abrir o arquivo", response.status, data);
  }

  return response.blob();
}
