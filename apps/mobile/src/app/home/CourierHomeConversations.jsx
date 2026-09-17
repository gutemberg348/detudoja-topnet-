import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../../utils/theme";

const activeStatuses = new Set(["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"]);

const statusLabels = {
  ABERTA: "Nova corrida",
  ACORDADA: "Em atendimento",
  AGUARDANDO_CONFIRMACAO: "Aguardando cliente",
  CANCELADA: "Cancelada",
  ENCERRADA: "Concluida",
};

export function CourierHomeConversations({ conversations = [], onOpen, onViewAll }) {
  const visible = [...conversations]
    .sort((first, second) => {
      const activeDifference = Number(activeStatuses.has(second.status)) - Number(activeStatuses.has(first.status));
      if (activeDifference) return activeDifference;
      return new Date(second.updatedAt ?? 0) - new Date(first.updatedAt ?? 0);
    })
    .slice(0, 3);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headingIcon}>
          <Ionicons color={colors.card} name="bicycle" size={20} />
          <View style={styles.onlineDot} />
        </View>
        <View style={styles.headingCopy}>
          <View style={styles.titleLine}>
            <Text style={styles.title}>Servico de motoboy</Text>
            <View style={styles.onlinePill}><Text style={styles.onlineText}>ONLINE</Text></View>
          </View>
          <Text style={styles.subtitle}>Corrida atual e suas conversas recentes</Text>
        </View>
        <Pressable accessibilityLabel="Abrir central do motoboy" hitSlop={8} onPress={onViewAll} style={({ pressed }) => [styles.openDesk, pressed && styles.pressed]}>
          <Ionicons color={colors.primaryDark} name="arrow-forward" size={18} />
        </Pressable>
      </View>

      {visible.length ? (
        <View style={styles.list}>
          {visible.map((conversation, index) => {
            const active = activeStatuses.has(conversation.status);
            const unreadCount = Number(conversation.unreadCount ?? 0) || (conversation.isNewForSeller ? 1 : 0);
            const storeName = conversation.request?.store?.name;
            const title = storeName ?? conversation.otherPerson?.name ?? "Corrida de motoboy";
            const route = [conversation.request?.origin, conversation.request?.destination]
              .filter(Boolean)
              .join("  →  ");

            return (
              <Pressable
                accessibilityLabel={`Abrir corrida com ${title}`}
                key={conversation.id}
                onPress={() => onOpen(conversation)}
                style={({ pressed }) => [styles.row, active && styles.rowActive, index < visible.length - 1 && styles.rowDivider, pressed && styles.pressed]}
              >
                <View style={[styles.rideIcon, active && styles.rideIconActive]}>
                  <Ionicons color={active ? colors.card : colors.primaryDark} name={active ? "navigate" : "chatbubble-ellipses-outline"} size={18} />
                </View>
                <View style={styles.copy}>
                  <View style={styles.metaLine}>
                    <View style={[styles.serviceTag, active && styles.serviceTagActive]}>
                      <Text style={[styles.serviceTagText, active && styles.serviceTagTextActive]}>MOTOBOY</Text>
                    </View>
                    <Text style={[styles.status, active && styles.statusActive]}>{statusLabels[conversation.status] ?? "Conversa"}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.rideTitle}>{title}</Text>
                  <Text numberOfLines={1} style={styles.preview}>{conversation.lastMessage?.text || route || "Toque para abrir a conversa da corrida"}</Text>
                </View>
                {unreadCount ? (
                  <View style={styles.unread}><Text style={styles.unreadText}>{unreadCount > 9 ? "9+" : unreadCount}</Text></View>
                ) : (
                  <Ionicons color={colors.textMuted} name="chevron-forward" size={17} />
                )}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Pressable onPress={onViewAll} style={({ pressed }) => [styles.empty, pressed && styles.pressed]}>
          <View style={styles.emptyIcon}><Ionicons color={colors.primaryDark} name="radio-outline" size={19} /></View>
          <View style={styles.copy}>
            <Text style={styles.emptyTitle}>Voce esta disponivel</Text>
            <Text style={styles.emptyText}>Quando aceitar uma corrida, o chat aparecera aqui.</Text>
          </View>
          <Ionicons color={colors.primaryDark} name="chevron-forward" size={17} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, minWidth: 0 },
  empty: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.lg, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  emptyIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10, marginTop: 2 },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  header: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  headingCopy: { flex: 1, minWidth: 0 },
  headingIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 44, justifyContent: "center", position: "relative", width: 44 },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden" },
  metaLine: { alignItems: "center", flexDirection: "row", gap: spacing.xs, marginBottom: 3 },
  onlineDot: { backgroundColor: colors.success, borderColor: colors.card, borderRadius: radius.round, borderWidth: 2, bottom: 0, height: 12, position: "absolute", right: 0, width: 12 },
  onlinePill: { backgroundColor: colors.successSoft ?? colors.primarySoft, borderRadius: radius.round, paddingHorizontal: 7, paddingVertical: 3 },
  onlineText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 8 },
  openDesk: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  pressed: { opacity: 0.72 },
  preview: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10, marginTop: 3 },
  rideIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  rideIconActive: { backgroundColor: colors.primaryDark },
  rideTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 76, padding: spacing.md },
  rowActive: { backgroundColor: colors.primarySoft },
  rowDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  section: { alignSelf: "stretch", backgroundColor: colors.backgroundSoft, borderColor: colors.primaryLight, borderRadius: 14, borderWidth: 1, gap: spacing.md, padding: spacing.md, width: "100%", ...shadowSoft },
  serviceTag: { backgroundColor: colors.cardMuted, borderRadius: radius.round, paddingHorizontal: 6, paddingVertical: 2 },
  serviceTagActive: { backgroundColor: colors.primaryDark },
  serviceTagText: { color: colors.textSecondary, fontFamily: fonts.extraBold, fontSize: 7 },
  serviceTagTextActive: { color: colors.card },
  status: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 8 },
  statusActive: { color: colors.primaryDark },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10, marginTop: 2 },
  title: { color: colors.textPrimary, flexShrink: 1, fontFamily: fonts.extraBold, fontSize: typography.label },
  titleLine: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  unread: { alignItems: "center", backgroundColor: colors.warning, borderRadius: radius.round, height: 22, justifyContent: "center", minWidth: 22, paddingHorizontal: 5 },
  unreadText: { color: "#4A2B00", fontFamily: fonts.extraBold, fontSize: 9 },
});
