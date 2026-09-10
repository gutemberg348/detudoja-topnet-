import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton } from "../../components/AppButton";
import { AppInput } from "../../components/AppInput";
import {
  colors,
  fonts,
  radius,
  shadowSoft,
  spacing,
  typography,
} from "../../utils/theme";

export function ProfileEditModal({
  address,
  error,
  fieldErrors,
  isSaving,
  onAddressChange,
  onClose,
  onEmailChange,
  onNameChange,
  onPhoneChange,
  onSubmit,
  open,
  values,
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={open}
    >
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons
                color={colors.primaryDark}
                name="person-outline"
                size={21}
              />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>DADOS DA CONTA</Text>
              <Text style={styles.title}>Editar dados</Text>
              <Text style={styles.subtitle}>
                Seu telefone, endereco e cidade mantem sua conta segura e
                mostram o comercio certo para voce.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Fechar edicao de dados"
              onPress={onClose}
              style={styles.close}
            >
              <Ionicons color={colors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.tip}>
              <Ionicons
                color={colors.primaryDark}
                name="shield-checkmark-outline"
                size={18}
              />
              <Text style={styles.tipText}>
                Use dados verdadeiros. Eles tambem ajudam a validar compras,
                saques e atendimentos na sua cidade.
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Contato</Text>
            <AppInput
              autoCapitalize="words"
              autoComplete="name"
              error={fieldErrors.name}
              icon="person-outline"
              label="Nome completo"
              onChangeText={onNameChange}
              value={values.name}
            />
            <AppInput
              autoComplete="email"
              error={fieldErrors.email}
              icon="mail-outline"
              keyboardType="email-address"
              label="E-mail"
              onChangeText={onEmailChange}
              value={values.email}
            />
            <AppInput
              autoComplete="tel"
              error={fieldErrors.phone}
              icon="call-outline"
              keyboardType="phone-pad"
              label="Telefone"
              maxLength={15}
              onChangeText={onPhoneChange}
              value={values.phone}
            />

            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionLabel}>Sua cidade</Text>
                <Text style={styles.sectionHint}>
                  O CEP preenche o endereco e define as lojas, servicos e
                  entregas que voce ve.
                </Text>
              </View>
            </View>
            <AppInput
              autoComplete="postal-code"
              error={fieldErrors.zipCode}
              icon="location-outline"
              inputMode="numeric"
              keyboardType="number-pad"
              label="CEP"
              maxLength={9}
              onChangeText={onAddressChange.zipCode}
              value={address.zipCode}
            />
            <AppInput
              autoCapitalize="words"
              error={fieldErrors.street}
              icon="map-outline"
              label="Rua"
              onChangeText={onAddressChange.street}
              value={address.street}
            />
            <AppInput
              error={fieldErrors.number}
              icon="business-outline"
              label="Numero"
              onChangeText={onAddressChange.number}
              value={address.number}
            />
            <AppInput
              autoCapitalize="words"
              error={fieldErrors.district}
              icon="navigate-outline"
              label="Bairro"
              onChangeText={onAddressChange.district}
              value={address.district}
            />
            <View style={styles.addressRow}>
              <View style={styles.addressCity}>
                <AppInput
                  autoCapitalize="words"
                  error={fieldErrors.city}
                  icon="location-outline"
                  label="Cidade"
                  onChangeText={onAddressChange.city}
                  value={address.city}
                />
              </View>
              <View style={styles.addressState}>
                <AppInput
                  autoCapitalize="characters"
                  error={fieldErrors.state}
                  label="UF"
                  maxLength={2}
                  onChangeText={onAddressChange.state}
                  value={address.state}
                />
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton
              icon="checkmark-circle-outline"
              loading={isSaving}
              onPress={onSubmit}
              title="Salvar meus dados"
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  addressCity: { flex: 1 },
  addressRow: { flexDirection: "row", gap: spacing.sm },
  addressState: { width: 82 },
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 32, 25, 0.42)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.md,
  },
  body: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xl },
  close: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  header: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  headerCopy: { flex: 1, gap: 3, minWidth: 0 },
  headerIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  kicker: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    fontWeight: "800",
  },
  modal: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    maxHeight: "92%",
    maxWidth: 560,
    overflow: "hidden",
    width: "100%",
    ...shadowSoft,
  },
  sectionHeading: { marginTop: spacing.sm },
  sectionHint: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 18,
    marginTop: 3,
  },
  sectionLabel: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  tip: {
    alignItems: "flex-start",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  tipText: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
  },
});
