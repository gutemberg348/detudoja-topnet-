import Ionicons from "@expo/vector-icons/Ionicons";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton } from "../../components/AppButton";
import { AppInput } from "../../components/AppInput";
import { isValidCpf } from "../../utils/authValidation";
import { formatCnpj, isValidCnpj } from "./seller.utils";
import {
  colors,
  fonts,
  radius,
  shadowSoft,
  spacing,
  typography,
} from "../../utils/theme";

const keyTypes = [
  { icon: "person-outline", label: "CPF", value: "CPF" },
  { icon: "business-outline", label: "CNPJ", value: "CNPJ" },
  { icon: "mail-outline", label: "E-mail", value: "EMAIL" },
  { icon: "call-outline", label: "Telefone", value: "TELEFONE" },
  { icon: "key-outline", label: "Aleatoria", value: "ALEATORIA" },
];

const keyCopy = {
  ALEATORIA: {
    error: "Digite a chave aleatoria completa.",
    hint: "Codigo de 36 caracteres gerado pelo seu banco",
    placeholder: "00000000-0000-0000-0000-000000000000",
  },
  CNPJ: {
    error: "Digite um CNPJ valido.",
    hint: "Use o CNPJ cadastrado como chave Pix",
    placeholder: "00.000.000/0000-00",
  },
  CPF: {
    error: "Digite um CPF valido.",
    hint: "Use o CPF cadastrado como chave Pix",
    placeholder: "000.000.000-00",
  },
  EMAIL: {
    error: "Digite um e-mail valido.",
    hint: "Use o e-mail exato cadastrado no seu banco",
    placeholder: "nome@exemplo.com",
  },
  TELEFONE: {
    error: "Digite um celular com DDD.",
    hint: "Informe DDD e celular, sem o codigo +55",
    placeholder: "(00) 00000-0000",
  },
};

