import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { memo, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { resolveMediaUrl } from "../utils/media";
import { colors, fonts, radius, spacing } from "../utils/theme";

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
  const [displayed, setDisplayed] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <>
      {!displayed || failed ? (
        <View pointerEvents="none" style={styles.fallback}>
          <Ionicons color={colors.primaryDark} name={icon} size={21} />
        </View>
      ) : null}
      {source && !failed ? (
        <Image
          accessible={false}
          cachePolicy="memory-disk"
          contentFit="contain"
          onDisplay={() => setDisplayed(true)}
          onError={() => setFailed(true)}
          recyclingKey={uri}
          source={source}
          transition={0}
          // Keep native bounds explicit; selection never fades/clips the bitmap.
          style={styles.image}
        />
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  card: {
    alignItems: "center", backgroundColor: colors.card, borderColor: colors.border,
    borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, minHeight: 80,
    justifyContent: "center", paddingHorizontal: 5, paddingVertical: 6,
    position: "relative", width: 72,
  },
  cardActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  icon: {
    alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round,
    borderColor: "transparent", borderWidth: 1,
    height: 34, justifyContent: "center", width: 34,
  },
  iconActive: { backgroundColor: colors.card, borderColor: colors.primary },
  image: { height: 32, width: 32 },
  fallback: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  label: {
    color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 11,
    fontWeight: "700", lineHeight: 14, maxWidth: "100%", minHeight: 28, textAlign: "center",
  },
  labelActive: { color: colors.primaryDark },
  check: {
    alignItems: "center", backgroundColor: colors.card, borderColor: colors.primarySoft,
    borderRadius: radius.round, borderWidth: 1, height: 18, justifyContent: "center",
    position: "absolute", right: 2, top: 2, width: 18,
  },
  pressed: { backgroundColor: colors.primaryLight },
});
