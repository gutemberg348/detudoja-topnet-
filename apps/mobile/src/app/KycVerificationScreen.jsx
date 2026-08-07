import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { getCurrentUser } from "../services/users.api";
import { verifyKycDocument } from "../services/kyc.api";
import { useAuthStore } from "../stores/useAuthStore";
import {
  colors,
  fonts,
  radius,
  shadow,
  spacing,
  typography,
} from "../utils/theme";

const kycStatusLabels = {
  APROVADO: "Verificado",
  BLOQUEADO: "Bloqueado",
  EM_ANALISE: "Em analise",
  PENDENTE: "Pendente",
  REPROVADO: "Reprovado",
};

export function KycVerificationScreen() {
  const { session, updateSessionUser } = useAuthStore();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState(null);

  const isVerified = profile?.kycStatus === "APROVADO";

  async function loadProfile() {
    if (!session?.accessToken) {
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await getCurrentUser(session.accessToken);
      setProfile(response.user);
      updateSessionUser({
        kycLevel: response.user.kycLevel,
        kycStatus: response.user.kycStatus,
      });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar a verificacao.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, [session?.accessToken]);

  async function submitVerification() {
    setError("");
    setIsSaving(true);

    try {
      const response = await verifyKycDocument(session.accessToken);
      setProfile(response.user);
      updateSessionUser({
        kycLevel: response.user.kycLevel,
        kycStatus: response.user.kycStatus,
      });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel verificar agora.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && !profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primaryDark} size="large" />
        <Text style={styles.loadingText}>Carregando verificacao...</Text>
      </View>
    );
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <LinearGradient
        colors={isVerified ? ["#ECFDF5", "#FFFFFF"] : ["#F8FAFC", "#FFFFFF"]}
        style={styles.hero}
      >
        <View style={[styles.heroIcon, isVerified && styles.heroIconVerified]}>
          <Ionicons
            color={isVerified ? colors.primaryDark : colors.textSecondary}
            name={isVerified ? "shield-checkmark" : "shield-outline"}
            size={32}
          />
        </View>
        <Text style={styles.title}>
          {isVerified ? "Documento verificado" : "Verifique seu documento"}
        </Text>
        <Text style={styles.subtitle}>
          {isVerified
            ? "Sua conta ja passou pela verificacao inicial."
            : "Por enquanto, esta etapa aprova a verificacao com um toque. Depois vamos plugar o envio real de documentos."}
        </Text>
      </LinearGradient>

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={styles.statusIcon}>
            <Ionicons color={colors.primaryDark} name="person-outline" size={20} />
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusLabel}>Titular</Text>
            <Text style={styles.statusValue}>{profile?.name ?? session?.user?.name}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.statusRow}>
          <View style={styles.statusIcon}>
            <Ionicons color={colors.primaryDark} name="ribbon-outline" size={20} />
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusLabel}>Nivel da conta</Text>
            <Text style={styles.statusValue}>{profile?.accountLevelLabel ?? "Prata"}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.statusRow}>
          <View style={styles.statusIcon}>
            <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={20} />
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusLabel}>KYC</Text>
            <Text style={styles.statusValue}>
              {kycStatusLabels[profile?.kycStatus] ?? profile?.kycStatus ?? "Pendente"}
            </Text>
          </View>
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <AppButton
        disabled={isVerified}
        icon={isVerified ? "checkmark-circle-outline" : "shield-checkmark-outline"}
        loading={isSaving}
        onPress={submitVerification}
        title={isVerified ? "Ja verificado" : "Verificar agora"}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.lg,
    justifyContent: "center",
    padding: spacing.xl,
  },
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    textAlign: "center",
  },
  hero: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xl,
    ...shadow,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: radius.round,
    height: 68,
    justifyContent: "center",
    width: 68,
  },
  heroIconVerified: {
    backgroundColor: colors.primarySoft,
  },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  statusCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadow,
  },
  statusCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  statusIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  statusLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 62,
  },
  statusValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.label,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    lineHeight: 22,
    textAlign: "center",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
    textAlign: "center",
  },
});
