import { Image, StyleSheet, Text, View } from "react-native";
import { resolveMediaUrl } from "../utils/media";
import { colors, fonts, radius } from "../utils/theme";

function initialsFromName(name) {
  return String(name ?? "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function ContactAvatar({ name, photoUrl, size = 46 }) {
  const resolvedPhotoUrl = resolveMediaUrl(photoUrl);
  const dynamicStyle = { height: size, width: size };

  return (
    <View style={[styles.avatar, dynamicStyle]}>
      {resolvedPhotoUrl ? (
        <Image source={{ uri: resolvedPhotoUrl }} style={styles.image} />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.max(12, Math.round(size * 0.3)) }]}>
          {initialsFromName(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.round,
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { height: "100%", width: "100%" },
  initials: { color: colors.primaryDark, fontFamily: fonts.bold },
});
