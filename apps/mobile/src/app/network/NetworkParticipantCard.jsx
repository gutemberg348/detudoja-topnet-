import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../../utils/theme";
import {
  connectionLabel,
  formatNetworkDate,
  isDirectConnection,
  personInitials,
} from "./network.utils";

const accountTypeLabels = {
  CONSUMIDOR: "Consumidor",
  LOJISTA: "Lojista",
  VENDEDOR: "Vendedor",
};

export function NetworkParticipantCard({ onPress, person, selected = false }) {
  const direct = isDirectConnection(person);
  const blocked = !person.qualified;
  const connectionColor = direct ? colors.primary : colors.info;

  return (
    <Pressable
      accessibilityHint="Abre os detalhes deste participante"
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={[styles.connector, { backgroundColor: connectionColor }]} />

      <View style={styles.topline}>
        <View style={[styles.connectionPill, direct ? styles.directPill : styles.networkPill]}>
          <Ionicons
            color={direct ? colors.primaryDark : colors.info}
            name={direct ? "link-outline" : "git-network-outline"}
            size={13}
          />
          <Text style={[styles.connectionText, direct ? styles.directText : styles.networkText]}>
            {connectionLabel(person)}
          </Text>
        </View>
        <Text style={styles.levelText}>Nivel {person.level}</Text>
      </View>

      <View style={styles.memberRow}>
        <View style={[styles.avatarRing, direct ? styles.avatarRingDirect : styles.avatarRingNetwork]}>
          <View style={[styles.avatar, !person.active && styles.avatarInactive]}>
            <Text style={styles.avatarText}>{personInitials(person.name)}</Text>
          </View>
          <View style={[styles.stateBadge, blocked ? styles.stateBadgeLocked : styles.stateBadgeReady]}>
            <Ionicons
              color={colors.card}
              name={blocked ? "lock-closed" : "checkmark"}
              size={11}
            />
          </View>
        </View>

        <View style={styles.memberCopy}>
          <Text numberOfLines={1} style={styles.memberName}>{person.name}</Text>
          <Text numberOfLines={1} style={styles.memberMeta}>
            {accountTypeLabels[person.accountType] ?? person.accountType}
            {person.branch ? ` - ${person.branch === "ESQUERDA" ? "Esquerda" : "Direita"}` : ""}
          </Text>
        </View>

        <Ionicons
          color={selected ? colors.primaryDark : colors.textMuted}
          name={selected ? "chevron-up" : "chevron-down"}
          size={20}
        />
      </View>

      <View style={styles.statusRow}>
        <StatusItem active={person.active} label={person.active ? "Ativo" : "Inativo"} />
        <StatusItem active={person.verified} label={person.verified ? "KYC ok" : "KYC pendente"} />
        <StatusItem active={person.qualified} label={person.qualified ? "Apto a ganhos" : "Ganho bloqueado"} />
      </View>

      {selected ? <ParticipantDetails person={person} /> : null}
    </Pressable>
  );
}

function StatusItem({ active, label }) {
  return (
    <View style={[styles.statusItem, active ? styles.statusItemActive : styles.statusItemPending]}>
      <View style={[styles.statusDot, active ? styles.statusDotActive : styles.statusDotPending]} />
      <Text style={[styles.statusText, active ? styles.statusTextActive : styles.statusTextPending]}>
        {label}
      </Text>
    </View>
  );
}

function ParticipantDetails({ person }) {
  return (
    <View style={styles.details}>
      <Detail icon="person-outline" label="Patrocinador direto" value={person.directSponsorName || "Brasil Cashback"} />
      <Detail
        icon="people-outline"
        label="Diretos qualificados"
        value={`${person.activeVerifiedDirects}/2`}
      />
      <Detail icon="calendar-outline" label="Entrada na rede" value={formatNetworkDate(person.createdAt)} />
      <Detail
        icon={person.reward?.direct ? "flash-outline" : "git-network-outline"}
        label="Tipo de ganho"
        value={person.reward?.direct ? "Indicacao direta" : "Ganho de rede"}
      />
    </View>
  );
}

function Detail({ icon, label, value }) {
  return (
    <View style={styles.detail}>
      <Ionicons color={colors.primaryDark} name={icon} size={16} />
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarInactive: { backgroundColor: colors.cardMuted },
  avatarRing: {
    alignItems: "center",
    borderRadius: radius.round,
    borderWidth: 2,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  avatarRingDirect: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight },
  avatarRingNetwork: { backgroundColor: colors.infoSoft, borderColor: "#BFDBFE" },
  avatarText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    overflow: "hidden",
    padding: spacing.lg,
    position: "relative",
    ...shadowSoft,
  },
  cardSelected: { backgroundColor: "#FBFFFC", borderColor: colors.primary, borderWidth: 1.5 },
  connectionPill: {
    alignItems: "center",
    borderRadius: radius.round,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  connectionText: { fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  connector: { borderRadius: radius.round, bottom: spacing.lg, left: 0, position: "absolute", top: spacing.lg, width: 3 },
  detail: { alignItems: "center", flexDirection: "row", gap: spacing.sm, width: "48%" },
  detailCopy: { flex: 1, gap: 2, minWidth: 0 },
  detailLabel: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10 },
  detailValue: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  details: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  directPill: { backgroundColor: colors.primarySoft },
  directText: { color: colors.primaryDark },
  levelText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  memberCopy: { flex: 1, gap: 3, minWidth: 0 },
  memberMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  memberName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
  memberRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  networkPill: { backgroundColor: colors.infoSoft },
  networkText: { color: colors.info },
  stateBadge: {
    alignItems: "center",
    borderColor: colors.card,
    borderRadius: radius.round,
    borderWidth: 2,
    bottom: -3,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: -4,
    width: 20,
  },
  stateBadgeLocked: { backgroundColor: "#64748B" },
  stateBadgeReady: { backgroundColor: colors.primary },
  statusDot: { borderRadius: radius.round, height: 5, width: 5 },
  statusDotActive: { backgroundColor: colors.primary },
  statusDotPending: { backgroundColor: colors.warning },
  statusItem: { alignItems: "center", borderRadius: radius.round, flexDirection: "row", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  statusItemActive: { backgroundColor: colors.primarySoft },
  statusItemPending: { backgroundColor: colors.warningSoft },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  statusText: { fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  statusTextActive: { color: colors.primaryDark },
  statusTextPending: { color: "#9A6700" },
  topline: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingLeft: spacing.xs },
});
