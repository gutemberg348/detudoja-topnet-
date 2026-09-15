import Ionicons from "@expo/vector-icons/Ionicons";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { CpfRequirementModal } from "../components/CpfRequirementModal";
import { KycSubmissionProgress } from "../components/KycSubmissionProgress";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { getCurrentUser } from "../services/users.api";
import { ApiError } from "../services/api";
import { getKycStatus, submitKycDocuments } from "../services/kyc.api";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

const documentTypes = [
  { label: "RG", value: "RG" },
  { label: "CNH", value: "CNH" },
  { label: "RNE", value: "RNE" },
];

const statusContent = {
  APROVADO: { icon: "shield-checkmark", title: "Identidade verificada", text: "Documento, dados e selfie foram confirmados." },
  BLOQUEADO: { icon: "alert-circle-outline", title: "Verificacao bloqueada", text: "Seu KYC foi revogado. Entre em contato com o suporte para regularizar a conta." },
  REPROVADO: { icon: "refresh-circle-outline", title: "Novo envio necessario", text: "Confira o motivo abaixo e envie fotos novas." },
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function prepareImageForUpload(asset) {
  if (!asset?.uri || Platform.OS === "web") return asset;

  const longestSide = Math.max(asset.width ?? 0, asset.height ?? 0);
  const resize = longestSide > 1800
    ? asset.width >= asset.height
      ? { width: 1800 }
      : { height: 1800 }
    : null;
  const normalized = await manipulateAsync(
    asset.uri,
    resize ? [{ resize }] : [],
    { compress: 0.72, format: SaveFormat.JPEG },
  );

  return {
    ...asset,
    ...normalized,
    file: undefined,
    fileName: `kyc-${Date.now()}.jpg`,
    mimeType: "image/jpeg",
  };
}

function underReviewContent(processingStatus) {
  if (["PENDENTE", "PROCESSANDO"].includes(processingStatus)) {
    return {
      icon: "scan-outline",
      text: "Recebemos suas imagens e a análise automática está acontecendo em segundo plano. Esta tela será atualizada automaticamente.",
      title: "Análise em andamento",
    };
  }

  return {
    icon: "hourglass-outline",
    text: "A análise automática terminou e o envio precisa de uma validação adicional segura.",
    title: "Verificação em análise",
  };
}

function kycLevelForStatus(status) {
  if (status === "APROVADO") return "TIER_2";
  if (["BLOQUEADO", "REPROVADO"].includes(status)) return status;
  return null;
}

function CaptureField({ image, label, onPress, optional = false }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.capture, pressed && styles.pressed]}>
      <View style={styles.capturePreview}>
        {image?.uri ? <Image source={{ uri: image.uri }} style={styles.captureImage} /> : <Ionicons color={colors.primaryDark} name="camera-outline" size={24} />}
      </View>
      <View style={styles.captureCopy}>
        <Text style={styles.captureLabel}>{label}</Text>
        <Text style={styles.captureHint}>{image ? "Foto pronta para verificacao" : optional ? "Opcional para CNH" : "Toque para abrir a camera"}</Text>
      </View>
      <Ionicons color={image ? colors.success : colors.textSecondary} name={image ? "checkmark-circle" : "chevron-forward"} size={22} />
    </Pressable>
  );
}

