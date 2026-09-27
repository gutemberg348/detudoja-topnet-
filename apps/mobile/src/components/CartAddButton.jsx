import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadowSoft } from "../utils/theme";

export function CartAddButton({ name = "produto", onDecrease, onPress, quantity = 0, size = 34, style }) {
  function add(event) {
    onPress?.({
      pageX: event?.nativeEvent?.pageX,
      pageY: event?.nativeEvent?.pageY,
    });
  }

  const currentQuantity = Math.max(0, Number(quantity) || 0);

  if (currentQuantity > 0) {
    return (
      <View
        style={[
          styles.stepper,
          { height: size, minWidth: Math.max(78, Math.round(size * 2.55)) },
          style,
        ]}
      >
        <Pressable
          accessibilityLabel={`Diminuir quantidade de ${name}`}
          accessibilityRole="button"
          hitSlop={5}
          onPress={onDecrease}
          style={({ pressed }) => [styles.stepperAction, pressed && styles.pressed]}
        >
          <Ionicons color={colors.card} name="remove" size={Math.round(size * 0.5)} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.quantity, { fontSize: Math.max(12, Math.round(size * 0.38)) }]}>
          {currentQuantity}
        </Text>
        <Pressable
          accessibilityLabel={`Adicionar mais um ${name}`}
          accessibilityRole="button"
          hitSlop={5}
          onPress={add}
          style={({ pressed }) => [styles.stepperAction, pressed && styles.pressed]}
        >
          <Ionicons color={colors.card} name="add" size={Math.round(size * 0.5)} />
        </Pressable>
      </View>
    );
  }

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
  pressed: { opacity: 0.82, transform: [{ scale: 0.92 }] },
  quantity: {
    color: colors.card,
    fontWeight: "800",
    minWidth: 20,
    textAlign: "center",
  },
  shell: { overflow: "visible", position: "relative" },
  stepper: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    flexDirection: "row",
    justifyContent: "space-between",
    overflow: "hidden",
    ...shadowSoft,
  },
  stepperAction: {
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
    minWidth: 28,
    paddingHorizontal: 5,
  },
});
