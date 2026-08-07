import { StyleSheet, View } from "react-native";
import { spacing } from "../utils/theme";
import { AppButton } from "./AppButton";

const providers = [
  { icon: "logo-google", key: "google", label: "Google" },
  { icon: "logo-apple", key: "apple", label: "Apple" },
];

export function SocialAuthButtons({ action = "Entrar" }) {
  return (
    <View style={styles.wrapper}>
      {providers.map((provider) => (
        <AppButton
          icon={provider.icon}
          key={provider.key}
          onPress={() => {}}
          title={`${action} com ${provider.label}`}
          variant="neutral"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
    width: "100%",
  },
});
