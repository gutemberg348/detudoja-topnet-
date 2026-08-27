import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { CpfRequirementModal } from "../components/CpfRequirementModal";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { fetchCepAddress } from "../services/cep.api";
import {
  createOnlineOrderRequest,
  createOrderIdempotencyKey,
} from "../services/orders.api";
import { getCurrentUserAddresses } from "../services/users.api";
import { useAuthStore } from "../stores/useAuthStore";
import {
  checkoutTotals,
  normalizeCart,
} from "../utils/checkout";
import { formatarDinheiro } from "../utils/money";
import { storeUsesChatNegotiation } from "../utils/storeOrderFlow";
import {
  colors,
  fonts,
  radius,
  spacing,
  typography,
} from "../utils/theme";

const initialAddressForm = {
  bairro: "",
  cep: "",
  cidade: "",
  complemento: "",
  estado: "",
  numero: "",
  referencia: "",
  rua: "",
};

function formatCepInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function addressFromSaved(address) {
  return {
    bairro: address.bairro ?? "",
    cep: formatCepInput(address.cep ?? ""),
    cidade: address.cidade ?? "",
    complemento: address.complemento ?? "",
    estado: address.estado ?? "",
    numero: address.numero ?? "",
    referencia: "",
    rua: address.rua ?? "",
  };
}

