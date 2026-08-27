import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import {
  addStoreCourier,
  getStoreCourierTeam,
  removeStoreCourier,
} from "../services/courier.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { useAuthStore } from "../stores/useAuthStore";
import { formatPhone } from "../utils/authValidation";
import { resolveMediaUrl } from "../utils/media";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

export function StoreCourierTeamScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const store = route.params?.store;
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [phone, setPhone] = useState("");
  const [removingId, setRemovingId] = useState(null);

  const onlineCount = useMemo(
    () => members.filter((member) => member.courier.isAvailable).length,
    [members],
  );
  const sortedMembers = useMemo(
    () => [...members].sort((left, right) => Number(right.courier.isAvailable) - Number(left.courier.isAvailable)),
    [members],
  );

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken || !store?.id) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const response = await getStoreCourierTeam(session.accessToken, store.id);
      setMembers(response.members ?? []);
    } catch (requestError) {
      if (!silent) setError(requestError.message ?? "Nao foi possivel carregar a equipe.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [session?.accessToken, store?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!session?.accessToken || !store?.id) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refreshAvailability = () => load({ silent: true });
    const refreshTeam = (payload = {}) => {
      if (Number(payload.storeId) === Number(store.id)) load({ silent: true });
    };

    socket?.on(realtimeEvents.serviceAvailabilityUpdated, refreshAvailability);
    socket?.on(realtimeEvents.courierTeamUpdated, refreshTeam);
    return () => {
      socket?.off(realtimeEvents.serviceAvailabilityUpdated, refreshAvailability);
      socket?.off(realtimeEvents.courierTeamUpdated, refreshTeam);
    };
  }, [load, session?.accessToken, store?.id]);

  async function addMember() {
    const digits = phone.replace(/\D/g, "");
    if (!session?.accessToken || !store?.id || adding || digits.length < 10) return;
    setAdding(true);
    setError("");

    try {
      const response = await addStoreCourier(session.accessToken, store.id, digits);
      setMembers((current) => {
        const remaining = current.filter((member) => member.id !== response.member.id);
        return [...remaining, response.member];
      });
      setPhone("");
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel adicionar o motoboy.");
    } finally {
      setAdding(false);
    }
  }

  function confirmRemove(member) {
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(`Remover ${member.courier.displayName} da equipe?`)) {
        removeMember(member);
      }
      return;
    }

    Alert.alert(
      "Remover da equipe?",
      `${member.courier.displayName} nao aparecera mais como motoboy desta loja.`,
      [
        { style: "cancel", text: "Cancelar" },
        { onPress: () => removeMember(member), style: "destructive", text: "Remover" },
      ],
    );
  }

  async function removeMember(member) {
    if (!session?.accessToken || !store?.id || removingId) return;
    setRemovingId(member.id);
    setError("");
    try {
      await removeStoreCourier(session.accessToken, store.id, member.id);
      setMembers((current) => current.filter((item) => item.id !== member.id));
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel remover o motoboy.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <PageHeader
        action={<TeamCount online={onlineCount} total={members.length} />}
        eyebrow="Entrega da loja"
        subtitle="Organize os profissionais fixos que sua operacao chama com mais frequencia."
        title="Equipe de motoboys"
      />

      <View style={styles.storeStrip}>
        <View style={styles.storeIcon}><Ionicons color={colors.primaryDark} name="storefront-outline" size={20} /></View>
        <View style={styles.copy}>
          <Text style={styles.storeLabel}>EQUIPE DE</Text>
          <Text numberOfLines={1} style={styles.storeName}>{store?.name ?? "Sua loja"}</Text>
        </View>
        <Pressable onPress={() => navigation.navigate("StoreCourierRequest", { store })} style={({ pressed }) => [styles.callShortcut, pressed && styles.pressed]}>
          <Ionicons color={colors.card} name="navigate-outline" size={16} />
          <Text style={styles.callShortcutText}>Chamar</Text>
        </Pressable>
      </View>

      <View style={styles.addCard}>
        <View style={styles.addHeader}>
          <View style={styles.addIcon}><Ionicons color={colors.primaryDark} name="person-add-outline" size={20} /></View>
          <View style={styles.copy}>
            <Text style={styles.addTitle}>Adicionar motoboy</Text>
            <Text style={styles.addText}>Use o mesmo telefone que ele cadastrou no perfil de entrega.</Text>
          </View>
        </View>
        <AppInput
          icon="call-outline"
          keyboardType="phone-pad"
          label="Telefone do motoboy"
          maxLength={16}
          onChangeText={(value) => setPhone(formatPhone(value))}
          placeholder="(83) 99999-9999"
          value={phone}
        />
        <AppButton
          disabled={phone.replace(/\D/g, "").length < 10}
          icon="add-circle-outline"
          loading={adding}
          onPress={addMember}
          title="Adicionar a equipe"
        />
      </View>

      {error ? <StatePanel danger icon="alert-circle-outline" text={error} /> : null}
      {loading ? <StatePanel icon="people-outline" loading text="Carregando equipe de entrega..." /> : null}

      {!loading ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}><Ionicons color={colors.primaryDark} name="people-outline" size={18} /></View>
            <View style={styles.copy}>
              <Text style={styles.sectionTitle}>Motoboys cadastrados</Text>
              <Text style={styles.sectionText}>Online aparece primeiro ao chamar uma corrida.</Text>
            </View>
          </View>

          {members.length ? (
            <View style={styles.list}>
              {sortedMembers.map((member) => (
                <TeamMemberCard
                  key={member.id}
                  loading={removingId === member.id}
                  member={member}
                  onRemove={() => confirmRemove(member)}
                />
              ))}
            </View>
          ) : (
            <StatePanel icon="bicycle-outline" text="Adicione pelo telefone depois que o profissional concluir o cadastro de motoboy no app." title="Equipe ainda vazia" />
          )}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function TeamCount({ online, total }) {
  return <View style={styles.teamCount}><View style={styles.onlineDot} /><Text style={styles.teamCountText}>{online}/{total} online</Text></View>;
}

function TeamMemberCard({ loading, member, onRemove }) {
  const courier = member.courier;
  return (
    <View style={[styles.memberCard, courier.isAvailable && styles.memberCardOnline]}>
      <View style={styles.memberTopline}>
        <View style={styles.avatar}>
          {courier.photoUrl
            ? <Image source={{ uri: resolveMediaUrl(courier.photoUrl) }} style={styles.avatarImage} />
            : <Ionicons color={colors.primaryDark} name="person-outline" size={21} />}
        </View>
        <View style={styles.copy}>
          <View style={styles.nameLine}>
            <Text numberOfLines={1} style={styles.memberName}>{courier.displayName}</Text>
            <View style={[styles.statusPill, courier.isAvailable && styles.statusPillOnline]}>
              <View style={[styles.statusDot, courier.isAvailable && styles.statusDotOnline]} />
              <Text style={[styles.statusText, courier.isAvailable && styles.statusTextOnline]}>{courier.isAvailable ? "Disponivel" : courier.isBusy ? "Em corrida" : "Offline"}</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={styles.memberVehicle}>{courier.vehicleModel} - {courier.color} - {courier.plate}</Text>
        </View>
        <Pressable accessibilityLabel={`Remover ${courier.displayName}`} disabled={loading} onPress={onRemove} style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
          {loading ? <ActivityIndicator color={colors.danger} size="small" /> : <Ionicons color={colors.danger} name="trash-outline" size={18} />}
        </Pressable>
      </View>
      <View style={styles.memberFacts}>
        <Fact icon="navigate-outline" text={`${courier.serviceRadiusKm} km`} />
        <Fact icon="star" text={courier.rating ? courier.rating.toFixed(1) : "Novo"} />
        <Fact icon="checkmark-done-outline" text={`${courier.totalDeliveries} entregas`} />
      </View>
    </View>
  );
}

function Fact({ icon, text }) {
  return <View style={styles.fact}><Ionicons color={colors.primaryDark} name={icon} size={13} /><Text style={styles.factText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  addCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.lg, padding: spacing.lg, ...shadowSoft },
  addHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  addIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  addText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  addTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  avatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", overflow: "hidden", width: 44 },
  avatarImage: { height: "100%", width: "100%" },
  callShortcut: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.lg, flexDirection: "row", gap: 5, minHeight: 38, paddingHorizontal: spacing.md },
  callShortcutText: { color: colors.card, fontFamily: fonts.bold, fontSize: 11 },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  fact: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  factText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 10 },
  list: { gap: spacing.sm },
  memberCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md },
  memberCardOnline: { borderColor: colors.primaryLight },
  memberFacts: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  memberName: { color: colors.textPrimary, flex: 1, fontFamily: fonts.extraBold, fontSize: typography.small },
  memberTopline: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  memberVehicle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  nameLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  onlineDot: { backgroundColor: colors.success, borderRadius: radius.round, height: 7, width: 7 },
  pressed: { opacity: 0.78 },
  removeButton: { alignItems: "center", backgroundColor: colors.dangerSoft, borderRadius: radius.round, height: 36, justifyContent: "center", width: 36 },
  section: { gap: spacing.md },
  sectionHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  sectionIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  sectionText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  sectionTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  statusDot: { backgroundColor: colors.textMuted, borderRadius: radius.round, height: 6, width: 6 },
  statusDotOnline: { backgroundColor: colors.success },
  statusPill: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: 7, paddingVertical: 3 },
  statusPillOnline: { backgroundColor: colors.primarySoft },
  statusText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 9 },
  statusTextOnline: { color: colors.primaryDark },
  storeIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 42, justifyContent: "center", width: 42 },
  storeLabel: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9 },
  storeName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  storeStrip: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  teamCount: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  teamCountText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10 },
});
