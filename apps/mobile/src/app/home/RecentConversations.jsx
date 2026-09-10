import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../../utils/theme";

function formatConversationDate(value) {
  const date = new Date(value ?? Date.now());
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function RecentConversations({
  actionLabel = "Ver todas",
  conversations,
  isLoading,
  onOpen,
  onViewAll,
}) {
  if (isLoading || conversations.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Ultimas conversas</Text>
        </View>
        <Pressable
          accessibilityLabel={actionLabel}
          hitSlop={10}
          onPress={onViewAll}
          style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}
        >
          <Text style={styles.viewAllText}>{actionLabel}</Text>
          <Ionicons color={colors.primaryDark} name="chevron-forward" size={15} />
        </Pressable>
      </View>

      <View style={styles.list}>
        {conversations.map((conversation, index) => (
          <Pressable
            accessibilityLabel={`Abrir conversa com ${conversation.title}`}
            key={conversation.id}
            onPress={() => onOpen(conversation)}
            style={({ pressed }) => [
              styles.row,
              index < conversations.length - 1 && styles.rowDivider,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.icon}>
              <Ionicons
                color={colors.primaryDark}
                name={
                  conversation.kind === "service"
                    ? "briefcase-outline"
                    : conversation.kind === "person"
                      ? "person-outline"
                    : conversation.kind === "store"
                      ? "chatbubbles-outline"
                      : "receipt-outline"
                }
                size={19}
              />
            </View>
            <View style={styles.copy}>
              <View style={styles.titleRow}>
                <Text numberOfLines={1} style={styles.conversationTitle}>
                  {conversation.title}
                </Text>
                <Text style={styles.date}>{formatConversationDate(conversation.date)}</Text>
              </View>
            </View>
            {conversation.unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
                </Text>
              </View>
            ) : (
              <Ionicons color={colors.textMuted} name="chevron-forward" size={17} />
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  conversationTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: typography.small,
    fontWeight: "600",
  },
  copy: { flex: 1, minWidth: 0 },
  date: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
  },
  heading: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  headingCopy: { flex: 1, minWidth: 0 },
  icon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  list: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  pressed: { opacity: 0.65 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 58,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowPressed: {
    backgroundColor: colors.primarySoft,
  },
  section: {
    alignSelf: "stretch",
    gap: spacing.md,
    width: "100%",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.label,
    fontWeight: "700",
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  unreadBadge: {
    alignItems: "center",
    backgroundColor: colors.warning,
    borderRadius: radius.round,
    height: 21,
    justifyContent: "center",
    minWidth: 21,
    paddingHorizontal: 5,
  },
  unreadText: {
    color: "#4A2B00",
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: "700",
  },
  viewAll: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    minHeight: 30,
  },
  viewAllText: {
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
    fontSize: typography.caption,
    fontWeight: "600",
  },
});
