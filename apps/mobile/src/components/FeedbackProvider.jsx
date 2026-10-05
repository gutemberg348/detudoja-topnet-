import Ionicons from "@expo/vector-icons/Ionicons";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, shadow, spacing } from "../utils/theme";

const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const { session } = useAuthStore();
  const [notice, setNotice] = useState(null);
  const sequence = useRef(0);
  const notify = useCallback((title, message = "", tone = "success") => {
    setNotice({ id: ++sequence.current, title, message, tone });
  }, []);
  const dismiss = useCallback(() => setNotice(null), []);

  useEffect(() => { dismiss(); }, [dismiss, session?.user?.id]);
  useEffect(() => {
    if (!notice) return undefined;
    // Give people time to read longer messages and dismiss them explicitly.
    const timer = setTimeout(() => setNotice((current) => current?.id === notice.id ? null : current), 7000);
    AccessibilityInfo.announceForAccessibility?.([notice.title, notice.message].filter(Boolean).join(". "));
    return () => clearTimeout(timer);
  }, [notice]);

  const value = useMemo(() => ({ dismiss, notice, notify }), [dismiss, notice, notify]);
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback precisa de FeedbackProvider");
  return value;
}

// Native Modal creates a separate surface. Mount a layer there as well when
// an action keeps the modal open (e.g. an order status or proposal).
export function FeedbackLayer() {
  const { dismiss, notice } = useFeedback();
  const insets = useSafeAreaInsets();
  if (!notice) return null;
  const color = notice.tone === "error" ? colors.danger : notice.tone === "info" ? colors.info : colors.primaryDark;
  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + spacing.sm }]}>
      <View accessibilityLiveRegion="polite" style={[styles.notice, { borderLeftColor: color }]}>
        <Ionicons color={color} name={notice.tone === "error" ? "alert-circle-outline" : notice.tone === "info" ? "information-circle-outline" : "checkmark-circle-outline"} size={24} />
        <View style={styles.copy}>
          <Text style={styles.title}>{notice.title}</Text>
          {notice.message ? <Text style={styles.message}>{notice.message}</Text> : null}
        </View>
        <Pressable accessibilityLabel="Fechar aviso" accessibilityRole="button" onPress={dismiss} style={styles.close}>
          <Ionicons color={colors.textSecondary} name="close" size={20} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { alignItems: "center", left: 0, paddingHorizontal: spacing.md, position: "absolute", right: 0, zIndex: 10000, elevation: 30 },
  notice: { alignItems: "flex-start", backgroundColor: colors.card, borderColor: colors.border, borderLeftWidth: 4, borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: spacing.sm, maxWidth: 540, padding: spacing.md, width: "100%", ...shadow },
  copy: { flex: 1, gap: 4, minWidth: 0 },
  title: { color: colors.textPrimary, fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 20 },
  message: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  close: { alignItems: "center", justifyContent: "center", minHeight: 44, width: 44, marginRight: -8, marginTop: -8 },
});
