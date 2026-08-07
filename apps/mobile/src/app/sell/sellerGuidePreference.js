import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const sellerGuideVersion = "v1";

function preferenceKey(userId) {
  return `detudoja.sellerGuide.${sellerGuideVersion}.${userId}`;
}

export async function hasSeenSellerGuide(userId) {
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

export async function markSellerGuideSeen(userId) {
  if (!userId) return;

  try {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(preferenceKey(userId), "seen");
      return;
    }

    await SecureStore.setItemAsync(preferenceKey(userId), "seen");
  } catch {
    // O guia continua funcional mesmo quando o armazenamento local falhar.
  }
}
