import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, layout, spacing } from "../utils/theme";

export function ScreenContainer({
  children,
  contentContainerStyle,
  edges = ["top", "left", "right"],
  keyboardAvoiding = true,
  keyboardVerticalOffset = 0,
  onContentSizeChange,
  padded = true,
  scroll = true,
  scrollEnabled = true,
  scrollViewRef,
  style,
}) {
  const contentStyle = [styles.contentWidth, padded && styles.padded, contentContainerStyle];
  const content = scroll ? (
    <ScrollView
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      onContentSizeChange={onContentSizeChange}
      ref={scrollViewRef}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={false}
      style={styles.scroll}
    >
      <View style={contentStyle}>{children}</View>
    </ScrollView>
  ) : (
    <View style={styles.staticShell}>
      <View style={[...contentStyle, styles.staticContent]}>{children}</View>
    </View>
  );

  const safeContent = (
    <SafeAreaView edges={edges} style={[styles.safeArea, style]}>
      {content}
    </SafeAreaView>
  );

  return keyboardAvoiding ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={styles.keyboard}
    >
      {safeContent}
    </KeyboardAvoidingView>
  ) : (
    <View style={styles.keyboard}>{safeContent}</View>
  );
}

const styles = StyleSheet.create({
  contentWidth: {
    alignSelf: "center",
    flexGrow: 1,
    maxWidth: layout.contentMaxWidth,
    minWidth: 0,
    width: "100%",
    ...Platform.select({
      web: {
        boxSizing: "border-box",
      },
    }),
  },
  keyboard: {
    flex: 1,
  },
  padded: {
    padding: spacing.lg,
  },
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  staticContent: {
    flex: 1,
  },
  scroll: {
    width: "100%",
  },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
  },
  staticShell: {
    flex: 1,
    width: "100%",
  },
});