export function KycVerificationScreen() {
  const { session, updateSessionUser } = useAuthStore();
  const [cpfModalOpen, setCpfModalOpen] = useState(false);
  const [cpfRequired, setCpfRequired] = useState(Boolean(session?.user?.cpfRequired));
  const [documentType, setDocumentType] = useState("RG");
  const [images, setImages] = useState({ documentBack: null, documentFront: null, selfie: null });
  const [kyc, setKyc] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [submissionStage, setSubmissionStage] = useState(null);

  const canSubmit = useMemo(() => Boolean(
    images.documentFront && images.selfie && (documentType === "CNH" || images.documentBack),
  ), [documentType, images]);
  const locked = ["APROVADO", "BLOQUEADO", "EM_ANALISE"].includes(kyc?.status);
  const currentStatus = kyc?.status === "EM_ANALISE"
    ? underReviewContent(kyc?.submission?.processingStatus)
    : statusContent[kyc?.status];

  async function load() {
    if (!session?.accessToken) return;
    setError("");
    try {
      const [kycResponse, profileResponse] = await Promise.all([
        getKycStatus(session.accessToken),
        getCurrentUser(session.accessToken),
      ]);
      setKyc(kycResponse.kyc);
      const profileNeedsCpf = Boolean(profileResponse.user.cpfRequired);
      const kycIsLocked = ["APROVADO", "BLOQUEADO", "EM_ANALISE"].includes(kycResponse.kyc?.status);
      setCpfRequired(profileNeedsCpf);
      setCpfModalOpen(profileNeedsCpf && !kycIsLocked);
      updateSessionUser({
        cpfRequired: profileNeedsCpf,
        kycLevel: profileResponse.user.kycLevel,
        kycStatus: profileResponse.user.kycStatus,
      });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar a verificacao.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [session?.accessToken]);

  useEffect(() => {
    if (kyc?.status !== "EM_ANALISE" || !session?.accessToken) return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await getKycStatus(session.accessToken);
        setKyc(response.kyc);
        const kycLevel = kycLevelForStatus(response.kyc.status);
        updateSessionUser({
          kycStatus: response.kyc.status,
          ...(kycLevel ? { kycLevel } : {}),
        });
      } catch {
        // Mantem o ultimo estado conhecido e tenta novamente no proximo ciclo.
      }
    }, 4_000);
    return () => clearInterval(timer);
  }, [kyc?.status, session?.accessToken, updateSessionUser]);

  async function captureImage(field) {
    const Picker = await import("expo-image-picker");
    const permission = await Picker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Permita o uso da camera para tirar a foto.");
      return;
    }

    const options = {
      allowsEditing: false,
      cameraType: field === "selfie" ? "front" : "back",
      mediaTypes: Picker.MediaTypeOptions?.Images ?? ["images"],
      quality: 0.72,
    };
    const result = await Picker.launchCameraAsync(options);
    if (!result.canceled && result.assets?.[0]) {
      try {
        const preparedImage = await prepareImageForUpload(result.assets[0]);
        setImages((current) => ({ ...current, [field]: preparedImage }));
        setError("");
      } catch {
        setError("Nao foi possivel preparar esta foto. Tire a foto novamente.");
      }
    }
  }

  async function submit() {
    if (!canSubmit || isSaving) return;
    const previousSubmissionId = kyc?.submission?.id ?? null;
    setError("");
    setIsSaving(true);
    setSubmissionStage("UPLOADING");
    try {
      const response = await submitKycDocuments(session.accessToken, { ...images, documentType });
      setKyc(response.kyc);
      updateSessionUser({ kycLevel: response.user.kycLevel, kycStatus: response.user.kycStatus });
      setImages({ documentBack: null, documentFront: null, selfie: null });
      setSubmissionStage("SENT");
      await wait(900);
      setSubmissionStage("ANALYZING");
      await wait(1_500);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 428) {
        setCpfRequired(true);
        setCpfModalOpen(true);
        setSubmissionStage(null);
        setError("Informe seu CPF para concluir a verificacao.");
        return;
      }
      try {
        const recovered = await getKycStatus(session.accessToken);
        if (
          recovered.kyc?.submission
          && recovered.kyc.submission.id !== previousSubmissionId
          && ["EM_ANALISE", "APROVADO", "REPROVADO"].includes(recovered.kyc.status)
        ) {
          setKyc(recovered.kyc);
          const kycLevel = kycLevelForStatus(recovered.kyc.status);
          updateSessionUser({
            kycStatus: recovered.kyc.status,
            ...(kycLevel ? { kycLevel } : {}),
          });
          setImages({ documentBack: null, documentFront: null, selfie: null });
          setSubmissionStage("SENT");
          await wait(900);
          setSubmissionStage("ANALYZING");
          await wait(1_500);
          return;
        }
      } catch {
        // Usa abaixo o erro original do envio.
      }
      setSubmissionStage(null);
      setError(
        requestError instanceof ApiError && requestError.status >= 500
          ? "Nao conseguimos salvar as fotos agora. Elas continuam nesta tela; aguarde um instante e toque em Verificar identidade novamente."
          : requestError.message ?? "Nao foi possivel enviar os documentos.",
      );
    } finally {
      setSubmissionStage(null);
      setIsSaving(false);
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <KycSubmissionProgress stage={submissionStage} />
      <PageHeader eyebrow="Seguranca da conta" title="Verificar identidade" subtitle="Fotografe seu documento e rosto. A verificacao acontece automaticamente." />

      {isLoading ? <View style={styles.notice}><Text style={styles.noticeText}>Carregando situacao...</Text></View> : null}
      {currentStatus ? (
        <View style={[styles.status, ["BLOQUEADO", "REPROVADO"].includes(kyc.status) && styles.statusRejected]}>
          <Ionicons color={["BLOQUEADO", "REPROVADO"].includes(kyc.status) ? colors.danger : colors.primaryDark} name={currentStatus.icon} size={28} />
          <View style={styles.statusCopy}><Text style={styles.statusTitle}>{currentStatus.title}</Text><Text style={styles.statusText}>{currentStatus.text}</Text></View>
        </View>
      ) : null}
      {kyc?.rejectionReason ? <View style={styles.rejection}><Text style={styles.rejectionLabel}>{kyc.status === "BLOQUEADO" ? "Motivo do bloqueio" : "Motivo da reprovação"}</Text><Text style={styles.rejectionText}>{kyc.rejectionReason}</Text></View> : null}

      {!locked && !isLoading && cpfRequired ? (
        <View style={styles.cpfGate}>
          <View style={styles.cpfGateIcon}>
            <Ionicons color="#B45309" name="card-outline" size={24} />
          </View>
          <View style={styles.cpfGateCopy}>
            <Text style={styles.cpfGateTitle}>CPF necessario para verificar</Text>
            <Text style={styles.cpfGateText}>Informe o CPF que aparece no documento antes de fotografar. Se ele ja estiver salvo, esta etapa nao aparece.</Text>
          </View>
          <AppButton icon="arrow-forward" onPress={() => setCpfModalOpen(true)} title="Informar CPF" />
        </View>
      ) : null}

      {!locked && !isLoading && !cpfRequired ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Escolha o documento</Text>
            <View style={styles.typeRow}>
              {documentTypes.map((item) => (
                <Pressable key={item.value} onPress={() => setDocumentType(item.value)} style={[styles.typeButton, documentType === item.value && styles.typeButtonActive]}>
                  <Text style={[styles.typeText, documentType === item.value && styles.typeTextActive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Fotografe sem cortar</Text>
            <CaptureField image={images.documentFront} label={`Frente do ${documentType}`} onPress={() => captureImage("documentFront")} />
            <CaptureField image={images.documentBack} label={`Verso do ${documentType}`} onPress={() => captureImage("documentBack")} optional={documentType === "CNH"} />
            <CaptureField image={images.selfie} label="Selfie do titular" onPress={() => captureImage("selfie")} />
          </View>
          <View style={styles.privacy}><Ionicons color={colors.primaryDark} name="scan-outline" size={20} /><Text style={styles.privacyText}>OCR, comparacao facial e prova de vida passiva sao executados em servidor privado. Fotos da galeria nao sao aceitas.</Text></View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AppButton disabled={!canSubmit} icon="shield-checkmark-outline" loading={isSaving} onPress={submit} title="Verificar identidade" />
        </>
      ) : null}
      {locked && error ? <Text style={styles.error}>{error}</Text> : null}

      <CpfRequirementModal
        onClose={() => setCpfModalOpen(false)}
        onCompleted={() => {
          setCpfRequired(false);
          setCpfModalOpen(false);
          setError("");
        }}
        open={cpfModalOpen}
        reason="kyc"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  capture: { alignItems: "center", borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 82, padding: spacing.md },
  captureCopy: { flex: 1, gap: 4, minWidth: 0 },
  captureHint: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  captureImage: { height: "100%", width: "100%" },
  captureLabel: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.label, fontWeight: "700" },
  capturePreview: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 54, justifyContent: "center", overflow: "hidden", width: 54 },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  cpfGate: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A", borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.lg, ...shadow },
  cpfGateCopy: { gap: spacing.xs },
  cpfGateIcon: { alignItems: "center", backgroundColor: "#FEF3C7", borderRadius: radius.round, height: 48, justifyContent: "center", width: 48 },
  cpfGateText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20 },
  cpfGateTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.label, fontWeight: "700" },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.small, lineHeight: 20, textAlign: "center" },
  notice: { borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  noticeText: { color: colors.textSecondary, textAlign: "center" },
  pressed: { opacity: 0.78 },
  privacy: { alignItems: "flex-start", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  privacyText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.medium, fontSize: typography.small, lineHeight: 19 },
  rejection: { backgroundColor: colors.dangerSoft ?? "#FFF1F1", borderColor: colors.danger, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, padding: spacing.md },
  rejectionLabel: { color: colors.danger, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700", textTransform: "uppercase" },
  rejectionText: { color: colors.textPrimary, fontFamily: fonts.medium, fontSize: typography.small, lineHeight: 20 },
  section: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.lg, ...shadow },
  sectionTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
  status: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.lg },
  statusCopy: { flex: 1, gap: spacing.xs },
  statusRejected: { backgroundColor: colors.dangerSoft ?? "#FFF1F1", borderColor: colors.danger },
  statusText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 19 },
  statusTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.label, fontWeight: "700" },
  typeButton: { alignItems: "center", borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flex: 1, minHeight: 46, justifyContent: "center" },
  typeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeText: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  typeTextActive: { color: colors.card },
});
