import Ionicons from "@expo/vector-icons/Ionicons";
import { useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { colors, radius, shadowSoft } from "../utils/theme";

export function CartAddButton({ direction = "down", name = "produto", onPress, size = 34, style }) {
  const flight = useRef(new Animated.Value(0)).current;

  function add(event) {
    onPress?.({
      pageX: event?.nativeEvent?.pageX,
      pageY: event?.nativeEvent?.pageY,
    });
    flight.stopAnimation();
    flight.setValue(0);
    Animated.timing(flight, {
      duration: 560,
      toValue: 1,
      useNativeDriver: true,
    }).start(() => flight.setValue(0));
  }

  const distanceY = direction === "up" ? -92 : 92;

  return (
    <View style={[styles.shell, { height: size, width: size }, style]}>
      <Pressable
        accessibilityLabel={`Adicionar ${name} ao carrinho`}
        accessibilityRole="button"
        hitSlop={7}
        onPress={add}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons color={colors.card} name="add" size={Math.round(size * 0.58)} />
      </Pressable>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.flyingDot,
          {
            opacity: flight.interpolate({ inputRange: [0, 0.12, 0.82, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: flight.interpolate({ inputRange: [0, 1], outputRange: [0, 48] }) },
              { translateY: flight.interpolate({ inputRange: [0, 1], outputRange: [0, distanceY] }) },
              { scale: flight.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0.35] }) },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    height: "100%",
    justifyContent: "center",
    width: "100%",
    ...shadowSoft,
  },
  flyingDot: {
    backgroundColor: colors.primary,
    borderColor: colors.card,
    borderRadius: radius.round,
    borderWidth: 2,
    height: 15,
    position: "absolute",
    right: 5,
    top: 5,
    width: 15,
    zIndex: 20,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.92 }] },
  shell: { overflow: "visible", position: "relative" },
});
