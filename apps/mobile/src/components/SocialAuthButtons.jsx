import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { ApiError } from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, spacing, typography } from "../utils/theme";
import { AppButton } from "./AppButton";

WebBrowser.maybeCompleteAuthSession();

const googleClientIds = {
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ?? "",
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "",
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "",
};
const googleRedirectUri = makeRedirectUri({ path: "oauth", scheme: "detudoja" });

function messageForError(error) {
  if (error instanceof ApiError) {
    return error.message;
  }

  return "Nao foi possivel concluir o login social agora.";
}

export function SocialAuthButtons({ action = "Entrar" }) {
  const { socialLogin } = useAuthStore();
  const [message, setMessage] = useState("");
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handledGoogleToken = useRef(null);
  const currentGoogleClientId = Platform.select({
    android: googleClientIds.android,
    ios: googleClientIds.ios,
    web: googleClientIds.web,
    default: googleClientIds.web,
  }) ?? "";
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    androidClientId: googleClientIds.android || "google-client-id-pendente",
    iosClientId: googleClientIds.ios || "google-client-id-pendente",
    redirectUri: googleRedirectUri,
    selectAccount: true,
    webClientId: googleClientIds.web || "google-client-id-pendente",
  });

  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;

    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) setIsAppleAvailable(available);
      })
      .catch(() => {
        if (active) setIsAppleAvailable(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function finishSocialLogin(payload) {
    setIsSubmitting(true);
    setMessage("");

    try {
      await socialLogin(payload);
    } catch (error) {
      setMessage(messageForError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (googleResponse?.type !== "success") return;

    const idToken = googleResponse.params?.id_token
      ?? googleResponse.authentication?.idToken;

    if (!idToken || handledGoogleToken.current === idToken) return;
    handledGoogleToken.current = idToken;
    finishSocialLogin({ idToken, provider: "GOOGLE" });
  }, [googleResponse]);

  async function handleGooglePress() {
    setMessage("");

    if (!currentGoogleClientId) {
      setMessage("Configure os IDs OAuth do Google para liberar este acesso.");
      return;
    }

    if (!googleRequest) {
      setMessage("Preparando o login Google. Tente novamente em alguns segundos.");
      return;
    }

    try {
      await promptGoogle();
    } catch {
      setMessage("Nao foi possivel abrir o login Google.");
    }
  }

  async function handleApplePress() {
    setMessage("");

    if (Platform.OS !== "ios" || !isAppleAvailable) {
      setMessage("Entrar com Apple esta disponivel no aplicativo para iPhone.");
      return;
    }

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const idToken = credential.identityToken;

      if (!idToken) {
        setMessage("A Apple nao retornou uma identidade valida. Tente novamente.");
        return;
      }

      const fullName = credential.fullName
        ? AppleAuthentication.formatFullName(credential.fullName)
        : "";
      await finishSocialLogin({
        idToken,
        ...(fullName ? { name: fullName } : {}),
        provider: "APPLE",
      });
    } catch (error) {
      if (error?.code !== "ERR_REQUEST_CANCELED") {
        setMessage("Nao foi possivel concluir o login Apple.");
      }
    }
  }

  return (
    <View style={styles.wrapper}>
      <AppButton
        disabled={isSubmitting}
        icon="logo-google"
        loading={isSubmitting}
        onPress={handleGooglePress}
        title={`${action} com Google`}
        variant="neutral"
      />
      {Platform.OS === "ios" && isAppleAvailable ? (
        <View style={styles.appleButtonFrame}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
            buttonType={
              action === "Cadastrar"
                ? AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
                : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            cornerRadius={8}
            onPress={handleApplePress}
            style={styles.appleButton}
          />
        </View>
      ) : (
        <AppButton
          disabled={isSubmitting}
          icon="logo-apple"
          onPress={handleApplePress}
          title={`${action} com Apple`}
          variant="neutral"
        />
      )}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
    width: "100%",
  },
  appleButton: {
    height: 50,
    width: "100%",
  },
  appleButtonFrame: {
    borderRadius: 8,
    height: 50,
    overflow: "hidden",
    width: "100%",
  },
  message: {
    color: colors.danger,
    fontSize: typography.small,
    lineHeight: 18,
    textAlign: "center",
  },
});
