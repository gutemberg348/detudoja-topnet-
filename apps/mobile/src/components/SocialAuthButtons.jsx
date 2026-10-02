import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { ApiError } from "../services/api";
import { getGoogleSignInUnavailableReason, signInWithNativeGoogle } from "../services/google-sign-in";
import { useAuthStore } from "../stores/useAuthStore";
import { googleErrorMessage } from "../utils/google-auth";
import { colors, spacing, typography } from "../utils/theme";
import { AppButton } from "./AppButton";

WebBrowser.maybeCompleteAuthSession();

const googleClientIds = {
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ?? "",
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "",
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "",
};
const googleRedirectUri = makeRedirectUri({ path: "oauth", scheme: "detudoja" });
const googleUnavailableReason = getGoogleSignInUnavailableReason();

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
  const loginInProgress = useRef(false);
  const currentGoogleClientId = Platform.select({
    android: googleClientIds.android,
    ios: googleClientIds.ios,
    web: googleClientIds.web,
    default: googleClientIds.web,
  }) ?? "";
  const [googleRequest, , promptGoogle] = Google.useIdTokenAuthRequest({
    androidClientId: googleClientIds.android || "google-client-id-pendente",
    iosClientId: googleClientIds.ios || "google-client-id-pendente",
    redirectUri: googleRedirectUri,
    selectAccount: true,
    shouldAutoExchangeCode: false,
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

  async function handleGooglePress() {
    if (loginInProgress.current) return;
    setMessage("");

    if (Platform.OS === "web" && !currentGoogleClientId) {
      setMessage("Configure os IDs OAuth do Google para liberar este acesso.");
      return;
    }

    if (Platform.OS === "web" && !googleRequest) {
      setMessage("Preparando o login Google. Tente novamente em alguns segundos.");
      return;
    }

    loginInProgress.current = true;
    setIsSubmitting(true);
    try {
      let idToken;
      if (Platform.OS !== "web") {
        idToken = await signInWithNativeGoogle();
      } else {
        const result = await promptGoogle();
        if (["cancel", "dismiss"].includes(result.type)) return;
        if (result.type !== "success") {
          throw Object.assign(new Error("Google authorization failed"), {
            code: result.error?.code ?? result.params?.error,
          });
        }
        idToken = result.params?.id_token ?? result.authentication?.idToken;
        if (!idToken) throw Object.assign(new Error("Missing identity"), { code: "GOOGLE_TOKEN_MISSING" });
      }
      if (idToken) await socialLogin({ idToken, provider: "GOOGLE" });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : googleErrorMessage(error));
    } finally {
      loginInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleApplePress() {
    if (loginInProgress.current) return;
    setMessage("");

    if (Platform.OS !== "ios" || !isAppleAvailable) {
      setMessage("Entrar com Apple esta disponivel no aplicativo para iPhone.");
      return;
    }

    loginInProgress.current = true;
    setIsSubmitting(true);
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
    } finally {
      loginInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.wrapper}>
      <AppButton
        disabled={isSubmitting || Boolean(googleUnavailableReason)}
        icon="logo-google"
        loading={isSubmitting}
        onPress={handleGooglePress}
        title={`${action} com Google`}
        variant="neutral"
      />
      {googleUnavailableReason ? <Text style={styles.availabilityHint}>{googleUnavailableReason}</Text> : null}
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
  availabilityHint: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    lineHeight: 18,
    textAlign: "center",
  },
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
