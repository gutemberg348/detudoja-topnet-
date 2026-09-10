import { Image, StyleSheet, View } from "react-native";

const logoSource = require("../../assets/brasil-cashback-logo.png");

const sizes = {
  compact: { height: 90, width: 180 },
  large: { height: 220, width: 320 },
  regular: { height: 150, width: 240 },
};

export function BrandLogo({ centered = false, iconOnly = false, size = "regular" }) {
  const dimensions = sizes[iconOnly ? "compact" : size] ?? sizes.regular;

  return (
    <View
      accessibilityLabel="Brasil Cashback"
      style={[
        styles.frame,
        dimensions,
        centered && styles.centered,
      ]}
    >
      <Image
        resizeMode="contain"
        source={logoSource}
        style={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignSelf: "center",
  },
  frame: {
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  image: {
    height: "100%",
    transform: [{ scale: 1.35 }],
    width: "100%",
  },
});
