import { apiRequest } from "./api";

function appendImage(body, field, image) {
  if (!image?.uri) return;
  const extension = image.fileName?.split(".").pop() || "jpg";
  const filename = `${field}.${extension}`;

  if (image.file) {
    body.append(field, image.file, filename);
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
  return apiRequest("/api/app/kyc/submissions", { body, method: "POST", token: accessToken });
}
