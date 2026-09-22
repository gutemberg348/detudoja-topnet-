import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { fetchCepAddress } from "../services/cep.api";
import { getCurrentUserAddresses } from "../services/users.api";
import { useAuthStore } from "../stores/useAuthStore";
import {
  checkoutTotals,
  normalizeCart,
} from "../utils/checkout";
import { formatarDinheiro } from "../utils/money";
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
  const checkoutGroups = Array.isArray(route.params?.checkoutGroups)
    ? route.params.checkoutGroups
    : [route.params];
  const checkoutIndex = Math.max(0, Number(route.params?.checkoutIndex ?? 0));
  const checkoutGroup = checkoutGroups[checkoutIndex] ?? route.params;
  const cart = normalizeCart(checkoutGroup);
  const cartItemKeys = checkoutGroup?.cartItemKeys ?? cart.items.map((item) => item.cartKey).filter(Boolean);
  const hasNextStore = checkoutIndex + 1 < checkoutGroups.length;
  const deliveryAvailable = cart.store?.delivery?.available !== false
    && cart.items.every((item) => item.product?.acceptDelivery !== false);
  const pickupAvailable = cart.items.every((item) => item.product?.acceptPickup !== false);
  const [deliveryMode, setDeliveryMode] = useState(deliveryAvailable ? "delivery" : "pickup");
  const [addressForm, setAddressForm] = useState(initialAddressForm);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [isCepLoading, setIsCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");
  const totals = useMemo(
    () => checkoutTotals(cart.items, {
      deliveryFeeCents: cart.store?.delivery?.feeCents,
      deliveryMode,
      serviceFeeCents: cart.store?.onlineServiceFeeCents,
    }),
    [
      cart.items,
      cart.store?.delivery?.feeCents,
      cart.store?.onlineServiceFeeCents,
      deliveryMode,
    ],
  );
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
    (deliveryMode === "pickup" && pickupAvailable) ||
    (deliveryMode === "delivery" && deliveryAvailable && (isUsingSavedAddress || isNewAddressValid));

  useEffect(() => {
    let active = true;

    async function loadAddresses() {
      if (!session?.accessToken) {
        return;
      }

      try {
        const response = await getCurrentUserAddresses(session.accessToken);
        const nextAddresses = response.addresses ?? [];
        const completeAddresses = nextAddresses.filter((address) => address.complete !== false);
        const baseLocation = nextAddresses[0] ?? null;

        if (!active) {
          return;
        }

        setAddresses(completeAddresses);

        if (completeAddresses[0]) {
          setSelectedAddressId(completeAddresses[0].id);
          setAddressForm(addressFromSaved(completeAddresses[0]));
        } else if (baseLocation) {
          setAddressForm((current) => ({
            ...current,
            cidade: baseLocation.cidade ?? "",
            estado: baseLocation.estado ?? "",
          }));
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

  function continueOrder() {
    if (!session?.accessToken || !cart.store?.id || !cart.items.length || !canContinue) {
      return;
    }

    const delivery = {
      address: deliveryMode === "delivery" && !selectedAddressId ? addressForm : null,
      addressId: deliveryMode === "delivery" ? selectedAddressId : null,
      mode: deliveryMode,
    };

    navigation.navigate("CheckoutPayment", {
      cartItemKeys,
      checkoutGroups,
      checkoutIndex,
      delivery,
      deliveryMode,
      items: cart.items,
      store: cart.store,
      totals,
    });
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <PageHeader
        subtitle={
          "Confirme a entrega antes de escolher a forma de pagamento."
        }
        title={checkoutGroups.length > 1
          ? `Loja ${checkoutIndex + 1} de ${checkoutGroups.length}`
          : "Entrega e retirada"}
      />

      {checkoutGroups.length > 1 ? (
        <View style={styles.checkoutProgress}>
          <View style={styles.checkoutProgressIcon}>
            <Ionicons color={colors.primaryDark} name="layers-outline" size={20} />
          </View>
          <View style={styles.checkoutProgressCopy}>
            <Text style={styles.checkoutProgressTitle}>{cart.store?.name}</Text>
            <Text style={styles.checkoutProgressText}>
              Cada loja gera um pedido e uma entrega separados. Os itens nao selecionados permanecem no carrinho.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Como voce quer receber?</Text>
        <View style={styles.segmented}>
          <SegmentOption
            active={deliveryMode === "delivery"}
            disabled={!deliveryAvailable}
            icon="bicycle-outline"
            label={deliveryAvailable ? "Entrega" : "Sem entrega"}
            onPress={() => setDeliveryMode("delivery")}
          />
          <SegmentOption
            active={deliveryMode === "pickup"}
            disabled={!pickupAvailable}
            icon="storefront-outline"
            label={pickupAvailable ? "Retirada" : "Sem retirada"}
            onPress={() => setDeliveryMode("pickup")}
          />
        </View>

        {!deliveryAvailable && !pickupAvailable ? (
          <View style={styles.fulfillmentUnavailable}>
            <Ionicons color={colors.danger} name="alert-circle-outline" size={20} />
            <Text style={styles.fulfillmentUnavailableText}>
              Estes produtos nao possuem uma forma de recebimento em comum. Volte ao carrinho e finalize-os separadamente.
            </Text>
          </View>
        ) : null}

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
        <SummaryRow label="Taxa de servico" value={formatarDinheiro(totals.serviceFeeCents)} />
        <View style={styles.divider} />
        <SummaryRow strong label="Total" value={formatarDinheiro(totals.totalCents)} />
      </View>

      <View style={styles.chatNotice}>
        <View style={styles.chatNoticeIcon}>
          <Ionicons
            color={colors.primaryDark}
            name="notifications-outline"
            size={21}
          />
        </View>
        <View style={styles.chatNoticeCopy}>
          <Text style={styles.chatNoticeTitle}>
            Pagamento primeiro, acompanhamento depois
          </Text>
          <Text style={styles.chatNoticeText}>
            Entrega e pagamento sao finalizados aqui. Depois que o pedido for criado, aceite, preparo, entrega e mensagens aparecem no chat do pedido.
          </Text>
        </View>
      </View>

      <AppButton
        disabled={!cart.items.length || !canContinue}
        icon="card-outline"
        onPress={() => continueOrder()}
        title={hasNextStore ? "Pagar esta loja" : "Ir para pagamento"}
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

function SegmentOption({ active, disabled = false, icon, label, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.segmentOption,
        active && styles.segmentOptionActive,
        disabled && styles.segmentOptionDisabled,
      ]}
    >
      <Ionicons
        color={disabled ? colors.textMuted : active ? colors.card : colors.primaryDark}
        name={icon}
        size={20}
      />
      <Text style={[
        styles.segmentText,
        active && styles.segmentTextActive,
        disabled && styles.segmentTextDisabled,
      ]}>
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
  checkoutProgress: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  checkoutProgressCopy: {
    flex: 1,
    gap: 3,
  },
  checkoutProgressIcon: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  checkoutProgressText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  checkoutProgressTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
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
  fulfillmentUnavailable: {
    alignItems: "flex-start",
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  fulfillmentUnavailableText: {
    color: colors.danger,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
    lineHeight: 18,
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
  segmentOptionDisabled: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    opacity: 0.72,
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
  segmentTextDisabled: {
    color: colors.textMuted,
  },
  summary: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
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
