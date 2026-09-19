import Ionicons from "@expo/vector-icons/Ionicons";
import QRCode from "react-native-qrcode-svg";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import {
  createStoreStaffInvitation,
  getStoreTeam,
  removeStoreStaffMember,
  updateStoreStaffPermissions,
} from "../services/seller.api";
import { useAuthStore } from "../stores/useAuthStore";
import { resolveMediaUrl } from "../utils/media";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

export function StoreTeamScreen({ route }) {
  const { session } = useAuthStore();
  const store = route.params?.store;
  const [data, setData] = useState({ invitations: [], members: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [publicId, setPublicId] = useState("");
  const [saving, setSaving] = useState(false);
  const [qrInvite, setQrInvite] = useState(null);
  const [savingMemberId, setSavingMemberId] = useState(null);

  const load = useCallback(async () => {
    if (!session?.accessToken || !store?.id) return;
    setError("");
    try {
      setData(await getStoreTeam(session.accessToken, store.id));
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar a equipe.");
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken, store?.id]);

  useEffect(() => { load(); }, [load]);

  async function inviteById() {
    const identifier = publicId.trim();
    if (!identifier || saving) return;
    setSaving(true);
    setError("");
    try {
      await createStoreStaffInvitation(session.accessToken, store.id, identifier);
      setPublicId("");
      await load();
      Alert.alert("Convite enviado", "A pessoa vera o convite no perfil dela e podera aceitar ou recusar.");
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel enviar o convite.");
    } finally {
      setSaving(false);
    }
  }

  async function generateQr() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      setQrInvite(await createStoreStaffInvitation(session.accessToken, store.id));
      await load();
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel gerar o QR.");
    } finally {
      setSaving(false);
    }
  }

  function removeMember(member) {
    Alert.alert(
      "Remover da equipe?",
      `${member.user?.name ?? "Este funcionario"} perdera imediatamente o acesso aos chats da loja.`,
      [
        { style: "cancel", text: "Cancelar" },
        {
          onPress: async () => {
            try {
              await removeStoreStaffMember(session.accessToken, store.id, member.id);
              await load();
            } catch (requestError) {
              setError(requestError.message ?? "Nao foi possivel remover o funcionario.");
            }
          },
          style: "destructive",
          text: "Remover",
        },
      ],
    );
  }

  async function changePermission(member, key, value) {
    if (savingMemberId) return;
    const permissions = {
      createCharges: Boolean(member.permissions?.createCharges),
      manageOrders: Boolean(member.permissions?.manageOrders),
      storeChats: Boolean(member.permissions?.storeChats),
      [key]: value,
    };
    setSavingMemberId(member.id);
    setError("");
    setData((current) => ({
      ...current,
      members: current.members.map((item) => item.id === member.id ? { ...item, permissions } : item),
    }));
    try {
      await updateStoreStaffPermissions(session.accessToken, store.id, member.id, permissions);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel alterar as permissoes.");
      await load();
    } finally {
      setSavingMemberId(null);
    }
  }
  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <PageHeader
        eyebrow="Equipe da loja"
        subtitle="Convide atendentes sem misturar a conta pessoal deles com a administracao da loja."
        title={store?.name ?? "Funcionarios"}
      />

      <View style={styles.inviteCard}>
        <View style={styles.cardHeading}>
          <View style={styles.headingIcon}><Ionicons color={colors.primaryDark} name="person-add-outline" size={22} /></View>
          <View style={styles.headingCopy}>
            <Text style={styles.cardTitle}>Adicionar atendente</Text>
            <Text style={styles.cardText}>Digite o ID que aparece no perfil da pessoa.</Text>
          </View>
        </View>
        <AppInput
          autoCapitalize="none"
          label="ID do usuario"
          onChangeText={setPublicId}
          placeholder="@usuario ou numero do ID"
          value={publicId}
        />
        <AppButton disabled={!publicId.trim() || saving} icon="send-outline" loading={saving} onPress={inviteById} title="Enviar convite" />
        <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>OU</Text><View style={styles.dividerLine} /></View>
        <AppButton icon="qr-code-outline" onPress={generateQr} title="Gerar QR para o funcionario" variant="outline" />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Equipe ativa</Text>
        <Text style={styles.sectionCount}>{data.members?.length ?? 0}</Text>
      </View>
      {loading ? <Text style={styles.muted}>Carregando equipe...</Text> : (data.members ?? []).map((member) => (
        <View key={member.id} style={styles.memberCard}>
          <View style={styles.personRow}>
            <Avatar person={member.user} />
            <View style={styles.personCopy}>
            <Text numberOfLines={1} style={styles.personName}>{member.user?.name}</Text>
            <Text numberOfLines={1} style={styles.personMeta}>{member.role === "DONO" ? "Dono da loja" : "Atendente"} · @{member.user?.publicId ?? member.user?.id}</Text>
            </View>
            {member.role !== "DONO" ? (
              <Pressable accessibilityLabel="Remover funcionario" onPress={() => removeMember(member)} style={styles.removeButton}>
                <Ionicons color={colors.danger} name="trash-outline" size={19} />
              </Pressable>
            ) : <Ionicons color={colors.primaryDark} name="shield-checkmark" size={20} />}
          </View>
          {member.role !== "DONO" ? (
            <View style={styles.permissionPanel}>
              <Text style={styles.permissionTitle}>Permissoes liberadas pelo dono</Text>
              <PermissionSwitch disabled={savingMemberId === member.id} icon="chatbubbles-outline" label="Responder chats" onChange={(value) => changePermission(member, "storeChats", value)} value={member.permissions?.storeChats} />
              <PermissionSwitch disabled={savingMemberId === member.id} icon="qr-code-outline" label="Gerar cobrancas" onChange={(value) => changePermission(member, "createCharges", value)} value={member.permissions?.createCharges} />
              <PermissionSwitch disabled={savingMemberId === member.id} icon="cube-outline" label="Atualizar pedidos" onChange={(value) => changePermission(member, "manageOrders", value)} value={member.permissions?.manageOrders} />
            </View>
          ) : null}
        </View>
      ))}

      {(data.invitations ?? []).length ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Convites pendentes</Text>
            <Text style={styles.sectionCount}>{data.invitations.length}</Text>
          </View>
          {data.invitations.map((invite) => (
            <View key={invite.id} style={styles.pendingRow}>
              <Ionicons color={colors.warning} name={invite.invitedUser ? "mail-unread-outline" : "qr-code-outline"} size={21} />
              <View style={styles.personCopy}>
                <Text style={styles.personName}>{invite.invitedUser?.name ?? "Convite por QR"}</Text>
                <Text style={styles.personMeta}>Expira em {new Date(invite.expiresAt).toLocaleDateString("pt-BR")}</Text>
              </View>
            </View>
          ))}
        </>
      ) : null}

      <Modal animationType="fade" onRequestClose={() => setQrInvite(null)} transparent visible={Boolean(qrInvite)}>
        <View style={styles.overlay}>
          <View style={styles.qrCard}>
            <View style={styles.qrIcon}><Ionicons color={colors.primaryDark} name="storefront-outline" size={24} /></View>
            <Text style={styles.qrTitle}>Entrar como atendente</Text>
            <Text style={styles.qrText}>No celular do funcionario, abra Perfil, toque em “Ler convite por QR” e aponte para este codigo.</Text>
            {qrInvite?.qrValue ? <View style={styles.qrBox}><QRCode color={colors.textPrimary} size={220} value={qrInvite.qrValue} /></View> : null}
            <Text style={styles.qrExpiry}>Uso unico · valido por 7 dias</Text>
            <AppButton onPress={() => setQrInvite(null)} title="Concluir" />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function Avatar({ person }) {
  const imageUrl = resolveMediaUrl(person?.photoUrl);
  return <View style={styles.avatar}>{imageUrl ? <Image source={{ uri: imageUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{person?.name?.slice(0, 2).toUpperCase() ?? "AT"}</Text>}</View>;
}

function PermissionSwitch({ disabled, icon, label, onChange, value }) {
  return (
    <View style={styles.permissionRow}>
      <View style={styles.permissionIcon}><Ionicons color={colors.primaryDark} name={icon} size={17} /></View>
      <Text style={styles.permissionLabel}>{label}</Text>
      <Switch disabled={disabled} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.primaryLight }} thumbColor={value ? colors.primaryDark : colors.textMuted} value={Boolean(value)} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", overflow: "hidden", width: 44 },
  avatarImage: { height: "100%", width: "100%" },
  avatarText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 12 },
  cardHeading: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  cardText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  cardTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  divider: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  dividerLine: { backgroundColor: colors.border, flex: 1, height: 1 },
  dividerText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 10 },
  error: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, color: colors.danger, fontFamily: fonts.medium, padding: spacing.md },
  headingCopy: { flex: 1, gap: 3 },
  headingIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  inviteCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.xl, borderWidth: 1, gap: spacing.md, padding: spacing.lg, ...shadowSoft },
  memberCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.xl, borderWidth: 1, overflow: "hidden", ...shadowSoft },
  muted: { color: colors.textMuted, fontFamily: fonts.medium, textAlign: "center" },
  overlay: { alignItems: "center", backgroundColor: "rgba(15,23,42,0.55)", flex: 1, justifyContent: "center", padding: spacing.lg },
  pendingRow: { alignItems: "center", backgroundColor: colors.warningSoft, borderColor: colors.warning, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  permissionIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 32, justifyContent: "center", width: 32 },
  permissionLabel: { color: colors.textPrimary, flex: 1, fontFamily: fonts.semiBold, fontSize: typography.caption },
  permissionPanel: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.xs, padding: spacing.md },
  permissionRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 44 },
  permissionTitle: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5, marginBottom: spacing.xs, textTransform: "uppercase" },
  personCopy: { flex: 1, gap: 3, minWidth: 0 },
  personMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  personName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  personRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, padding: spacing.md },
  qrBox: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md },
  qrCard: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.xl, gap: spacing.md, maxWidth: 420, padding: spacing.xl, width: "100%" },
  qrExpiry: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: typography.caption },
  qrIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 52, justifyContent: "center", width: 52 },
  qrText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20, textAlign: "center" },
  qrTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2 },
  removeButton: { alignItems: "center", backgroundColor: colors.dangerSoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  section: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  sectionCount: { backgroundColor: colors.primarySoft, borderRadius: radius.round, color: colors.primaryDark, fontFamily: fonts.extraBold, overflow: "hidden", paddingHorizontal: spacing.sm, paddingVertical: 4 },
  sectionTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3 },
});
