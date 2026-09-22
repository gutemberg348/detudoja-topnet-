import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { trackStoreConversationActivity } from "../services/store-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { useCartStore } from "../stores/useCartStore";
import { cartSubtotalCents, normalizeCart } from "../utils/checkout";
import { resolveMediaUrl } from "../utils/media";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

function groupItemsByStore(items) {
  const groups = new Map();

  items.forEach((item) => {
    const storeId = item.storeId ?? item.store?.id;
    if (!storeId) return;
    const key = String(storeId);
    const current = groups.get(key) ?? {
      conversationId: item.conversationId ?? null,
      items: [],
      store: item.store,
      storeId,
    };
    current.items.push(item);
    if (!current.conversationId && item.conversationId) current.conversationId = item.conversationId;
    groups.set(key, current);
  });

  return [...groups.values()];
}

export function CartScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const routeCart = normalizeCart(route.params);
  const routeConversationId = route.params?.conversationId ?? null;
  const {
    items,
    removeItem,
    selectedItemCount,
    selectedItems,
    setAllSelected,
    setCart,
    setStoreSelected,
    toggleItemSelected,
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

  const groups = useMemo(() => groupItemsByStore(items), [items]);
  const allSelected = items.length > 0 && items.every((item) => item.selected);
  const selectedSubtotalCents = useMemo(
    () => cartSubtotalCents(selectedItems),
    [selectedItems],
  );
  const selectedStoreCount = useMemo(
    () => new Set(selectedItems.map((item) => String(item.storeId))).size,
    [selectedItems],
  );

  function continuePurchase() {
    const checkoutGroups = groups
      .map((group) => ({
        ...group,
        cartItemKeys: group.items.filter((item) => item.selected).map((item) => item.cartKey),
        items: group.items.filter((item) => item.selected),
      }))
      .filter((group) => group.items.length);

    if (!checkoutGroups.length) return;

    checkoutGroups.forEach((group) => {
      if (group.conversationId && session?.accessToken) {
        void trackStoreConversationActivity(session.accessToken, group.conversationId, {
          action: "START_CHECKOUT",
        }).catch(() => {});
      }
    });

    navigation.navigate("Checkout", {
      ...checkoutGroups[0],
      checkoutGroups,
      checkoutIndex: 0,
    });
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <PageHeader
        subtitle="Escolha o que deseja comprar agora. Os outros itens continuam guardados."
        title="Carrinho"
      />

      {items.length ? (
        <>
          <View style={styles.selectionBar}>
            <SelectionBox
              checked={allSelected}
              label={allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
              onPress={() => setAllSelected(!allSelected)}
            />
            <Text style={styles.selectionCount}>
              {selectedItemCount} selecionado{selectedItemCount === 1 ? "" : "s"}
            </Text>
          </View>

          <View style={styles.groups}>
            {groups.map((group) => (
              <StoreCartGroup
                group={group}
                key={group.storeId}
                onRemove={removeItem}
                onStoreSelected={(selected) => setStoreSelected(group.storeId, selected)}
                onToggleSelected={toggleItemSelected}
                onUpdateQuantity={updateItemQuantity}
              />
            ))}
          </View>
        </>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons color={colors.primaryDark} name="bag-handle-outline" size={30} />
          </View>
          <Text style={styles.emptyTitle}>Seu carrinho esta vazio</Text>
          <Text style={styles.emptyText}>Explore as lojas e adicione produtos para comprar.</Text>
        </View>
      )}

      {items.length ? (
        <View style={styles.summary}>
          <View style={styles.summaryHeading}>
            <View style={styles.summaryIcon}>
              <Ionicons color={colors.primaryDark} name="checkmark-done-outline" size={20} />
            </View>
            <View style={styles.summaryHeadingCopy}>
              <Text style={styles.summaryTitle}>Compra selecionada</Text>
              <Text style={styles.summaryHint}>
                {selectedStoreCount
                  ? `${selectedStoreCount} loja${selectedStoreCount === 1 ? "" : "s"}; entrega calculada separadamente`
                  : "Marque ao menos um produto para continuar"}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <SummaryRow label="Produtos" value={formatarDinheiro(selectedSubtotalCents)} />
          <SummaryRow label="Entrega" value="Por loja no checkout" />
          <SummaryRow strong label="Subtotal selecionado" value={formatarDinheiro(selectedSubtotalCents)} />
        </View>
      ) : null}

      <View style={styles.actions}>
        <AppButton
          disabled={!selectedItemCount}
          icon="arrow-forward"
          onPress={continuePurchase}
          title={selectedStoreCount > 1
            ? `Finalizar ${selectedStoreCount} lojas`
            : "Continuar compra"}
        />
        <AppButton
          onPress={() => navigation.navigate("Main", { screen: "Buscar" })}
          title="Adicionar mais produtos"
          variant="outline"
        />
      </View>
    </ScreenContainer>
  );
}

function StoreCartGroup({ group, onRemove, onStoreSelected, onToggleSelected, onUpdateQuantity }) {
  const selected = group.items.filter((item) => item.selected);
  const allSelected = selected.length === group.items.length;
  const selectedSubtotalCents = cartSubtotalCents(selected);
  const storeLogo = resolveMediaUrl(group.store?.logoUrl);
  const delivery = group.store?.delivery;

  return (
    <View style={styles.storeCard}>
      <View style={styles.storeHeader}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allSelected }}
          onPress={() => onStoreSelected(!allSelected)}
          style={styles.storeSelect}
        >
          <Ionicons
            color={allSelected ? colors.primaryDark : colors.textMuted}
            name={allSelected ? "checkbox" : selected.length ? "remove-circle" : "square-outline"}
            size={23}
          />
        </Pressable>
        <View style={styles.storeLogo}>
          {storeLogo ? (
            <Image source={{ uri: storeLogo }} style={styles.storeLogoImage} />
          ) : (
            <Ionicons color={colors.primaryDark} name="storefront-outline" size={19} />
          )}
        </View>
        <View style={styles.storeCopy}>
          <Text numberOfLines={1} style={styles.storeName}>{group.store?.name ?? "Loja"}</Text>
          <Text style={styles.storeMeta}>
            {delivery?.available
              ? `Entrega ${formatarDinheiro(delivery.feeCents ?? 0)}`
              : "Retirada disponivel"}
          </Text>
        </View>
        <View style={styles.storeSelectedBadge}>
          <Text style={styles.storeSelectedText}>{selected.length}/{group.items.length}</Text>
        </View>
      </View>

      <View style={styles.storeItems}>
        {group.items.map((item) => (
          <CartItem
            item={item}
            key={item.cartKey}
            onDecrease={() => onUpdateQuantity(item.cartKey, item.quantity - 1)}
            onIncrease={() => onUpdateQuantity(item.cartKey, item.quantity + 1)}
            onRemove={() => onRemove(item.cartKey)}
            onToggle={() => onToggleSelected(item.cartKey)}
          />
        ))}
      </View>
      <View style={styles.storeSummary}>
        <Text style={styles.storeSummaryLabel}>
          {selected.length ? "Selecionado nesta loja" : "Nenhum item marcado"}
        </Text>
        <Text style={styles.storeSummaryValue}>
          {formatarDinheiro(selectedSubtotalCents)}
        </Text>
      </View>
    </View>
  );
}

