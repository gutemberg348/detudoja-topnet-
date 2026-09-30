import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
    clearCart,
    itemCount,
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
  const [confirmClearVisible, setConfirmClearVisible] = useState(false);

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

  function emptyCart() {
    clearCart();
    setConfirmClearVisible(false);
  }

  function browseProducts() {
    navigation.navigate("Main", { screen: "Buscar" });
  }

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
    <View style={styles.screen}>
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <PageHeader
        action={items.length ? (
          <Pressable
            accessibilityLabel="Esvaziar carrinho"
            accessibilityRole="button"
            onPress={() => setConfirmClearVisible(true)}
            style={({ pressed }) => [styles.clearAction, pressed && styles.pressed]}
          >
            <Ionicons color={colors.danger} name="trash-outline" size={17} />
            <Text style={styles.clearActionText}>Esvaziar</Text>
          </Pressable>
        ) : null}
        eyebrow="Suas escolhas"
        subtitle={items.length
          ? `${itemCount} ${itemCount === 1 ? "item" : "itens"} em ${groups.length} ${groups.length === 1 ? "loja" : "lojas"}`
          : "Tudo pronto para sua próxima compra"}
        title="Carrinho"
      />

      {items.length ? (
        <>
          <View style={styles.selectionBar}>
            <View style={styles.selectionCopy}>
              <Text style={styles.selectionTitle}>Escolha o que levar</Text>
              <Text style={styles.selectionHint}>Os demais produtos ficam guardados.</Text>
            </View>
            <SelectionBox checked={allSelected}
              label={allSelected ? "Desmarcar" : "Marcar todos"}
              onPress={() => setAllSelected(!allSelected)} />
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
            <Ionicons color={colors.primaryDark} name="bag-handle-outline" size={38} />
          </View>
          <Text style={styles.emptyTitle}>Seu carrinho está vazio</Text>
          <Text style={styles.emptyText}>Encontre algo que você goste e seus produtos aparecem aqui.</Text>
          <AppButton icon="search-outline" onPress={browseProducts}
            style={styles.emptyButton} title="Explorar produtos" />
        </View>
      )}
    </ScreenContainer>
    {items.length ? (
      <SafeAreaView edges={["bottom"]} style={styles.checkoutFooter}>
        <View style={styles.footerTotalRow}>
          <View style={styles.footerTotalCopy}>
            <Text style={styles.footerLabel}>Subtotal selecionado</Text>
            <Text style={styles.footerMeta}>
              {selectedItemCount
                ? `${selectedItemCount} ${selectedItemCount === 1 ? "item" : "itens"} · ${selectedStoreCount} ${selectedStoreCount === 1 ? "loja" : "lojas"}`
                : "Marque pelo menos um produto"}
            </Text>
          </View>
          <Text style={styles.footerAmount}>{formatarDinheiro(selectedSubtotalCents)}</Text>
        </View>
        <Text style={styles.deliveryNote}>Entrega e taxas são informadas no checkout.</Text>
        <AppButton disabled={!selectedItemCount} icon="arrow-forward"
          onPress={continuePurchase}
          title={selectedStoreCount > 1 ? `Continuar com ${selectedStoreCount} lojas` : "Continuar compra"} />
        <Pressable accessibilityRole="button" onPress={browseProducts}
          style={({ pressed }) => [styles.browseAction, pressed && styles.pressed]}>
          <Ionicons color={colors.primaryDark} name="add" size={18} />
          <Text style={styles.browseActionText}>Adicionar mais produtos</Text>
        </Pressable>
      </SafeAreaView>
    ) : null}
    <Modal animationType="fade" onRequestClose={() => setConfirmClearVisible(false)}
      transparent visible={confirmClearVisible}>
      <View style={styles.modalBackdrop}>
        <View accessibilityViewIsModal style={styles.confirmCard}>
          <View style={styles.confirmIcon}>
            <Ionicons color={colors.danger} name="trash-outline" size={25} />
          </View>
          <Text style={styles.confirmTitle}>Esvaziar carrinho?</Text>
          <Text style={styles.confirmText}>
            Os {itemCount} {itemCount === 1 ? "item" : "itens"} de todas as lojas serão removidos. Seus pedidos já feitos não mudam.
          </Text>
          <View style={styles.confirmActions}>
            <AppButton onPress={() => setConfirmClearVisible(false)}
              style={styles.confirmButton} title="Manter itens" variant="neutral" />
            <AppButton onPress={emptyCart} style={styles.confirmButton}
              title="Esvaziar" variant="danger" />
          </View>
        </View>
      </View>
    </Modal>
    </View>
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
          accessibilityLabel={`${allSelected ? "Desmarcar" : "Selecionar"} produtos de ${group.store?.name ?? "loja"}`}
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
          <View style={styles.storeDeliveryRow}>
            <Ionicons color={colors.textSecondary}
              name={delivery?.available ? "bicycle-outline" : "bag-check-outline"} size={13} />
            <Text style={styles.storeMeta}>
              {delivery?.available
                ? `Entrega ${formatarDinheiro(delivery.feeCents ?? 0)}`
                : "Retirada disponível"}
            </Text>
          </View>
        </View>
        <View style={styles.storeSelectedBadge}>
          <Text style={styles.storeSelectedText}>{selected.length}/{group.items.length}</Text>
        </View>
      </View>

      <View style={styles.storeItems}>
        {group.items.map((item, index) => (
          <CartItem
            item={item}
            isLast={index === group.items.length - 1}
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

function CartItem({ item, isLast, onDecrease, onIncrease, onRemove, onToggle }) {
  const imageUrl = resolveMediaUrl(item.imageUrl);

  return (
    <View style={[styles.itemCard, !isLast && styles.itemCardDivider,
      !item.selected && styles.itemCardUnselected]}>
      <Pressable
        accessibilityLabel={`${item.selected ? "Desmarcar" : "Selecionar"} ${item.name}`}
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
        <Text style={styles.itemPrice}>{formatarDinheiro(item.priceCents)} <Text style={styles.unitLabel}>/ un.</Text></Text>
        <View style={styles.itemBottom}>
          <View style={styles.stepper}>
            <Pressable accessibilityLabel={`Diminuir quantidade de ${item.name}`}
              accessibilityRole="button" onPress={onDecrease} style={styles.stepperButton}>
              <Ionicons color={colors.primaryDark} name="remove" size={15} />
            </Pressable>
            <Text style={styles.stepperText}>{item.quantity}</Text>
            <Pressable accessibilityLabel={`Aumentar quantidade de ${item.name}`}
              accessibilityRole="button" onPress={onIncrease} style={styles.stepperButton}>
              <Ionicons color={colors.primaryDark} name="add" size={15} />
            </Pressable>
          </View>
          <Pressable accessibilityLabel={`Remover ${item.name}`} accessibilityRole="button"
            onPress={onRemove} style={styles.removeButton}>
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

const styles = StyleSheet.create({
  browseAction: { alignItems: "center", flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 38 },
  browseActionText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.small },
  checkoutFooter: { backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1, gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.md, ...shadowSoft },
  clearAction: { alignItems: "center", backgroundColor: colors.dangerSoft, borderRadius: radius.round, flexDirection: "row", gap: 5, minHeight: 35, paddingHorizontal: 11 },
  clearActionText: { color: colors.danger, fontFamily: fonts.bold, fontSize: typography.caption },
  confirmActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  confirmButton: { flex: 1, paddingHorizontal: spacing.sm },
  confirmCard: { backgroundColor: colors.card, borderRadius: 22, gap: spacing.sm, maxWidth: 400, padding: spacing.xl, width: "100%" },
  confirmIcon: { alignItems: "center", backgroundColor: colors.dangerSoft, borderRadius: radius.round, height: 48, justifyContent: "center", marginBottom: 4, width: 48 },
  confirmText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.label, lineHeight: 21 },
  confirmTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2 },
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  deliveryNote: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  emptyButton: { alignSelf: "stretch", marginTop: spacing.md },
  emptyIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 27, height: 78, justifyContent: "center", marginBottom: spacing.sm, width: 78 },
  emptyState: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: 22, borderWidth: 1, gap: spacing.sm, justifyContent: "center", marginTop: spacing.md, padding: spacing.xl, paddingVertical: spacing.xxxl },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.label, lineHeight: 21, textAlign: "center" },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, textAlign: "center" },
  footerAmount: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.h2, textAlign: "right" },
  footerLabel: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.label },
  footerMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  footerTotalCopy: { flex: 1, gap: 2 },
  footerTotalRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  groups: { gap: spacing.lg },
  itemBottom: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  itemCard: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.md },
  itemCardDivider: { borderBottomColor: colors.border, borderBottomWidth: 1 },
  itemCardUnselected: { opacity: 0.65 },
  itemCheckbox: { alignItems: "center", justifyContent: "center" },
  itemCopy: { flex: 1, gap: 3, minWidth: 0 },
  itemImage: { borderRadius: 12, height: 72, width: 72 },
  itemImageFallback: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 12, height: 72, justifyContent: "center", width: 72 },
  itemName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, lineHeight: 18 },
  itemPrice: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.label },
  modalBackdrop: { alignItems: "center", backgroundColor: "rgba(15, 23, 19, 0.48)", flex: 1, justifyContent: "center", padding: spacing.xl },
  pressed: { opacity: 0.78 },
  removeButton: { alignItems: "center", backgroundColor: colors.dangerSoft, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  screen: { backgroundColor: colors.background, flex: 1 },
  selectionAction: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: 5, minHeight: 38, paddingHorizontal: 10 },
  selectionActionText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption },
  selectionBar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 16, flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", padding: spacing.md },
  selectionCopy: { flex: 1, gap: 2, minWidth: 0 },
  selectionHint: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  selectionTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  stepper: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: spacing.xs, padding: 3 },
  stepperButton: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 29, justifyContent: "center", width: 29 },
  stepperText: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.caption, minWidth: 18, textAlign: "center" },
  storeCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 20, borderWidth: 1, overflow: "hidden", paddingHorizontal: spacing.md, ...shadowSoft },
  storeCopy: { flex: 1, gap: 2, minWidth: 0 },
  storeDeliveryRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  storeHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.md },
  storeItems: { paddingBottom: 2 },
  storeLogo: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", overflow: "hidden", width: 44 },
  storeLogoImage: { height: "100%", width: "100%" },
  storeMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  storeName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  storeSelect: { alignItems: "center", justifyContent: "center" },
  storeSelectedBadge: { backgroundColor: colors.primarySoft, borderRadius: radius.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  storeSelectedText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 11 },
  storeSummary: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: 10, flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md, padding: spacing.md },
  storeSummaryLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  storeSummaryValue: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.label },
  unitLabel: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: typography.caption },
});
