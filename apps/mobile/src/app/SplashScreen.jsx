import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { BrandLogo } from "../components/BrandLogo";
import { colors, fonts, spacing, typography } from "../utils/theme";

export function SplashScreen() {
  return (
    <View style={styles.screen}>
      <BrandLogo centered size="large" />
      <Text style={styles.slogan}>Compre, venda e ganhe cashback.</Text>
      <ActivityIndicator color={colors.primary} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginTop: spacing.xxl,
  },
  screen: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  slogan: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    marginTop: spacing.md,
    textAlign: "center",
  },
});
