export function buildChatMessageFormData(payload) {
  const data = typeof payload === "string" ? { message: payload } : (payload ?? {});
  const attachment = data.attachment ?? null;
  const body = new FormData();

  body.append("message", data.message ?? "");

  for (const [key, value] of Object.entries(data)) {
    if (["attachment", "message"].includes(key) || value === undefined || value === null) continue;
    body.append(key, String(value));
  }

  if (!attachment) return body;

  body.append("attachmentType", attachment.type);

  if (attachment.type === "LOCATION") {
    body.append("latitude", String(attachment.latitude));
    body.append("longitude", String(attachment.longitude));
    body.append("locationLabel", attachment.label ?? "Localizacao atual");
    return body;
  }

  if (attachment.durationMs) {
    body.append("durationMs", String(Math.round(attachment.durationMs)));
  }

  body.append("attachment", {
    name: attachment.fileName ?? `arquivo-${Date.now()}`,
    type: attachment.mimeType ?? "application/octet-stream",
    uri: attachment.uri,
  });

  return body;
}