function keyKeyboard(type) {
  if (type === "CPF") return "number-pad";
  if (type === "TELEFONE") return "phone-pad";
  if (type === "EMAIL") return "email-address";
  return "default";
}

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value) {
  const digits = onlyDigits(value)
    .replace(/^55(?=\d{11}$)/, "")
    .slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatPixKey(type, value) {
  if (type === "CPF") return formatCpf(value);
  if (type === "CNPJ") return formatCnpj(value);
  if (type === "TELEFONE") return formatPhone(value);
  return String(value ?? "").replace(/\s/g, "").toLowerCase();
}

function isValidPixKey(type, value) {
  const raw = String(value ?? "").trim();
  if (type === "CPF") return isValidCpf(raw);
  if (type === "CNPJ") return isValidCnpj(raw);
  if (type === "TELEFONE") return /^[1-9]{2}9\d{8}$/.test(onlyDigits(raw));
  if (type === "EMAIL") return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}

function maskedPreview(type, value) {
  const raw = String(value ?? "");
  if (type === "EMAIL") {
    const [name = "", domain = ""] = raw.split("@");
    return domain ? `${name.slice(0, 2)}***@${domain}` : raw;
  }
  if (type === "TELEFONE") return `(**) *****-${onlyDigits(raw).slice(-4)}`;
  if (["CPF", "CNPJ"].includes(type)) return `***.***.${onlyDigits(raw).slice(-4)}`;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function StepTitle({ number, text }) {
  return (
    <View style={styles.stepTitle}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

export function PayoutAccountModal({
  error,
  existingAccount,
  form,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  open,
  purpose = "sale",
  userNeedsCpf = false,
}) {
  const isWithdrawal = purpose === "withdrawal";
  const selectedType = keyTypes.find((item) => item.value === form.keyType) ?? keyTypes[0];
  const selectedCopy = keyCopy[selectedType.value];
  const usesAccountCpf = selectedType.value === "CPF";
  const keyValid = usesAccountCpf ? !userNeedsCpf : isValidPixKey(selectedType.value, form.key);
  const formValid = keyValid;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons
                color={colors.primaryDark}
                name={isWithdrawal ? "wallet-outline" : "flash-outline"}
                size={22}
              />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>
                {isWithdrawal ? "Destino dos saques" : "Recebimento presencial"}
              </Text>
              <Text style={styles.title}>
                {existingAccount
                  ? "Alterar chave Pix"
                  : isWithdrawal
                    ? "Conta para receber"
                    : "Repasse por Pix"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Fechar"
              accessibilityRole="button"
              disabled={isSaving}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <Ionicons color={colors.textPrimary} name="close" size={22} />
            </Pressable>
          </View>

          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {existingAccount ? (
              <View style={styles.currentAccount}>
                <View style={styles.currentAccountIcon}>
                  <Ionicons color={colors.primaryDark} name="key-outline" size={20} />
                </View>
                <View style={styles.currentAccountCopy}>
                  <Text style={styles.currentAccountLabel}>Chave atual</Text>
                  <Text numberOfLines={1} style={styles.currentAccountValue}>
                    {existingAccount.keyType} {existingAccount.keyMasked}
                  </Text>
                </View>
                <View style={styles.currentAccountStatus}>
                  <View style={styles.statusDot} />
                  <Text style={styles.currentAccountStatusText}>
                    {existingAccount.status === "ATIVA" ? "Pronta" : "Pendente"}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.contextStrip}>
              <Ionicons
                color={colors.primaryDark}
                name={isWithdrawal ? "shield-checkmark-outline" : "qr-code-outline"}
                size={20}
              />
              <Text style={styles.contextText}>
                {isWithdrawal
                  ? "Cadastre somente a chave. O destino e confirmado no envio do saque e, se o Pix falhar, o valor volta ao saldo."
                  : "Cadastre somente a chave. O repasse e enviado depois da venda e, se falhar, o valor volta a carteira."}
              </Text>
            </View>

            <View style={styles.section}>
              <StepTitle number="1" text="Escolha o tipo da chave" />
              <View accessibilityRole="radiogroup" style={styles.types}>
                {keyTypes.map((item) => {
                  const active = selectedType.value === item.value;
                  return (
                    <Pressable
                      accessibilityLabel={`Chave Pix ${item.label}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      key={item.value}
                      onPress={() => {
                        if (active) return;
                        onChange((current) => ({ ...current, key: "", keyType: item.value }));
                      }}
                      style={({ pressed }) => [
                        styles.type,
                        active && styles.typeActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={[styles.typeIcon, active && styles.typeIconActive]}>
                        <Ionicons
                          color={active ? colors.card : colors.primaryDark}
                          name={item.icon}
                          size={18}
                        />
                      </View>
                      <Text style={[styles.typeText, active && styles.typeTextActive]}>
                        {item.label}
                      </Text>
                      {active ? (
                        <Ionicons color={colors.primaryDark} name="checkmark-circle" size={17} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <StepTitle number="2" text={usesAccountCpf ? "Use o CPF da sua conta" : "Informe a chave Pix"} />
              {usesAccountCpf ? (
                <View style={styles.accountCpf}>
                  <View style={styles.accountCpfIcon}>
                    <Ionicons color={colors.primaryDark} name="person-outline" size={21} />
                  </View>
                  <View style={styles.accountCpfCopy}>
                    <Text style={styles.accountCpfTitle}>CPF cadastrado na conta</Text>
                    <Text style={styles.accountCpfText}>O app usa automaticamente seu CPF. Voce nao precisa digitar nome nem documento novamente.</Text>
                  </View>
                  <Ionicons color={colors.success} name="checkmark-circle" size={22} />
                </View>
              ) : <>
                <AppInput
                  autoCapitalize="none"
                  autoComplete={selectedType.value === "EMAIL" ? "email" : "off"}
                  error={form.key && !keyValid ? selectedCopy.error : undefined}
                  icon={selectedType.icon}
                  keyboardType={keyKeyboard(selectedType.value)}
                  label={`${existingAccount ? "Nova chave" : "Chave Pix"} - ${selectedType.label}`}
                  maxLength={selectedType.value === "CNPJ" ? 18 : selectedType.value === "TELEFONE" ? 15 : selectedType.value === "ALEATORIA" ? 36 : 255}
                  onChangeText={(key) => onChange((current) => ({ ...current, key: formatPixKey(current.keyType, key) }))}
                  placeholder={selectedCopy.placeholder}
                  value={form.key}
                />
                {!form.key ? <Text style={styles.fieldHint}>{selectedCopy.hint}</Text> : null}
              </>}
            </View>

            {formValid ? (
              <View style={styles.readyPreview}>
                <View style={styles.readyIcon}>
                  <Ionicons color={colors.card} name="checkmark" size={18} />
                </View>
                <View style={styles.readyCopy}>
                  <Text style={styles.readyTitle}>Chave pronta para salvar</Text>
                  <Text numberOfLines={1} style={styles.readyText}>
                    {usesAccountCpf ? "CPF cadastrado na sua conta" : `${selectedType.label} ${maskedPreview(selectedType.value, form.key)}`}
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}
            <View style={styles.securityNote}>
              <Ionicons color={colors.primaryDark} name="lock-closed-outline" size={16} />
              <Text style={styles.securityText}>
                Se o banco recusar o Pix, o valor retorna automaticamente ao saldo e voce recebe um aviso.
              </Text>
            </View>
            <AppButton
              disabled={!formValid}
              icon="checkmark-circle-outline"
              loading={isSaving}
              onPress={onSubmit}
              title={isWithdrawal ? "Salvar destino do saque" : "Salvar chave de recebimento"}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(20, 32, 25, 0.48)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.md,
  },
  accountCpf: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  accountCpfCopy: { flex: 1, gap: 3 },
  accountCpfIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  accountCpfText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  accountCpfTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  body: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  close: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderColor: colors.border,
    borderRadius: radius.round,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  contextStrip: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  contextText: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    lineHeight: 19,
  },
  currentAccount: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  currentAccountCopy: { flex: 1, gap: 2 },
  currentAccountIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  currentAccountLabel: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
    textTransform: "uppercase",
  },
  currentAccountStatus: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  currentAccountStatusText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: "700",
  },
  currentAccountValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  divider: { backgroundColor: colors.border, height: 1 },
  error: {
    color: colors.danger,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  errorBox: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderColor: "#FECACA",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  fieldHint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
    marginTop: -spacing.sm,
  },
  footer: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  header: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 82,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  headerCopy: { flex: 1, gap: 2 },
  headerIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.round,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  kicker: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  modal: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    maxHeight: "94%",
    maxWidth: 560,
    overflow: "hidden",
    width: "100%",
    ...shadowSoft,
  },
  pressed: { opacity: 0.76 },
  readyCopy: { flex: 1, gap: 2 },
  readyIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  readyPreview: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  readyText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  readyTitle: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  section: { gap: spacing.md },
  securityNote: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  securityText: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  stepNumber: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  stepNumberText: {
    color: colors.card,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: "700",
  },
  stepText: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: typography.label,
    fontWeight: "700",
  },
  stepTitle: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  statusDot: {
    backgroundColor: colors.success,
    borderRadius: radius.round,
    height: 7,
    width: 7,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
  },
  type: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: "30%",
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: 48,
    minWidth: 116,
    paddingHorizontal: spacing.sm,
  },
  typeActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryDark,
  },
  typeIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  typeIconActive: { backgroundColor: colors.primaryDark },
  typeText: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  typeTextActive: { color: colors.primaryDark },
  types: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
