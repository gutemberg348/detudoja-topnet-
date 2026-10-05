import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { resolveMediaUrl } from "../utils/media";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function MarketplaceCategoryCard({ active, category, icon, label, onPress }) {
  const iconUrl = resolveMediaUrl(category?.iconUrl);

  return (
    <Pressable
      accessibilityLabel={`Filtrar por ${label}`}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      onPress={onPress}
      style={({ pressed }) => [styles.card, active && styles.cardActive, pressed && styles.pressed]}
    >
      <View collapsable={false} style={[styles.icon, active && styles.iconActive]}>
        {/* Selection must not reset the image. A new URL gets its own load state. */}
        <CategoryArtwork key={iconUrl ?? "fallback"} uri={iconUrl} icon={icon ?? "storefront-outline"} />
      </View>
      <Text numberOfLines={2} style={[styles.label, active && styles.labelActive]}>{label}</Text>
      {active ? (
        <View style={styles.check}>
          <Ionicons color={colors.primaryDark} name="checkmark" size={12} />
        </View>
      ) : null}
    </Pressable>
  );
}

const CategoryArtwork = memo(function CategoryArtwork({ uri, icon }) {
  const source = useMemo(() => uri ? { uri } : null, [uri]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <>
      <View pointerEvents="none" style={[styles.fallback, loaded && !failed && styles.fallbackHidden]}>
        <Ionicons color={colors.primaryDark} name={icon} size={24} />
      </View>
      {source && !failed ? (
        <Image
          accessible={false}
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
          resizeMode="contain"
          source={source}
          // Always visible and in the same bounds, including native cache hits.
          style={styles.image}
        />
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  card: {
    alignItems: "center", backgroundColor: colors.card, borderColor: colors.border,
    borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, height: 96,
    justifyContent: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    position: "relative", width: 88,
  },
  cardActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  icon: {
    alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round,
    height: 38, justifyContent: "center", overflow: "hidden", width: 38,
  },
  iconActive: { backgroundColor: colors.card, borderColor: colors.primary, borderWidth: 1 },
  image: { ...StyleSheet.absoluteFill },
  fallback: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  fallbackHidden: { opacity: 0 },
  label: {
    color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption,
    fontWeight: "700", lineHeight: 15, maxWidth: "100%", minHeight: 30, textAlign: "center",
  },
  labelActive: { color: colors.primaryDark },
  check: {
    alignItems: "center", backgroundColor: colors.card, borderColor: colors.primarySoft,
    borderRadius: radius.round, borderWidth: 2, height: 22, justifyContent: "center",
    position: "absolute", right: 5, top: 5, width: 22,
  },
  pressed: { opacity: 0.78 },
});
