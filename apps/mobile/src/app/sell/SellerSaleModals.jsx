import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../../components/AppButton";
import { AppInput } from "../../components/AppInput";
import { colors } from "../../utils/theme";
import { sellerStyles as styles } from "./seller.styles";

export function SaleModal({ error, form, isSaving, onChange, onClose, onSubmit, open }) {
  return (
    <Modal animationType="fade" transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalKicker}>Venda sem loja</Text>
              <Text style={styles.modalTitle}>Gerar venda autonoma</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={colors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <AppInput
              autoCapitalize="sentences"
              icon="pricetag-outline"
              label="Nome da venda"
              onChangeText={(value) =>
                onChange((current) => ({ ...current, title: value }))
              }
              placeholder="Ex.: Corte masculino"
              value={form.title}
            />
            <AppInput
              icon="cash-outline"
              keyboardType="decimal-pad"
              label="Valor"
              onChangeText={(value) =>
                onChange((current) => ({ ...current, amount: value }))
              }
              placeholder="Ex.: 49,90"
              value={form.amount}
            />
            <QrExpirationHint />
            <AppInput
              autoCapitalize="sentences"
              icon="reader-outline"
              label="Descricao"
              multiline
              onChangeText={(value) =>
                onChange((current) => ({ ...current, description: value }))
              }
              placeholder="Detalhe rapido para o cliente"
              value={form.description}
            />

            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <AppButton onPress={onClose} title="Cancelar" variant="neutral" />
              <AppButton
                disabled={!form.title.trim() || !form.amount.trim()}
                loading={isSaving}
                onPress={onSubmit}
                title="Gerar QR da venda"
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function SaleDestinationModal({ onClose, onSelectAutonomous, onSelectStore, open, stores }) {
  return (
    <Modal animationType="fade" transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalKicker}>Nova venda</Text>
              <Text style={styles.modalTitle}>Onde voce vendeu?</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={colors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.choiceMeta}>
              Registre a venda no comercio correto para manter historico, taxas e repasse organizados.
            </Text>
            <Text style={styles.destinationSectionLabel}>SUAS LOJAS</Text>
            {stores.map((store) => (
              <Pressable
                key={store.id}
                onPress={() => onSelectStore(store)}
                style={({ pressed }) => [styles.choiceCard, pressed && styles.pressed]}
              >
                <View style={styles.choiceIcon}>
                  <Ionicons color={colors.primaryDark} name="storefront-outline" size={23} />
                </View>
                <View style={styles.choiceCopy}>
                  <Text numberOfLines={1} style={styles.choiceLabel}>{store.name}</Text>
                  <Text numberOfLines={1} style={styles.choiceMeta}>Gerar QR vinculado a esta loja.</Text>
                </View>
                <View style={styles.choiceArrow}>
                  <Ionicons color={colors.primaryDark} name="arrow-forward" size={18} />
                </View>
              </Pressable>
            ))}
            <View style={styles.destinationDivider} />
            <Text style={styles.destinationSectionLabel}>VENDA SEM LOJA</Text>
            <Pressable
              onPress={onSelectAutonomous}
              style={({ pressed }) => [styles.choiceCard, styles.choiceCardSecondary, pressed && styles.pressed]}
            >
              <View style={styles.choiceIcon}>
                <Ionicons color={colors.primaryDark} name="person-outline" size={23} />
              </View>
              <View style={styles.choiceCopy}>
                <Text style={styles.choiceLabel}>Cobrar como autonomo</Text>
                <Text style={styles.choiceMeta}>Use somente quando a venda nao pertence a nenhuma loja.</Text>
              </View>
              <View style={styles.choiceArrow}>
                <Ionicons color={colors.primaryDark} name="arrow-forward" size={18} />
              </View>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function StoreChargeModal({
  error,
  form,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  open,
  quickOptions = [],
  store,
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (open) setDetailsOpen(false);
  }, [open]);

  function selectQuickOption(option) {
    onChange((current) => ({
      ...current,
      amount: option.amountCents ? centsToInput(option.amountCents) : current.amount,
      title: option.label,
    }));
  }

  return (
    <Modal animationType="fade" transparent visible={open}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalBackdrop}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalKicker}>Venda presencial</Text>
              <Text style={styles.modalTitle}>Cobranca rapida</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={colors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.documentHint}>
              <Ionicons color={colors.primaryDark} name="storefront-outline" size={19} />
              <Text style={styles.documentHintText}>A cobranca sera recebida por {store?.name ?? "sua loja"}.</Text>
            </View>
            <AppInput
              autoFocus
              icon="cash-outline"
              keyboardType="decimal-pad"
              label="Quanto cobrar?"
              onChangeText={(value) => onChange((current) => ({ ...current, amount: value }))}
              placeholder="Ex.: 49,90"
              value={form.amount}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setDetailsOpen((current) => !current)}
              style={({ pressed }) => [styles.optionalDetailsButton, pressed && styles.pressed]}
            >
              <View style={styles.optionalDetailsIcon}>
                <Ionicons color={colors.primaryDark} name="receipt-outline" size={18} />
              </View>
              <View style={styles.optionalDetailsCopy}>
                <Text style={styles.optionalDetailsTitle}>
                  {detailsOpen ? "Ocultar detalhes" : "Adicionar detalhes"}
                </Text>
                <Text style={styles.optionalDetailsText}>Opcional: item, servico ou observacao.</Text>
              </View>
              <Ionicons color={colors.primaryDark} name={detailsOpen ? "chevron-up" : "chevron-down"} size={19} />
            </Pressable>
            {detailsOpen ? (
              <View style={styles.quickChargeDetails}>
                {quickOptions.length ? (
                  <View style={styles.quickChargeSection}>
                    <View style={styles.quickChargeHeading}>
                      <Text style={styles.quickChargeTitle}>Itens e cobrancas usadas</Text>
                      <Text style={styles.quickChargeMeta}>Toque para preencher; voce ainda pode alterar.</Text>
                    </View>
                    <View style={styles.quickChargeOptions}>
                      {quickOptions.map((option) => {
                        const selected = form.title === option.label;
                        return (
                          <Pressable
                            key={`${option.source}-${option.label}`}
                            onPress={() => selectQuickOption(option)}
                            style={({ pressed }) => [
                              styles.quickChargeOption,
                              selected && styles.quickChargeOptionSelected,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={[styles.quickChargeOptionText, selected && styles.quickChargeOptionTextSelected]}>
                              {option.label}
                            </Text>
                            {option.amountCents ? (
                              <Text style={[styles.quickChargeOptionPrice, selected && styles.quickChargeOptionTextSelected]}>
                                {formatCents(option.amountCents)}
                              </Text>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
                <AppInput
                  autoCapitalize="sentences"
                  icon="pricetag-outline"
                  label="O que foi vendido?"
                  onChangeText={(value) => onChange((current) => ({ ...current, title: value }))}
                  placeholder="Ex.: Corte e barba"
                  value={form.title}
                />
                <AppInput
                  autoCapitalize="sentences"
                  icon="reader-outline"
                  label="Observacao"
                  multiline
                  onChangeText={(value) => onChange((current) => ({ ...current, description: value }))}
                  placeholder="Opcional: itens ou referencia do atendimento"
                  value={form.description}
                />
                <QrExpirationHint />
              </View>
            ) : null}
            {error ? <Text style={styles.modalError}>{error}</Text> : null}
            <AppButton
              disabled={!form.amount.trim()}
              icon="qr-code-outline"
              loading={isSaving}
              onPress={onSubmit}
              style={styles.quickChargeSubmit}
              title="Gerar QR para pagar"
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function centsToInput(value) {
  return (Number(value) / 100).toFixed(2).replace(".", ",");
}

function formatCents(value) {
  return Number(value / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency",
  });
}

function QrExpirationHint() {
  return (
    <View style={styles.qrExpirationHint}>
      <View style={styles.qrExpirationIcon}>
        <Ionicons color={colors.primaryDark} name="time-outline" size={18} />
      </View>
      <View style={styles.qrExpirationCopy}>
        <Text style={styles.qrExpirationTitle}>Validade padrao de 30 minutos</Text>
        <Text style={styles.qrExpirationText}>
          Depois desse prazo, a cobranca expira automaticamente.
        </Text>
      </View>
    </View>
  );
}
