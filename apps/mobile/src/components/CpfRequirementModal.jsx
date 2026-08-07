import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ApiError } from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { formatCpf, isValidCpf, onlyDigits } from "../utils/authValidation";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";
import { AppButton } from "./AppButton";
import { AppInput } from "./AppInput";

const reasonCopy = {
  purchase: {
    eyebrow: "Primeira compra",
    text: "O CPF identifica o titular do pagamento e protege o seu saldo. Voce informa uma vez e ele fica salvo na conta.",
    title: "Confirme seu CPF para comprar",
  },
  sale: {
    eyebrow: "Primeira operacao",
    text: "Precisamos identificar o responsavel antes da primeira venda, loja ou servico. Se o CPF ja estiver salvo, esta etapa nao aparece novamente.",
    title: "Confirme seu CPF para vender",
  },
};

export function CpfRequirementModal({
  onClose,
  onCompleted,
  open,
  reason = "purchase",
}) {
  const { completeCpf } = useAuthStore();
  const [cpf, setCpf] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = reasonCopy[reason] ?? reasonCopy.purchase;

  useEffect(() => {
    if (open) {
      setCpf("");
      setError("");
      setIsSubmitting(false);
    }
  }, [open]);

  async function handleContinue() {
    if (!isValidCpf(cpf)) {
      setError("Digite um CPF valido para continuar.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      await completeCpf(onlyDigits(cpf));
      onCompleted?.();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        setError("Este CPF ja esta vinculado a outra conta.");
      } else {
        setError(requestError.message ?? "Nao foi possivel salvar o CPF.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={isSubmitting ? undefined : onClose}
      transparent
      visible={open}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <View style={styles.modal}>
          <View style={styles.topline}>
            <View style={styles.icon}>
              <Ionicons color="#B45309" name="shield-checkmark-outline" size={25} />
            </View>
            <Pressable
              accessibilityLabel="Fechar confirmacao de CPF"
              disabled={isSubmitting}
              onPress={onClose}
              style={styles.close}
            >
              <Ionicons color={colors.textPrimary} name="close" size={21} />
            </Pressable>
          </View>

          <View style={styles.copy}>
            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.text}>{copy.text}</Text>
          </View>

          <AppInput
            autoComplete="off"
            error={error}
            icon="card-outline"
            inputMode="numeric"
            keyboardType="number-pad"
            label="CPF do titular"
            maxLength={14}
            onChangeText={(value) => {
              setCpf(formatCpf(value));
              setError("");
            }}
            onSubmitEditing={handleContinue}
            placeholder="000.000.000-00"
            returnKeyType="done"
            value={cpf}
          />

          <AppButton
            icon="checkmark-circle-outline"
            loading={isSubmitting}
            onPress={handleContinue}
            title="Salvar CPF e continuar"
          />

          <View style={styles.security}>
            <Ionicons color={colors.primaryDark} name="lock-closed-outline" size={15} />
            <Text style={styles.securityText}>
              Dado restrito, usado para seguranca e validacao da conta.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  close: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  copy: { gap: spacing.sm },
  eyebrow: {
    color: "#B45309",
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  icon: {
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderRadius: radius.round,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  modal: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    gap: spacing.lg,
    maxWidth: 460,
    padding: spacing.xl,
    width: "100%",
    ...shadow,
  },
  security: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  securityText: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  text: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 20,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
    lineHeight: 28,
  },
  topline: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
