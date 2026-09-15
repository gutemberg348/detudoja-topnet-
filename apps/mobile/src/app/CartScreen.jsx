import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { trackStoreConversationActivity } from "../services/store-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { useCartStore } from "../stores/useCartStore";
import {
  cartSubtotalCents,
  normalizeCart,
} from "../utils/checkout";
import { resolveMediaUrl } from "../utils/media";
import { formatarDinheiro } from "../utils/money";
import { storeUsesChatNegotiation } from "../utils/storeOrderFlow";
import {
  colors,
  fonts,
  radius,
  spacing,
  typography,
} from "../utils/theme";

export function CartScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const routeCart = normalizeCart(route.params);
  const routeConversationId = route.params?.conversationId ?? null;
  const {
    conversationId,
    items,
    removeItem,
    setCart,
    store,
    updateItemQuantity,
  } = useCartStore();

  useEffect(() => {
    if (!items.length && routeCart.items.length) {
      setCart({
        conversationId: routeConversationId,
        items: routeCart.items,
        store: routeCart.store,
      });
    }
  }, []);

  const subtotalCents = useMemo(() => cartSubtotalCents(items), [items]);
  const negotiatesByChat = storeUsesChatNegotiation(store);

  function updateQuantity(itemId, quantity) {
    updateItemQuantity(itemId, quantity);
  }

  function continuePurchase() {
    if (conversationId && session?.accessToken) {
      void trackStoreConversationActivity(session.accessToken, conversationId, {
        action: "START_CHECKOUT",
      }).catch(() => {});
    }
    navigation.navigate("Checkout", {
      conversationId,
      items,
      store,
    });
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <PageHeader
        subtitle={
          negotiatesByChat
            ? `${store?.name ?? "Loja"} - selecao para enviar no chat`
            : `${store?.name ?? "Loja"} - revise antes de continuar`
        }
        title="Seu pedido"
      />

      {items.length ? (
        <View style={styles.items}>
          {items.map((item) => (
            <CartItem
              item={item}
              key={item.id}
              onDecrease={() => updateQuantity(item.id, item.quantity - 1)}
              onIncrease={() => updateQuantity(item.id, item.quantity + 1)}
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons color={colors.primaryDark} name="bag-handle-outline" size={28} />
          <Text style={styles.emptyTitle}>Seu carrinho esta vazio</Text>
          <Text style={styles.emptyText}>Volte para a loja e escolha um produto.</Text>
        </View>
      )}

      <View style={styles.summary}>
        <SummaryRow label="Produtos" value={formatarDinheiro(subtotalCents)} />
        <SummaryRow label="Entrega" value="Calculada no proximo passo" />
        <View style={styles.divider} />
        <SummaryRow strong label="Subtotal" value={formatarDinheiro(subtotalCents)} />
      </View>

      <View style={styles.actions}>
        <AppButton
          disabled={!items.length}
          icon="arrow-forward"
          onPress={continuePurchase}
          title={negotiatesByChat ? "Revisar e enviar" : "Continuar compra"}
        />
        <AppButton onPress={() => navigation.goBack()} title="Adicionar mais itens" variant="outline" />
      </View>
    </ScreenContainer>
  );
}

function CartItem({ item, onDecrease, onIncrease, onRemove }) {
  const imageUrl = resolveMediaUrl(item.imageUrl);

  return (
    <View style={styles.itemCard}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.itemImage} />
      ) : (
        <View style={styles.itemImageFallback}>
          <Ionicons color={colors.primaryDark} name="cube-outline" size={24} />
        </View>
      )}
      <View style={styles.itemCopy}>
        <Text numberOfLines={1} style={styles.itemName}>{item.name}</Text>
        <Text numberOfLines={2} style={styles.itemDescription}>
          {item.notes || item.description || "Sem observacao."}
        </Text>
        <Text style={styles.itemPrice}>{formatarDinheiro(item.priceCents)}</Text>
      </View>
      <View style={styles.itemControls}>
        <Pressable onPress={onRemove} style={styles.removeButton}>
          <Ionicons color={colors.danger} name="trash-outline" size={16} />
        </Pressable>
        <View style={styles.stepper}>
          <Pressable onPress={onDecrease} style={styles.stepperButton}>
            <Ionicons color={colors.primaryDark} name="remove" size={16} />
          </Pressable>
          <Text style={styles.stepperText}>{item.quantity}</Text>
          <Pressable onPress={onIncrease} style={styles.stepperButton}>
            <Ionicons color={colors.primaryDark} name="add" size={16} />
          </Pressable>
        </View>
      </View>
    </View>
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
  actions: {
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
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 180,
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    textAlign: "center",
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  itemCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  itemControls: {
    alignItems: "flex-end",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  itemDescription: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  itemImage: {
    borderRadius: radius.lg,
    height: 74,
    width: 74,
  },
  itemImageFallback: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    height: 74,
    justifyContent: "center",
    width: 74,
  },
  itemName: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  itemPrice: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
    fontWeight: "800",
  },
  items: {
    gap: spacing.md,
  },
  removeButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  stepper: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.xs,
  },
  stepperButton: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  stepperText: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
    minWidth: 20,
    textAlign: "center",
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
});