export function CheckoutScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const cart = normalizeCart(route.params);
  const [deliveryMode, setDeliveryMode] = useState("delivery");
  const [cpfModalOpen, setCpfModalOpen] = useState(false);
  const [addressForm, setAddressForm] = useState(initialAddressForm);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [isCepLoading, setIsCepLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cepError, setCepError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const requestIdempotencyKeyRef = useRef(null);
  const totals = useMemo(
    () => checkoutTotals(cart.items, { deliveryMode }),
    [cart.items, deliveryMode],
  );
  const negotiatesByChat = storeUsesChatNegotiation(cart.store);
  const cepDigits = addressForm.cep.replace(/\D/g, "");
  const isUsingSavedAddress = deliveryMode === "delivery" && Boolean(selectedAddressId);
  const isNewAddressFormVisible = deliveryMode === "delivery" && !selectedAddressId;
  const isNewAddressValid = Boolean(
    cepDigits.length === 8 &&
      addressForm.rua.trim() &&
      addressForm.numero.trim() &&
      addressForm.bairro.trim() &&
      addressForm.cidade.trim() &&
      addressForm.estado.trim().length === 2,
  );
  const canContinue =
    deliveryMode === "pickup" ||
    isUsingSavedAddress ||
    isNewAddressValid;

  useEffect(() => {
    let active = true;

    async function loadAddresses() {
      if (!session?.accessToken) {
        return;
      }

      try {
        const response = await getCurrentUserAddresses(session.accessToken);
        const nextAddresses = response.addresses ?? [];

        if (!active) {
          return;
        }

        setAddresses(nextAddresses);

        if (nextAddresses[0]) {
          setSelectedAddressId(nextAddresses[0].id);
          setAddressForm(addressFromSaved(nextAddresses[0]));
        }
      } catch {
        if (active) {
          setAddresses([]);
        }
      } finally {
        if (active) {
          setIsLoadingAddresses(false);
        }
      }
    }

    loadAddresses();

    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    let active = true;

    async function lookupCep() {
      if (
        deliveryMode !== "delivery" ||
        selectedAddressId ||
        cepDigits.length !== 8
      ) {
        if (cepDigits.length < 8) {
          setCepError("");
        }

        return;
      }

      setIsCepLoading(true);
      setCepError("");

      try {
        const cepAddress = await fetchCepAddress(cepDigits);

        if (!active) {
          return;
        }

        setAddressForm((current) => ({
          ...current,
          bairro: cepAddress.bairro || current.bairro,
          cep: formatCepInput(cepAddress.cep),
          cidade: cepAddress.cidade || current.cidade,
          estado: cepAddress.estado || current.estado,
          rua: cepAddress.rua || current.rua,
        }));
      } catch (error) {
        if (active) {
          setCepError(error.message ?? "Nao foi possivel buscar o CEP.");
        }
      } finally {
        if (active) {
          setIsCepLoading(false);
        }
      }
    }

    lookupCep();

    return () => {
      active = false;
    };
  }, [cepDigits, deliveryMode, selectedAddressId]);

  function updateAddressField(field, value) {
    if (field !== "referencia") {
      setSelectedAddressId(null);
    }

    setAddressForm((current) => ({
      ...current,
      [field]: field === "cep" ? formatCepInput(value) : value,
    }));
  }

  function applySavedAddress(address) {
    setSelectedAddressId(address.id);
    setAddressForm(addressFromSaved(address));
    setCepError("");
  }

  function clearAddress() {
    setSelectedAddressId(null);
    setAddressForm(initialAddressForm);
    setCepError("");
  }

  async function continueOrder({ skipCpfGate = false } = {}) {
    if (!session?.accessToken || !cart.store?.id || !cart.items.length || !canContinue) {
      return;
    }

    const delivery = {
      address: deliveryMode === "delivery" && !selectedAddressId ? addressForm : null,
      addressId: deliveryMode === "delivery" ? selectedAddressId : null,
      mode: deliveryMode,
    };

    if (!negotiatesByChat) {
      navigation.navigate("CheckoutPayment", {
        delivery,
        deliveryMode,
        items: cart.items,
        store: cart.store,
        totals,
      });
      return;
    }

    if (!skipCpfGate && session.user?.cpfRequired) {
      setCpfModalOpen(true);
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const response = await createOnlineOrderRequest(session.accessToken, {
        address: delivery.address,
        addressId: delivery.addressId,
        deliveryMode,
        items: cart.items.map((item) => ({
          notes: item.notes ?? "",
          productId: item.id,
          quantity: item.quantity,
        })),
        storeId: cart.store.id,
      }, requestIdempotencyKeyRef.current ??= createOrderIdempotencyKey("request"));

      navigation.replace("CustomerOrderDetails", { order: response.order });
    } catch (requestError) {
      setSubmitError(requestError.message ?? "Nao foi possivel enviar o pedido para a loja.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <PageHeader
        subtitle={
          negotiatesByChat
            ? "Revise os itens e envie para a loja confirmar tudo pelo chat."
            : "Confirme a entrega antes de escolher a forma de pagamento."
        }
        title={negotiatesByChat ? "Enviar pedido" : "Entrega e retirada"}
      />

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Como voce quer receber?</Text>
        <View style={styles.segmented}>
          <SegmentOption
            active={deliveryMode === "delivery"}
            icon="bicycle-outline"
            label="Entrega"
            onPress={() => setDeliveryMode("delivery")}
          />
          <SegmentOption
            active={deliveryMode === "pickup"}
            icon="storefront-outline"
            label="Retirada"
            onPress={() => setDeliveryMode("pickup")}
          />
        </View>

        {deliveryMode === "delivery" ? (
          <View style={styles.fields}>
            {isLoadingAddresses ? (
              <View style={styles.loadingAddress}>
                <ActivityIndicator color={colors.primaryDark} />
                <Text style={styles.loadingText}>Carregando enderecos...</Text>
              </View>
            ) : addresses.length ? (
              <View style={styles.savedAddressList}>
                <Text style={styles.savedAddressTitle}>Enderecos salvos</Text>
                {addresses.map((address) => (
                  <Pressable
                    key={address.id}
                    onPress={() => applySavedAddress(address)}
                    style={[
                      styles.savedAddress,
                      selectedAddressId === address.id && styles.savedAddressActive,
                    ]}
                  >
                    <Ionicons
                      color={
                        selectedAddressId === address.id
                          ? colors.primaryDark
                          : colors.textMuted
                      }
                      name="location-outline"
                      size={19}
                    />
                    <View style={styles.savedAddressCopy}>
                      <Text numberOfLines={1} style={styles.savedAddressName}>
                        {address.nome ?? "Endereco"}
                      </Text>
                      <Text numberOfLines={1} style={styles.savedAddressText}>
                        {address.rua}, {address.numero} - {address.bairro}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {selectedAddressId ? (
                  <Pressable onPress={clearAddress} style={styles.newAddressButton}>
                    <Ionicons color={colors.primaryDark} name="add" size={18} />
                    <Text style={styles.newAddressText}>Usar novo endereco</Text>
                  </Pressable>
                ) : (
                  <View style={styles.newAddressNotice}>
                    <Ionicons color={colors.primaryDark} name="create-outline" size={17} />
                    <Text style={styles.newAddressNoticeText}>
                      Preencha abaixo somente se for cadastrar um endereco novo.
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            {isNewAddressFormVisible ? (
              <View style={styles.addressGrid}>
                <CheckoutInput
                  icon="navigate-outline"
                  keyboardType="number-pad"
                  label="CEP"
                  onChangeText={(value) => updateAddressField("cep", value)}
                  placeholder="00000-000"
                  value={addressForm.cep}
                />
                {isCepLoading ? (
                  <Text style={styles.cepHelper}>Buscando endereco...</Text>
                ) : cepError ? (
                  <Text style={styles.cepError}>{cepError}</Text>
                ) : null}
                <CheckoutInput
                  icon="map-outline"
                  label="Rua"
                  onChangeText={(value) => updateAddressField("rua", value)}
                  placeholder="Rua"
                  value={addressForm.rua}
                />
                <CheckoutInput
                  icon="home-outline"
                  label="Numero"
                  onChangeText={(value) => updateAddressField("numero", value)}
                  placeholder="Numero"
                  value={addressForm.numero}
                />
                <CheckoutInput
                  icon="business-outline"
                  label="Bairro"
                  onChangeText={(value) => updateAddressField("bairro", value)}
                  placeholder="Bairro"
                  value={addressForm.bairro}
                />
                <View style={styles.cityRow}>
                  <CheckoutInput
                    icon="location-outline"
                    label="Cidade"
                    onChangeText={(value) => updateAddressField("cidade", value)}
                    placeholder="Cidade"
                    style={styles.cityInput}
                    value={addressForm.cidade}
                  />
                  <CheckoutInput
                    autoCapitalize="characters"
                    label="UF"
                    onChangeText={(value) =>
                      updateAddressField("estado", value.toUpperCase().slice(0, 2))
                    }
                    placeholder="UF"
                    style={styles.ufInput}
                    value={addressForm.estado}
                  />
                </View>
                <CheckoutInput
                  icon="albums-outline"
                  label="Complemento"
                  onChangeText={(value) => updateAddressField("complemento", value)}
                  placeholder="Apto, bloco, casa..."
                  value={addressForm.complemento}
                />
                <CheckoutInput
                  icon="chatbubble-ellipses-outline"
                  label="Referencia"
                  onChangeText={(value) => updateAddressField("referencia", value)}
                  placeholder="Ponto de referencia para entrega"
                  value={addressForm.referencia}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.pickupHint}>
            <Ionicons color={colors.primaryDark} name="time-outline" size={20} />
            <Text style={styles.pickupText}>
              A loja recebera o pedido e voce acompanha a preparacao pelo app.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Itens do pedido</Text>
        {cart.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text numberOfLines={1} style={styles.itemName}>
              {item.quantity}x {item.name}
            </Text>
            <Text style={styles.itemPrice}>
              {formatarDinheiro(item.priceCents * item.quantity)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.summary}>
        <SummaryRow label="Produtos" value={formatarDinheiro(totals.subtotalCents)} />
        <SummaryRow label="Entrega" value={formatarDinheiro(totals.deliveryFeeCents)} />
        <View style={styles.divider} />
        <SummaryRow strong label="Total" value={formatarDinheiro(totals.totalCents)} />
      </View>

      <View style={styles.chatNotice}>
        <View style={styles.chatNoticeIcon}>
          <Ionicons
            color={colors.primaryDark}
            name={negotiatesByChat ? "chatbubbles-outline" : "notifications-outline"}
            size={21}
          />
        </View>
        <View style={styles.chatNoticeCopy}>
          <Text style={styles.chatNoticeTitle}>
            {negotiatesByChat ? "A proposta chega no chat" : "Acompanhe tudo em tempo real"}
          </Text>
          <Text style={styles.chatNoticeText}>
            {negotiatesByChat
              ? "A loja confere seu pedido, envia o valor final e o pagamento aparece na mesma conversa."
              : "Depois do pagamento, aceite, preparo, entrega e mensagens aparecem na conversa do pedido."}
          </Text>
        </View>
      </View>

      {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

      <AppButton
        disabled={!cart.items.length || !canContinue || isSubmitting}
        icon={negotiatesByChat ? "chatbubble-ellipses-outline" : "card-outline"}
        loading={isSubmitting}
        onPress={() => continueOrder()}
        title={negotiatesByChat ? "Enviar para a loja" : "Ir para pagamento"}
      />

      <CpfRequirementModal
        onClose={() => setCpfModalOpen(false)}
        onCompleted={() => {
          setCpfModalOpen(false);
          continueOrder({ skipCpfGate: true });
        }}
        open={cpfModalOpen}
        reason="purchase"
      />
    </ScreenContainer>
  );
}

function CheckoutInput({ icon, label, style, ...props }) {
  return (
    <View style={[styles.inputBlock, style]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputRow}>
        {icon ? <Ionicons color={colors.textWeak} name={icon} size={20} /> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          {...props}
        />
      </View>
    </View>
  );
}

function SegmentOption({ active, icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segmentOption, active && styles.segmentOptionActive]}
    >
      <Ionicons color={active ? colors.card : colors.primaryDark} name={icon} size={20} />
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryRow({ label, strong = false, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, strong && styles.summaryStrong]}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chatNotice: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  chatNoticeCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  chatNoticeIcon: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  chatNoticeText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  chatNoticeTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  addressGrid: {
    gap: spacing.md,
  },
  cepError: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  cepHelper: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  cityInput: {
    flex: 1,
  },
  cityRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
  },
  fields: {
    gap: spacing.lg,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    minHeight: 50,
    minWidth: 0,
  },
  inputBlock: {
    gap: spacing.xs,
  },
  inputLabel: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  inputRow: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  itemName: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  itemPrice: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  itemRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  loadingAddress: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  newAddressButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  newAddressText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  newAddressNotice: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  newAddressNoticeText: {
    color: colors.primaryDark,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  pickupHint: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  pickupText: {
    color: colors.primaryDark,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    lineHeight: 19,
  },
  savedAddress: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  savedAddressActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  savedAddressCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  savedAddressList: {
    gap: spacing.sm,
  },
  savedAddressName: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  savedAddressText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  savedAddressTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  segmented: {
    flexDirection: "row",
    gap: spacing.md,
  },
  segmentOption: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  segmentOptionActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  segmentText: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  segmentTextActive: {
    color: colors.card,
  },
  summary: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  submitError: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    lineHeight: 19,
    textAlign: "center",
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryStrong: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.body,
    fontWeight: "800",
  },
  summaryValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  ufInput: {
    width: 84,
  },
});
