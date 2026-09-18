import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuthStore } from "./useAuthStore";

const emptyCart = { items: [] };
const CartContext = createContext(null);

function cartKey(storeId, itemId) {
  return `${storeId}:${itemId}`;
}

function cartItem(item, store, conversationId = null, selected = true) {
  return {
    ...item,
    cartKey: item.cartKey ?? cartKey(store?.id, item.id),
    conversationId: item.conversationId ?? conversationId,
    selected: item.selected ?? selected,
    store: item.store ?? store,
    storeId: item.storeId ?? store?.id,
  };
}

export function CartStoreProvider({ children }) {
  const { session } = useAuthStore();
  const [cart, setCartState] = useState(emptyCart);
  const previousUserId = useRef(session?.user?.id ?? null);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId || (previousUserId.current && previousUserId.current !== userId)) {
      setCartState(emptyCart);
    }
    previousUserId.current = userId;
  }, [userId]);

  const clearCart = useCallback(() => setCartState(emptyCart), []);

  const setCart = useCallback(({ conversationId = null, items = [], store = null }) => {
    setCartState({
      items: items.map((item) => cartItem(item, item.store ?? store, item.conversationId ?? conversationId)),
    });
  }, []);

  const addItem = useCallback((item, store, conversationId = null) => {
    if (!item?.id || !store?.id) return;
    const nextItem = cartItem(item, store, conversationId);

    setCartState((current) => {
      const existing = current.items.find((candidate) => candidate.cartKey === nextItem.cartKey);
      const items = existing
        ? current.items.map((candidate) => candidate.cartKey === nextItem.cartKey
          ? {
              ...candidate,
              ...nextItem,
              quantity: Math.min(99, Number(candidate.quantity ?? 0) + Number(item.quantity ?? 1)),
              selected: true,
            }
          : candidate)
        : [...current.items, nextItem];

      return { items };
    });
  }, []);

  const updateItemQuantity = useCallback((itemKey, quantity) => {
    setCartState((current) => ({
      items: current.items.map((item) => item.cartKey === itemKey
        ? { ...item, quantity: Math.max(1, Math.min(Number(quantity) || 1, 99)) }
        : item),
    }));
  }, []);

  const toggleItemSelected = useCallback((itemKey) => {
    setCartState((current) => ({
      items: current.items.map((item) => item.cartKey === itemKey
        ? { ...item, selected: !item.selected }
        : item),
    }));
  }, []);

  const setAllSelected = useCallback((selected) => {
    setCartState((current) => ({
      items: current.items.map((item) => ({ ...item, selected })),
    }));
  }, []);

  const setStoreSelected = useCallback((storeId, selected) => {
    setCartState((current) => ({
      items: current.items.map((item) => String(item.storeId) === String(storeId)
        ? { ...item, selected }
        : item),
    }));
  }, []);

  const removeItem = useCallback((itemKey) => {
    setCartState((current) => ({
      items: current.items.filter((item) => item.cartKey !== itemKey),
    }));
  }, []);

  const removeItems = useCallback((itemKeys = []) => {
    const keys = new Set(itemKeys);
    if (!keys.size) return;
    setCartState((current) => ({
      items: current.items.filter((item) => !keys.has(item.cartKey)),
    }));
  }, []);

  const itemCount = useMemo(
    () => cart.items.reduce((total, item) => total + Number(item.quantity ?? 0), 0),
    [cart.items],
  );
  const selectedItems = useMemo(
    () => cart.items.filter((item) => item.selected),
    [cart.items],
  );
  const selectedItemCount = useMemo(
    () => selectedItems.reduce((total, item) => total + Number(item.quantity ?? 0), 0),
    [selectedItems],
  );
  const totalCents = useMemo(
    () => cart.items.reduce(
      (total, item) => total + Number(item.priceCents ?? 0) * Number(item.quantity ?? 0),
      0,
    ),
    [cart.items],
  );
  const selectedTotalCents = useMemo(
    () => selectedItems.reduce(
      (total, item) => total + Number(item.priceCents ?? 0) * Number(item.quantity ?? 0),
      0,
    ),
    [selectedItems],
  );
  const itemCountForStore = useCallback((storeId) => cart.items.reduce(
    (total, item) => String(item.storeId) === String(storeId)
      ? total + Number(item.quantity ?? 0)
      : total,
    0,
  ), [cart.items]);

  const value = useMemo(() => ({
    ...cart,
    addItem,
    clearCart,
    itemCount,
    itemCountForStore,
    removeItem,
    removeItems,
    selectedItemCount,
    selectedItems,
    selectedTotalCents,
    setAllSelected,
    setCart,
    setStoreSelected,
    toggleItemSelected,
    totalCents,
    updateItemQuantity,
  }), [
    addItem,
    cart,
    clearCart,
    itemCount,
    itemCountForStore,
    removeItem,
    removeItems,
    selectedItemCount,
    selectedItems,
    selectedTotalCents,
    setAllSelected,
    setCart,
    setStoreSelected,
    toggleItemSelected,
    totalCents,
    updateItemQuantity,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCartStore() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCartStore must be used inside CartStoreProvider");
  return context;
}
