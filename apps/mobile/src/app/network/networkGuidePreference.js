import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const networkGuideVersion = "v1";

function preferenceKey(userId) {
  return `detudoja.networkGuide.${networkGuideVersion}.${userId}`;
}

export async function hasSeenNetworkGuide(userId) {
  if (!userId) return true;

  try {
    if (Platform.OS === "web") {
      return globalThis.localStorage?.getItem(preferenceKey(userId)) === "seen";
    }

    return (await SecureStore.getItemAsync(preferenceKey(userId))) === "seen";
  } catch {
    return false;
  }
}

export async function markNetworkGuideSeen(userId) {
  if (!userId) return;

  try {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(preferenceKey(userId), "seen");
      return;
    }

    await SecureStore.setItemAsync(preferenceKey(userId), "seen");
  } catch {
    // O guia continua disponivel mesmo se a preferencia local falhar.
  }
}