function CartItem({ item, onDecrease, onIncrease, onRemove, onToggle }) {
  const imageUrl = resolveMediaUrl(item.imageUrl);

  return (
    <View style={[styles.itemCard, !item.selected && styles.itemCardUnselected]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.selected }}
        hitSlop={6}
        onPress={onToggle}
        style={styles.itemCheckbox}
      >
        <Ionicons
          color={item.selected ? colors.primaryDark : colors.textMuted}
          name={item.selected ? "checkbox" : "square-outline"}
          size={22}
        />
      </Pressable>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.itemImage} />
      ) : (
        <View style={styles.itemImageFallback}>
          <Ionicons color={colors.primaryDark} name="cube-outline" size={22} />
        </View>
      )}
      <View style={styles.itemCopy}>
        <Text numberOfLines={2} style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemPrice}>{formatarDinheiro(item.priceCents)}</Text>
        <View style={styles.itemBottom}>
          <View style={styles.stepper}>
            <Pressable onPress={onDecrease} style={styles.stepperButton}>
              <Ionicons color={colors.primaryDark} name="remove" size={15} />
            </Pressable>
            <Text style={styles.stepperText}>{item.quantity}</Text>
            <Pressable onPress={onIncrease} style={styles.stepperButton}>
              <Ionicons color={colors.primaryDark} name="add" size={15} />
            </Pressable>
          </View>
          <Pressable accessibilityLabel={`Remover ${item.name}`} onPress={onRemove} style={styles.removeButton}>
            <Ionicons color={colors.danger} name="trash-outline" size={17} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SelectionBox({ checked, label, onPress }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => [styles.selectionAction, pressed && styles.pressed]}
    >
      <Ionicons color={checked ? colors.primaryDark : colors.textMuted} name={checked ? "checkbox" : "square-outline"} size={21} />
      <Text style={styles.selectionActionText}>{label}</Text>
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
  actions: { gap: spacing.md },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  divider: { backgroundColor: colors.border, height: 1 },
  emptyIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 60, justifyContent: "center", width: 60 },
  emptyState: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: spacing.sm, minHeight: 220, justifyContent: "center", padding: spacing.xl },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, textAlign: "center" },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  groups: { gap: spacing.lg },
  itemBottom: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  itemCard: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.md },
  itemCardUnselected: { opacity: 0.58 },
  itemCheckbox: { alignItems: "center", justifyContent: "center" },
  itemCopy: { flex: 1, gap: 3, minWidth: 0 },
  itemImage: { borderRadius: radius.lg, height: 68, width: 68 },
  itemImageFallback: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 68, justifyContent: "center", width: 68 },
  itemName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, lineHeight: 18 },
  itemPrice: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.label },
  pressed: { opacity: 0.78 },
  removeButton: { alignItems: "center", height: 32, justifyContent: "center", width: 32 },
  selectionAction: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  selectionActionText: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  selectionBar: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: spacing.md },
  selectionCount: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  stepper: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: spacing.sm, padding: 3 },
  stepperButton: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 27, justifyContent: "center", width: 27 },
  stepperText: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.caption, minWidth: 18, textAlign: "center" },
  storeCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, overflow: "hidden", paddingHorizontal: spacing.md, ...shadowSoft },
  storeCopy: { flex: 1, gap: 2, minWidth: 0 },
  storeHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.md },
  storeItems: { gap: 0 },
  storeLogo: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", overflow: "hidden", width: 42 },
  storeLogoImage: { height: "100%", width: "100%" },
  storeMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10 },
  storeName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small },
  storeSelect: { alignItems: "center", justifyContent: "center" },
  storeSelectedBadge: { backgroundColor: colors.primarySoft, borderRadius: radius.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  storeSelectedText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10 },
  storeSummary: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.md },
  storeSummaryLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  storeSummaryValue: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.small },
  summary: { backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: 18, borderWidth: 1, gap: spacing.md, padding: spacing.lg, ...shadowSoft },
  summaryHeading: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  summaryHeadingCopy: { flex: 1, gap: 2 },
  summaryHint: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10, lineHeight: 14 },
  summaryIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  summaryLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.small },
  summaryRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  summaryStrong: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.body },
  summaryTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small },
  summaryValue: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, textAlign: "right" },
});
