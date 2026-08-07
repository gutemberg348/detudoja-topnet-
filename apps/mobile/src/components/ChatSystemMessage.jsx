import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function ChatSystemMessage({ icon = "information-circle-outline", text, time, title }) {
  return (
    <View style={styles.message}>
      <View style={styles.icon}>
        <Ionicons color={colors.primaryDark} name={icon} size={14} />
      </View>
      <View style={styles.copy}>
        <View style={styles.heading}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        {text ? <Text style={styles.text}>{text}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  heading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  icon: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  message: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#F1F8F4",
    borderColor: colors.primaryLight,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: "94%",
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    width: "100%",
  },
  text: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 16,
  },
  time: {
    color: colors.textWeak,
    fontFamily: fonts.medium,
    fontSize: 9,
  },
  title: {
    color: colors.primaryDark,
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
