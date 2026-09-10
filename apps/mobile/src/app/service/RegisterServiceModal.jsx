import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { AppButton } from "../../components/AppButton";
import { AppInput } from "../../components/AppInput";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../../utils/theme";

const initialForm = { available: true, description: "", name: "" };

export function RegisterServiceModal({ error, loading, onClose, onSubmit, open }) {
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (open) setForm(initialForm);
  }, [open]);

  const valid = useMemo(() => form.name.trim().length >= 3, [form.name]);

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons color={colors.primaryDark} name="add-circle-outline" size={24} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>NOVO SERVICO</Text>
              <Text style={styles.title}>O que voce faz?</Text>
              <Text style={styles.subtitle}>Descreva seu trabalho. Reutilizamos um servico parecido quando ele ja existir.</Text>
            </View>
            <Pressable accessibilityLabel="Fechar cadastro de servico" onPress={onClose} style={styles.close}>
              <Ionicons color={colors.textPrimary} name="close" size={21} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.example}>
              <Ionicons color={colors.primaryDark} name="sparkles-outline" size={18} />
              <Text style={styles.exampleText}>Exemplos: Capinador de lote, Limpador de mato, Eletricista residencial.</Text>
            </View>
            <AppInput
              autoCapitalize="sentences"
              icon="briefcase-outline"
              label="Servico que voce presta"
              maxLength={120}
              onChangeText={(value) => change("name", value)}
              placeholder="Ex.: Capinador de lote"
              value={form.name}
            />
            <AppInput
              autoCapitalize="sentences"
              icon="document-text-outline"
              label="Detalhes para o cliente"
              maxLength={500}
              multiline
              onChangeText={(value) => change("description", value)}
              placeholder="Conte em poucas palavras como voce atende"
              value={form.description}
            />
            <View style={styles.availabilityRow}>
              <View style={styles.availabilityIcon}><Ionicons color={colors.primaryDark} name="radio-outline" size={19} /></View>
              <View style={styles.availabilityCopy}>
                <Text style={styles.availabilityTitle}>Ficar disponivel agora</Text>
                <Text style={styles.availabilityText}>Clientes da sua cidade poderao chamar voce pelo chat.</Text>
              </View>
              <Switch
                onValueChange={(value) => change("available", value)}
                thumbColor={colors.card}
                trackColor={{ false: colors.borderStrong, true: colors.primary }}
                value={form.available}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <AppButton disabled={loading} onPress={onClose} style={styles.action} title="Cancelar" variant="neutral" />
              <AppButton disabled={!valid} icon="checkmark-circle-outline" loading={loading} onPress={() => onSubmit({ ...form, name: form.name.trim(), description: form.description.trim() })} style={styles.action} title="Cadastrar servico" />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.sm },
  availabilityCopy: { flex: 1, gap: 2, minWidth: 0 },
  availabilityIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  availabilityRow: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  availabilityText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  availabilityTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  close: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption },
  example: { alignItems: "flex-start", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  exampleText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption, lineHeight: 17 },
  eyebrow: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  form: { gap: spacing.lg, paddingBottom: spacing.xxl },
  handle: { alignSelf: "center", backgroundColor: colors.borderStrong, borderRadius: radius.round, height: 4, marginBottom: spacing.md, width: 42 },
  header: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  headerCopy: { flex: 1, gap: 3, minWidth: 0 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.md, borderWidth: 1, height: 46, justifyContent: "center", width: 46 },
  overlay: { backgroundColor: "rgba(20,32,25,0.42)", flex: 1, justifyContent: "flex-end" },
  sheet: { alignSelf: "center", backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "94%", maxWidth: 560, padding: spacing.lg, width: "100%", ...shadowSoft },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, fontWeight: "800" },
});
