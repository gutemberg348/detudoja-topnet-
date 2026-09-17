import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../utils/theme";

function messageTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatMessageMeta({ createdAt, isMine = false, readAt = null }) {
  const read = Boolean(readAt);
  return (
    <View style={styles.meta}>
      <Text style={[styles.time, isMine && styles.timeMine]}>{messageTime(createdAt)}</Text>
      {isMine ? (
        <Ionicons
          accessibilityLabel={read ? "Mensagem visualizada" : "Mensagem enviada"}
          color={read ? "#67E8C5" : "rgba(255,255,255,0.68)"}
          name={read ? "checkmark-done" : "checkmark"}
          size={14}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { alignItems: "center", alignSelf: "flex-end", flexDirection: "row", gap: 3, minHeight: 14 },
  time: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 9 },
  timeMine: { color: "rgba(255,255,255,0.7)" },
});
