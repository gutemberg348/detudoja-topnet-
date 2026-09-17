import { File } from "expo-file-system";
import { Platform } from "react-native";
import { apiRequest } from "./api";

function appendImage(body, field, image) {
  if (!image?.uri) return;
  const extension = image.fileName?.split(".").pop() || "jpg";
  const filename = `${field}.${extension}`;

  if (image.file) {
    body.append(field, image.file, filename);
    return;
  }

  if (Platform.OS !== "web") {
    body.append(field, new File(image.uri), filename);
    return;
  }

  body.append(field, {
    name: filename,
    type: image.mimeType || "image/jpeg",
    uri: image.uri,
  });
}

export function getKycStatus(accessToken) {
  return apiRequest("/api/app/kyc", { token: accessToken });
}

export function submitKycDocuments(accessToken, { documentBack, documentFront, documentType, selfie }) {
  const body = new FormData();
  body.append("documentType", documentType);
  appendImage(body, "documentFront", documentFront);
  appendImage(body, "documentBack", documentBack);
  appendImage(body, "selfie", selfie);
  return apiRequest("/api/app/kyc/submissions", {
    body,
    method: "POST",
    timeoutMs: 120_000,
    token: accessToken,
  });
}
