import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
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
              Escolha a loja para registrar a venda nela ou siga com uma venda autonoma.
            </Text>

            <Pressable
              onPress={onSelectAutonomous}
              style={({ pressed }) => [styles.choiceCard, pressed && styles.pressed]}
            >
              <View style={styles.choiceIcon}>
                <Ionicons color={colors.primaryDark} name="qr-code-outline" size={23} />
              </View>
              <View style={styles.choiceCopy}>
                <Text style={styles.choiceLabel}>Venda autonoma</Text>
                <Text style={styles.choiceMeta}>Venda sem loja, recebida direto por voce.</Text>
              </View>
              <View style={styles.choiceArrow}>
                <Ionicons color={colors.primaryDark} name="arrow-forward" size={18} />
              </View>
            </Pressable>

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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function StoreChargeModal({ error, form, isSaving, onChange, onClose, onSubmit, open, store }) {
  return (
    <Modal animationType="fade" transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalKicker}>Venda presencial</Text>
              <Text style={styles.modalTitle}>Gerar QR da cobranca</Text>
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
              autoCapitalize="sentences"
              icon="pricetag-outline"
              label="Descricao da cobranca"
              onChangeText={(value) => onChange((current) => ({ ...current, title: value }))}
              placeholder="Ex.: Compra no caixa"
              value={form.title}
            />
            <AppInput
              icon="cash-outline"
              keyboardType="decimal-pad"
              label="Valor"
              onChangeText={(value) => onChange((current) => ({ ...current, amount: value }))}
              placeholder="Ex.: 49,90"
              value={form.amount}
            />
            <QrExpirationHint />
            <AppInput
              autoCapitalize="sentences"
              icon="reader-outline"
              label="Observacao"
              multiline
              onChangeText={(value) => onChange((current) => ({ ...current, description: value }))}
              placeholder="Opcional: itens ou referencia do atendimento"
              value={form.description}
            />
            {error ? <Text style={styles.modalError}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <AppButton onPress={onClose} title="Cancelar" variant="neutral" />
              <AppButton
                disabled={!form.title.trim() || !form.amount.trim()}
                loading={isSaving}
                onPress={onSubmit}
                title="Gerar QR"
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
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
