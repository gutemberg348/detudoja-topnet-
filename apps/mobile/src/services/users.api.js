import { apiRequest } from "./api";
import { File } from "expo-file-system";
import { Platform } from "react-native";

export function getCurrentUser(accessToken) {
  return apiRequest("/api/app/users/me", { token: accessToken });
}

export function getCurrentUserAddresses(accessToken) {
  return apiRequest("/api/app/users/me/addresses", { token: accessToken });
}

export function updateCurrentUser(accessToken, data) {
  return apiRequest("/api/app/users/me", {
    body: data,
    method: "PATCH",
    token: accessToken,
  });
}

export function updateCurrentUserPhoto(accessToken, photo) {
  const body = new FormData();
  const extension = photo.fileName?.split(".").pop() || "jpg";
  const filename = `foto-perfil.${extension}`;

  if (photo.file) {
    body.append("photo", photo.file, filename);
  } else if (Platform.OS !== "web") {
    body.append("photo", new File(photo.uri), filename);
  } else {
    body.append("photo", {
      name: filename,
      type: photo.mimeType || "image/jpeg",
      uri: photo.uri,
    });
  }

  return apiRequest("/api/app/users/me/photo", {
    body,
    method: "PATCH",
    timeoutMs: 120_000,
    token: accessToken,
  });
}
