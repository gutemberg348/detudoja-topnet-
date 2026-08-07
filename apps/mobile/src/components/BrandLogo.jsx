import { Image, StyleSheet, View } from "react-native";

const logoSource = require("../../assets/detudoja-logo-smile.png");

const sizes = {
  compact: { height: 68, width: 144 },
  large: { height: 118, width: 250 },
  regular: { height: 90, width: 190 },
};

export function BrandLogo({ centered = false, iconOnly = false, size = "regular" }) {
  const dimensions = sizes[iconOnly ? "compact" : size] ?? sizes.regular;

  return (
    <View
      accessibilityLabel="DeTudoJá"
      style={[
        styles.frame,
        dimensions,
        centered && styles.centered,
      ]}
    >
      <Image
        resizeMode="cover"
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
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  image: {
    height: "100%",
    transform: [{ scale: 1.18 }],
    width: "100%",
  },
});
