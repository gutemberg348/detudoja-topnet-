import { File } from "expo-file-system";
import { Platform } from "react-native";

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
    body.append("locationLabel", attachment.label ?? "Ponto GPS atual");
    return body;
  }

  if (attachment.durationMs) {
    body.append("durationMs", String(Math.round(attachment.durationMs)));
  }

  const fileName = attachment.fileName ?? `arquivo-${Date.now()}`;

  if (Platform.OS !== "web") {
    // Expo SDK 57 envia o arquivo real (Blob/File). O antigo objeto { uri }
    // falhava de forma intermitente no iOS/Android com "Network request failed".
    body.append("attachment", new File(attachment.uri), fileName);
  } else {
    body.append("attachment", {
      name: fileName,
      type: attachment.mimeType ?? "application/octet-stream",
      uri: attachment.uri,
    });
  }

  return body;
}
