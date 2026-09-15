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

const emptyCart = {
  conversationId: null,
  items: [],
  store: null,
};
const CartContext = createContext(null);

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
    setCartState({ conversationId, items, store });
  }, []);

  const addItem = useCallback((item, store, conversationId = null) => {
    setCartState((current) => {
      if (!current.store?.id || current.store.id !== store?.id) {
        return { conversationId, items: [item], store };
      }

      const existing = current.items.find((candidate) => candidate.id === item.id);
      const items = existing
        ? current.items.map((candidate) => candidate.id === item.id
          ? {
              ...candidate,
              ...item,
              quantity: Math.min(99, Number(candidate.quantity ?? 0) + Number(item.quantity ?? 1)),
            }
          : candidate)
        : [...current.items, item];

      return {
        conversationId: conversationId ?? current.conversationId,
        items,
        store: current.store,
      };
    });
  }, []);

  const updateItemQuantity = useCallback((itemId, quantity) => {
    setCartState((current) => ({
      ...current,
      items: current.items
        .map((item) => item.id === itemId
          ? { ...item, quantity: Math.max(1, Math.min(Number(quantity) || 1, 99)) }
          : item),
    }));
  }, []);

  const removeItem = useCallback((itemId) => {
    setCartState((current) => {
      const items = current.items.filter((item) => item.id !== itemId);
      return items.length ? { ...current, items } : emptyCart;
    });
  }, []);

  const itemCount = useMemo(
    () => cart.items.reduce((total, item) => total + Number(item.quantity ?? 0), 0),
    [cart.items],
  );
  const totalCents = useMemo(
    () => cart.items.reduce(
      (total, item) => total + Number(item.priceCents ?? 0) * Number(item.quantity ?? 0),
      0,
    ),
    [cart.items],
  );
  const value = useMemo(() => ({
    ...cart,
    addItem,
    clearCart,
    itemCount,
    removeItem,
    setCart,
    totalCents,
    updateItemQuantity,
  }), [addItem, cart, clearCart, itemCount, removeItem, setCart, totalCents, updateItemQuantity]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCartStore() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCartStore must be used inside CartStoreProvider");
  return context;
}
