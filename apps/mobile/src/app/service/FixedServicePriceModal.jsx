import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../../components/AppButton";
import { AppInput } from "../../components/AppInput";
import { formatarDinheiro } from "../../utils/money";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../../utils/theme";

function moneyInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 9);
  if (!digits) return "";
  return (Number(digits) / 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function inputToCents(value) {
  return Number(String(value ?? "").replace(/\D/g, "")) || 0;
}

export function FixedServicePriceModal({ error, loading, onClose, onSubmit, open, service }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(service?.priceCents ? moneyInput(service.priceCents) : "");
  }, [open, service?.id, service?.priceCents]);

  const priceCents = useMemo(() => inputToCents(value), [value]);

  return (
    <Modal animationType="slide" onRequestClose={loading ? undefined : onClose} transparent visible={open}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
        <Pressable disabled={loading} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.icon}><Ionicons color={colors.primaryDark} name="pricetag-outline" size={23} /></View>
            <View style={styles.copy}>
              <Text style={styles.eyebrow}>SERVICO COM PRECO FIXO</Text>
              <Text style={styles.title}>{service?.name ?? "Definir preco"}</Text>
              <Text style={styles.subtitle}>Este valor aparece antes do cliente chamar voce e nao pode ser alterado durante o atendimento.</Text>
            </View>
            <Pressable accessibilityLabel="Fechar" disabled={loading} onPress={onClose} style={styles.close}>
              <Ionicons color={colors.textPrimary} name="close" size={21} />
            </Pressable>
          </View>

          <View style={styles.notice}>
            <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={19} />
            <Text style={styles.noticeText}>O cliente recebera uma proposta automatica de {priceCents >= 100 ? formatarDinheiro(priceCents) : "valor definido"} quando voce aceitar o chamado.</Text>
          </View>
          <AppInput
            autoFocus
            error={priceCents > 0 && priceCents < 100 ? "O valor minimo e R$ 1,00" : undefined}
            icon="cash-outline"
            keyboardType="number-pad"
            label="Preco do servico"
            onChangeText={(next) => setValue(moneyInput(next))}
            placeholder="0,00"
            value={value}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <AppButton disabled={loading} onPress={onClose} style={styles.action} title="Cancelar" variant="neutral" />
            <AppButton disabled={priceCents < 100} icon="checkmark-circle-outline" loading={loading} onPress={() => onSubmit(priceCents)} style={styles.action} title={service?.enabled ? "Salvar preco" : "Salvar e ativar"} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.md },
  close: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption },
  eyebrow: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10 },
  handle: { alignSelf: "center", backgroundColor: colors.borderStrong, borderRadius: radius.round, height: 4, marginBottom: spacing.md, width: 42 },
  header: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  icon: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.md, borderWidth: 1, height: 46, justifyContent: "center", width: 46 },
  notice: { alignItems: "flex-start", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, padding: spacing.md },
  noticeText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption, lineHeight: 18 },
  overlay: { backgroundColor: "rgba(20,32,25,0.42)", flex: 1, justifyContent: "flex-end" },
  sheet: { alignSelf: "center", backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxWidth: 560, padding: spacing.lg, width: "100%", ...shadowSoft },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2 },
});
