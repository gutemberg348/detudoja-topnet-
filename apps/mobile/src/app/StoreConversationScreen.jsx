import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import { ChatComposer } from "../components/ChatComposer";
import { ChatAttachment } from "../components/ChatAttachment";
import { ChatMessageMeta } from "../components/ChatMessageMeta";
import { ChatScrollToLatestButton } from "../components/ChatScrollToLatestButton";
import { ChatTypingIndicator } from "../components/ChatTypingIndicator";
import { BackHeader } from "../components/BackHeader";
import { CartAddButton } from "../components/CartAddButton";
import { useConversationRealtime } from "../hooks/useConversationRealtime";
import { useRealtimeOrders } from "../hooks/useRealtimeOrders";
import { useChatTimeline } from "../hooks/useChatTimeline";
import { useChatTyping } from "../hooks/useChatTyping";
import { getMarketplaceStore } from "../services/marketplace.api";
import { cancelCustomerOrder, getCustomerOrders } from "../services/orders.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import {
  getStoreConversation,
  markStoreConversationRead,
  openStoreConversation,
  sendStoreConversationMessage,
  setStoreConversationTyping,
  trackStoreConversationActivity,
} from "../services/store-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { useCartStore } from "../stores/useCartStore";
import { buildCartItem } from "../utils/checkout";
import { resolveMediaUrl } from "../utils/media";
import { formatarDinheiro } from "../utils/money";
import { matchesSearchText, normalizeSearchText } from "../utils/search";
import {
  colors,
  fonts,
  radius,
  shadowSoft,
  spacing,
  typography,
} from "../utils/theme";

export function StoreConversationScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const {
    addItem,
    itemCountForStore,
    items: cartItems,
  } = useCartStore();
  const insets = useSafeAreaInsets();
  const initialConversation = route.params?.conversation ?? null;
  const initialStore = route.params?.store ?? null;
  const scrollRef = useRef(null);
  const cartTargetRef = useRef(null);
  const cartCountPulse = useRef(new Animated.Value(1)).current;
  const cartFlightProgress = useRef(new Animated.Value(0)).current;
  const searchRevealTimerRef = useRef(null);
  const [conversation, setConversation] = useState(initialConversation);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initialConversation?.messages);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [messagePage, setMessagePage] = useState({ hasMore: true, nextCursor: null });
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [cartFlight, setCartFlight] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [cancelingOrderId, setCancelingOrderId] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(route.params?.openOrderId ?? null);
  const [ordersVisible, setOrdersVisible] = useState(Boolean(route.params?.openOrderId));
  const [openingContent, setOpeningContent] = useState("");
  const [sending, setSending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState("");
  const [supportMode, setSupportMode] = useState(false);
  const [searchPendingMessageId, setSearchPendingMessageId] = useState(null);
  const [searchThinking, setSearchThinking] = useState(false);
  const [catalogSearchFocused, setCatalogSearchFocused] = useState(false);
  const [storeCatalog, setStoreCatalog] = useState(
    initialStore?.products ? initialStore : null,
  );
  const conversationId = conversation?.id ?? initialConversation?.id ?? route.params?.conversationId;
  const storeId =
    conversation?.store?.id
    ?? initialConversation?.store?.id
    ?? initialStore?.id
    ?? route.params?.storeId;
  const currentStoreItemCount = itemCountForStore(storeId);
  const timeline = useChatTimeline({
    latestMessageId: conversation?.messages?.at(-1)?.id,
    latestMessageIsMine: conversation?.messages?.at(-1)?.isMine,
    scrollRef,
  });
  const typing = useChatTyping({
    conversationId,
    draft,
    sendTyping: (isTyping) => setStoreConversationTyping(session?.accessToken, conversationId, isTyping),
  });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken) {
      return;
    }

    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const response = conversationId
        ? await getStoreConversation(session.accessToken, conversationId)
        : await openStoreConversation(session.accessToken, storeId);

      setConversation(response.conversation);
      setMessagePage(response.messagePage ?? { hasMore: false, nextCursor: null });
      if (!response.conversation?.isStore && response.conversation?.store?.id) {
        try {
          const storeResponse = await getMarketplaceStore(
            session.accessToken,
            response.conversation.store.id,
          );
          setStoreCatalog(storeResponse.store ?? null);
        } catch {
          // A conversa continua utilizavel mesmo se o catalogo oscilar.
        }
      }
    } catch (requestError) {
      if (!silent) {
        setError(
          requestError.message
          ?? "Nao foi possivel abrir a conversa com a loja.",
        );
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [conversationId, session?.accessToken, storeId]);

  const loadOlder = useCallback(async () => {
    if (!session?.accessToken || !conversation?.id || loadingOlder || !messagePage.hasMore || !messagePage.nextCursor) return;
    setLoadingOlder(true);
    try {
      const response = await getStoreConversation(session.accessToken, conversation.id, {
        beforeMessageId: messagePage.nextCursor,
      });
      setConversation((current) => {
        if (!current) return response.conversation;
        const known = new Set((current.messages ?? []).map((item) => Number(item.id)));
        const older = (response.conversation?.messages ?? []).filter((item) => !known.has(Number(item.id)));
        return { ...current, messages: [...older, ...(current.messages ?? [])] };
      });
      setMessagePage(response.messagePage ?? { hasMore: false, nextCursor: null });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar mensagens antigas.");
    } finally {
      setLoadingOlder(false);
    }
  }, [conversation?.id, loadingOlder, messagePage.hasMore, messagePage.nextCursor, session?.accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (route.params?.openOrderId) {
      setExpandedOrderId(route.params.openOrderId);
      setOrdersVisible(true);
    }
  }, [route.params?.openOrderId]);

  const loadCustomerOrders = useCallback(async () => {
    if (!session?.accessToken || !storeId || conversation?.isStore) return;
    try {
      const response = await getCustomerOrders(session.accessToken, { storeId });
      setCustomerOrders((response.orders ?? []).sort(
        (first, second) => new Date(second.createdAt) - new Date(first.createdAt),
      ));
    } catch {
      // O chat permanece disponivel mesmo se o resumo de pedidos oscilar.
    }
  }, [conversation?.isStore, session?.accessToken, storeId]);

  useEffect(() => {
    loadCustomerOrders();
  }, [loadCustomerOrders]);

  useEffect(() => {
    if (conversation?.isStore || currentStoreItemCount <= 0) return;
    cartCountPulse.stopAnimation();
    cartCountPulse.setValue(0.76);
    Animated.spring(cartCountPulse, {
      friction: 4,
      tension: 150,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [cartCountPulse, conversation?.isStore, currentStoreItemCount]);

  useRealtimeOrders({
    accessToken: session?.accessToken,
    active: Boolean(storeId && !conversation?.isStore),
    onMessageEvent: loadCustomerOrders,
    onOrderEvent: loadCustomerOrders,
    storeId,
  });

  useEffect(() => () => {
    if (searchRevealTimerRef.current) {
      clearTimeout(searchRevealTimerRef.current);
    }
  }, []);

  const refreshConversation = useCallback(() => {
    load({ silent: true });
  }, [load]);

  useConversationRealtime({
    accessToken: session?.accessToken,
    conversationId: conversation?.id,
    events: [
      realtimeEvents.storeChatUpdated,
    ],
    ignoreReasons: ["read"],
    onUpdate: refreshConversation,
  });

  useEffect(() => {
    if (!session?.accessToken || !conversation?.id) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const onMessage = (payload = {}) => {
      if (Number(payload.conversationId) !== Number(conversation.id) || !payload.message) return;
      const message = {
        ...payload.message,
        isMine: Number(payload.senderUserId) === Number(session.user?.id),
      };
      setConversation((current) => {
        if (!current || current.messages?.some((item) => Number(item.id) === Number(message.id))) return current;
        return { ...current, lastMessage: message, messages: [...(current.messages ?? []), message] };
      });
      if (!message.isMine) void markStoreConversationRead(session.accessToken, conversation.id).catch(() => {});
    };
    const onUpdated = (payload = {}) => {
      if (Number(payload.conversationId) !== Number(conversation.id) || payload.reason !== "read") return;
      const readAt = new Date().toISOString();
      setConversation((current) => current
        ? { ...current, messages: (current.messages ?? []).map((item) => item.isMine && !item.readAt ? { ...item, readAt } : item) }
        : current);
    };
    const onTyping = (payload = {}) => {
      if (payload.scope === "store" && Number(payload.senderUserId) !== Number(session.user?.id)) typing.receiveTyping(payload);
    };
    socket?.on(realtimeEvents.storeChatMessageCreated, onMessage);
    socket?.on(realtimeEvents.chatTyping, onTyping);
    socket?.on(realtimeEvents.storeChatUpdated, onUpdated);
    return () => {
      socket?.off(realtimeEvents.storeChatMessageCreated, onMessage);
      socket?.off(realtimeEvents.chatTyping, onTyping);
      socket?.off(realtimeEvents.storeChatUpdated, onUpdated);
    };
  }, [conversation?.id, session?.accessToken, session?.user?.id, typing.receiveTyping]);

  async function send(payload = null) {
    const isCommercial = payload?.type && payload.type !== "TEXTO";
    const message = payload?.message ?? (isCommercial ? "" : draft.trim());
    const sendsSupport = !conversation?.isStore && supportMode && !isCommercial;
    const searchesCatalog = !conversation?.isStore
      && !sendsSupport
      && Boolean(message && !payload?.attachment && !isCommercial);

    if ((!message && !payload?.attachment && !isCommercial) || !conversation?.id || sending || !session?.accessToken) {
      return;
    }

    setSending(true);
    setError("");
    Keyboard.dismiss();
    setCatalogSearchFocused(false);
    if (!payload?.attachment && !isCommercial) {
      setDraft("");
    }
    const searchStartedAt = Date.now();
    if (searchesCatalog) {
      if (searchRevealTimerRef.current) {
        clearTimeout(searchRevealTimerRef.current);
      }
      setSearchPendingMessageId(null);
      setSearchThinking(true);
    }

    try {
      const response = await sendStoreConversationMessage(
        session.accessToken,
        conversation.id,
        conversation.isStore
          ? (payload ?? message)
          : {
              ...(payload ?? {}),
              message,
              searchCatalog: searchesCatalog,
              support: sendsSupport,
            },
      );

      setConversation((current) => {
        if (!current) return response.conversation;
        const messages = [...(current.messages ?? [])];
        if (response.message && !messages.some((item) => Number(item.id) === Number(response.message.id))) messages.push(response.message);
        return { ...current, ...response.conversation, messages };
      });
      if (searchesCatalog) {
        const searchMessage = response.message?.content?.kind === "SEARCH" ? response.message : null;
        setSearchPendingMessageId(searchMessage?.id ?? null);
        const remainingDelay = Math.max(350, 2000 - (Date.now() - searchStartedAt));
        searchRevealTimerRef.current = setTimeout(() => {
          setSearchPendingMessageId(null);
          setSearchThinking(false);
          searchRevealTimerRef.current = null;
        }, remainingDelay);
      }
    } catch (requestError) {
      if (searchRevealTimerRef.current) {
        clearTimeout(searchRevealTimerRef.current);
        searchRevealTimerRef.current = null;
      }
      setSearchPendingMessageId(null);
      setSearchThinking(false);
      if (!payload?.attachment && !isCommercial) {
        setDraft((current) => current || message);
      }
      setError(requestError.message ?? "Nao foi possivel enviar a mensagem.");
      throw requestError;
    } finally {
      setSending(false);
    }
  }

  function openProduct(product) {
    if (conversation?.id && session?.accessToken && !conversation.isStore) {
      void trackStoreConversationActivity(session.accessToken, conversation.id, {
        action: "VIEW_PRODUCT",
        productId: product.id,
      }).catch(() => {});
    }
    setCatalogOpen(false);
    navigation.navigate("ProductDetails", {
      conversationId: conversation?.id,
      product,
      store: storeCatalog ?? initialStore,
    });
  }

  function animateProductToCart(product, origin) {
    if (!origin?.pageX || !origin?.pageY || !cartTargetRef.current) return;
    cartTargetRef.current.measureInWindow((targetX, targetY, width, height) => {
      const targetCenterX = targetX + (width / 2);
      const targetCenterY = targetY + (height / 2);
      setCartFlight({
        deltaX: targetCenterX - origin.pageX,
        deltaY: targetCenterY - origin.pageY,
        imageUrl: resolveMediaUrl(product.imageUrl),
        startX: origin.pageX - 19,
        startY: origin.pageY - insets.top - 19,
      });
      cartFlightProgress.stopAnimation();
      cartFlightProgress.setValue(0);
      requestAnimationFrame(() => {
        Animated.timing(cartFlightProgress, {
          duration: 620,
          toValue: 1,
          useNativeDriver: true,
        }).start(() => setCartFlight(null));
      });
    });
  }

  function addProduct(product, origin = null) {
    if (!storeView || !product) return;
    const alreadyInCart = cartItems.some((item) => (
      String(item.storeId) === String(storeView.id)
      && String(item.id) === String(product.id)
    ));
    addItem(buildCartItem(product), storeView, conversation?.id);
    animateProductToCart(product, origin);
    if (!alreadyInCart && conversation?.id && session?.accessToken && !conversation.isStore) {
      void trackStoreConversationActivity(session.accessToken, conversation.id, {
        action: "ADD_TO_CART",
        productId: product.id,
      }).catch(() => {});
    }
  }

  function addSharedProduct(product, origin = null) {
    const catalogProduct = (storeView?.products ?? []).find(
      (item) => String(item.id) === String(product?.id),
    );
    addProduct(catalogProduct ?? product, origin);
  }

  function requestPaidOrderCancellation(order, refundDestination) {
    const toBalance = refundDestination === "BALANCE";
    Alert.alert(
      "Cancelar este pedido?",
      toBalance
        ? "O valor total sera creditado no Saldo Pix do aplicativo."
        : order.customerCancellation?.originalDestination === "PIX_ORIGEM"
          ? "O estorno sera solicitado para a conta Pix de origem e pode depender do prazo do banco."
          : "O valor voltara para as carteiras usadas no pagamento.",
      [
        { style: "cancel", text: "Continuar esperando" },
        {
          onPress: async () => {
            setCancelingOrderId(order.id);
            setError("");
            try {
              await cancelCustomerOrder(session.accessToken, order.id, { refundDestination });
              await loadCustomerOrders();
            } catch (requestError) {
              setError(requestError.message ?? "Nao foi possivel cancelar o pedido.");
            } finally {
              setCancelingOrderId(null);
            }
          },
          style: "destructive",
          text: toBalance ? "Cancelar e usar saldo" : "Cancelar e estornar",
        },
      ],
    );
  }

  async function shareCommercialContent(type, productId = null) {
    if (!conversation?.isStore || !conversation?.id || sharing) {
      return;
    }

    setSharing(`${type}-${productId ?? ""}`);
    setError("");

    try {
      const response = await sendStoreConversationMessage(
        session.accessToken,
        conversation.id,
        {
          productId: productId ?? undefined,
          type,
        },
      );

      setConversation(response.conversation);
      setShareOpen(false);
    } catch (requestError) {
      setError(
        requestError.message
        ?? "Nao foi possivel compartilhar este item.",
      );
    } finally {
      setSharing("");
    }
  }

  async function openCommercialContent(message) {
    const content = message.content;

    if (!content?.kind || openingContent) {
      return;
    }

    if (content.kind === "CATALOG") {
      setCatalogOpen(true);
      return;
    }

    if (content.kind === "CATEGORY") {
      navigation.navigate("Main", {
        params: {
          category: content.category?.id,
          query: "",
        },
        screen: "Buscar",
      });
      return;
    }

    if (content.kind !== "PRODUCT" || !content.store?.id) {
      return;
    }

    setOpeningContent(String(message.id));
    setError("");

    try {
      const response = await getMarketplaceStore(
        session.accessToken,
        content.store.id,
      );
      const product = response.store?.products?.find(
        (item) => item.id === content.product?.id,
      );

      if (!product) {
        setError("Este produto nao esta mais disponivel.");
        return;
      }

      navigation.navigate("ProductDetails", {
        conversationId: conversation?.id,
        product,
        store: response.store,
      });
    } catch (requestError) {
      setError(
        requestError.message
        ?? "Nao foi possivel abrir o produto.",
      );
    } finally {
      setOpeningContent("");
    }
  }

  if (loading && !conversation?.messages) {
    return (
      <ScreenContainer edges={["left", "right"]}>
        <StatePanel
          icon="chatbubbles-outline"
          loading
          text="Abrindo conversa com a loja..."
        />
      </ScreenContainer>
    );
  }

  if (error && !conversation) {
    return (
      <ScreenContainer edges={["left", "right"]}>
        <StatePanel
          actionLabel="Tentar novamente"
          danger
          icon="alert-circle-outline"
          onAction={load}
          text={error}
          title="Conversa indisponivel"
        />
      </ScreenContainer>
    );
  }

  const title = conversation?.isStore
    ? conversation.customer?.name
    : conversation?.store?.name ?? initialStore?.name ?? "Loja";
  const imageUrl = conversation?.isStore
    ? conversation.customer?.photoUrl
    : conversation?.store?.logoUrl ?? initialStore?.logoUrl;
  const storeView = storeCatalog ?? initialStore ?? conversation?.store;
  const normalizedDraft = normalizeSearchText(draft);
  const catalogProductSuggestions = !conversation?.isStore
    && catalogSearchFocused
    && normalizedDraft.length >= 2
    ? (storeView?.products ?? [])
        .filter((product) => (
          !normalizedDraft
          || matchesSearchText(
            `${product.name} ${product.brand ?? ""} ${product.shortDescription ?? ""} ${product.description ?? ""}`,
            normalizedDraft,
          )
        ))
        .slice(0, 6)
    : [];
  const visiblePendingSearchMessageId = searchPendingMessageId ?? (
    searchThinking
      ? [...(conversation?.messages ?? [])]
          .reverse()
          .find((item) => item.isMine && item.content?.kind === "SEARCH")?.id
      : null
  );

  return (
    <ScreenContainer
      contentContainerStyle={styles.content}
      edges={["top", "left", "right"]}
      padded={false}
      scroll={false}
    >
      <View style={styles.header}>
        <BackHeader
          compact
          onPress={navigation.goBack}
          showTitle={false}
          title="Voltar"
        />
        <View style={styles.avatar}>
          {imageUrl ? (
            <Image
              source={{ uri: resolveMediaUrl(imageUrl) }}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={styles.avatarText}>{getInitials(title)}</Text>
          )}
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>
            {conversation?.isStore ? conversation.store?.name : "CONVERSA COM A LOJA"}
          </Text>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          <View style={styles.statusLine}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              {conversation?.isStore ? "Atendimento e compras" : "Loja e atendimento"}
            </Text>
          </View>
        </View>
        {!conversation?.isStore ? (
          <Animated.View style={{ transform: [{ scale: cartCountPulse }] }}>
          <Pressable
            accessibilityLabel={`Abrir carrinho com ${currentStoreItemCount} itens`}
            onPress={() => navigation.navigate("Cart")}
            ref={cartTargetRef}
            style={({ pressed }) => [styles.headerCart, pressed && styles.pressed]}
          >
            <Ionicons color={colors.card} name="bag-handle" size={20} />
            <View style={styles.headerCartBadge}>
              <Text style={styles.headerCartBadgeText}>
                {currentStoreItemCount > 99 ? "99+" : currentStoreItemCount}
              </Text>
            </View>
          </Pressable>
          </Animated.View>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorStrip}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={17} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => setError("")}>
            <Ionicons color={colors.danger} name="close" size={18} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.timeline}>
        <ScrollView
          automaticallyAdjustKeyboardInsets={false}
          contentContainerStyle={[styles.messages, conversation?.isStore && styles.messagesBottom]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={timeline.onContentSizeChange}
          onLayout={timeline.onLayout}
          onScroll={(event) => {
            timeline.onScroll(event);
            if (event.nativeEvent.contentOffset.y < 60) void loadOlder();
          }}
          ref={scrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.messageScroll}
        >
          {!conversation?.isStore ? (
            <StoreWelcomeCard
              onAddProduct={addProduct}
              onOpenCatalog={() => setCatalogOpen(true)}
              onOpenProduct={openProduct}
              store={storeView}
            />
          ) : (
            <StoreJourneyStatus />
          )}

          {loadingOlder ? <ActivityIndicator color={colors.primary} size="small" /> : null}
          {(conversation?.messages ?? []).length ? (
            conversation.messages.map((message) => (
              <MessageBubble
                accessToken={session.accessToken}
                key={message.id}
                loading={openingContent === String(message.id)}
                message={message}
                onAddProduct={!conversation?.isStore ? addSharedProduct : null}
                onOpenCatalog={!conversation?.isStore ? () => setCatalogOpen(true) : null}
                onOpenContent={openCommercialContent}
                onOpenSearchProduct={!conversation?.isStore ? openProduct : null}
                searchPending={searchThinking && String(message.id) === String(visiblePendingSearchMessageId)}
                searchSuggestions={!conversation?.isStore ? storeView?.products : null}
              />
            ))
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons color={colors.primaryDark} name="storefront-outline" size={25} />
              </View>
              <Text style={styles.emptyTitle}>Fale diretamente com a loja</Text>
              <Text style={styles.emptyText}>
                Pergunte sobre um produto, entrega, horario ou disponibilidade.
              </Text>
            </View>
          )}
          {!conversation?.isStore && customerOrders.length ? (
            <View style={styles.ordersDrawer}>
              <Pressable
                accessibilityState={{ expanded: ordersVisible }}
                onPress={() => setOrdersVisible((current) => !current)}
                style={({ pressed }) => [styles.ordersDrawerToggle, pressed && styles.pressed]}
              >
                <View style={styles.orderAccordionHeadingIcon}>
                  <Ionicons color={colors.primaryDark} name="receipt-outline" size={17} />
                </View>
                <View style={styles.orderAccordionHeadingCopy}>
                  <Text style={styles.orderAccordionTitle}>Pedidos</Text>
                  <Text style={styles.orderAccordionSubtitle}>
                    {ordersVisible ? "Ocultar acompanhamentos" : "Puxar pedidos e acompanhar status"}
                  </Text>
                </View>
                <View style={styles.orderAccordionCount}>
                  <Text style={styles.orderAccordionCountText}>{customerOrders.length}</Text>
                </View>
                <Ionicons color={colors.primaryDark} name={ordersVisible ? "chevron-down" : "chevron-up"} size={20} />
              </Pressable>
              {ordersVisible ? (
                <StoreOrdersAccordion
                  cancelingOrderId={cancelingOrderId}
                  expandedOrderId={expandedOrderId}
                  onCancel={requestPaidOrderCancellation}
                  onToggle={(orderId) => setExpandedOrderId((current) => (
                    Number(current) === Number(orderId) ? null : orderId
                  ))}
                  orders={customerOrders}
                />
              ) : null}
            </View>
          ) : null}
          {searchThinking ? <StoreTypingIndicator /> : null}
          <ChatTypingIndicator visible={typing.isOtherTyping} />
        </ScrollView>
        <ChatScrollToLatestButton onPress={timeline.scrollToLatest} unreadCount={timeline.unreadBelow} visible={!timeline.isAtBottom} />
      </View>

      {catalogProductSuggestions.length ? (
        <StoreProductSuggestions
          onAdd={addProduct}
          onOpen={(product) => {
            void send({ productId: product.id, type: "PRODUTO" }).catch(() => {});
          }}
          products={catalogProductSuggestions}
          title={normalizedDraft ? "Produtos encontrados" : "Sugestoes da loja"}
        />
      ) : null}

      <ChatComposer
        accessory={conversation?.isStore ? (
          <View style={styles.searchComposerHint}>
            <Ionicons color={colors.primaryDark} name="chatbubbles-outline" size={15} />
            <Text style={styles.searchComposerHintText}>Voce pode conversar e oferecer ajuda a qualquer momento</Text>
          </View>
        ) : (
          <View style={[styles.supportToggle, supportMode && styles.supportToggleActive]}>
            <View style={[styles.supportToggleIcon, supportMode && styles.supportToggleIconActive]}>
              <Ionicons
                color={supportMode ? colors.card : colors.primaryDark}
                name="headset-outline"
                size={17}
              />
            </View>
            <View style={styles.supportToggleCopy}>
              <Text style={styles.supportToggleTitle}>Falar com uma pessoa</Text>
              <Text style={styles.supportToggleText}>
                {supportMode
                  ? "Ligado: suas mensagens vao para o atendimento real"
                  : "Deixe ligado para falar com o suporte real da loja"}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Falar com o suporte real da loja"
              accessibilityRole="switch"
              accessibilityState={{ checked: supportMode }}
              ios_backgroundColor={colors.border}
              onValueChange={setSupportMode}
              thumbColor={colors.card}
              trackColor={{ false: colors.border, true: colors.primary }}
              value={supportMode}
            />
          </View>
        )}
        draft={draft}
        onAttachmentError={setError}
        leadingAction={conversation?.isStore ? (
          <Pressable
            accessibilityLabel="Compartilhar produto ou catalogo"
            onPress={() => setShareOpen(true)}
            style={({ pressed }) => [
              styles.shareButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={colors.primaryDark} name="albums-outline" size={21} />
          </Pressable>
        ) : null}
        onChangeDraft={setDraft}
        onBlur={() => setTimeout(() => setCatalogSearchFocused(false), 180)}
        onFocus={() => {
          setCatalogSearchFocused(true);
          setTimeout(() => timeline.scrollToLatest(false), Platform.OS === "ios" ? 260 : 120);
        }}
        onSend={send}
        onSendAttachment={send}
        placeholder={
          conversation?.isStore
            ? "Escreva para o cliente"
            : supportMode
              ? "Escreva a mensagem para a loja"
              : "Escreva ou pesquise nesta loja"
        }
        sending={sending}
        style={{ paddingBottom: Math.max(spacing.sm, insets.bottom + spacing.xs) }}
        submitOnEnter
      />

      <ShareCatalogModal
        conversation={conversation}
        onClose={() => setShareOpen(false)}
        onShare={shareCommercialContent}
        sharing={sharing}
        visible={shareOpen}
      />
      <CustomerCatalogModal
        onClose={() => setCatalogOpen(false)}
        onAddProduct={addProduct}
        onOpenProduct={openProduct}
        store={storeView}
        visible={catalogOpen}
      />
      {cartFlight ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.cartFlight,
            {
              left: cartFlight.startX,
              opacity: cartFlightProgress.interpolate({ inputRange: [0, 0.82, 1], outputRange: [1, 1, 0] }),
              top: cartFlight.startY,
              transform: [
                { translateX: cartFlightProgress.interpolate({ inputRange: [0, 1], outputRange: [0, cartFlight.deltaX] }) },
                { translateY: cartFlightProgress.interpolate({ inputRange: [0, 1], outputRange: [0, cartFlight.deltaY] }) },
                { scale: cartFlightProgress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.72, 0.3] }) },
              ],
            },
          ]}
        >
          {cartFlight.imageUrl ? (
            <Image source={{ uri: cartFlight.imageUrl }} style={styles.cartFlightImage} />
          ) : (
            <Ionicons color={colors.card} name="cube" size={20} />
          )}
        </Animated.View>
      ) : null}
    </ScreenContainer>
  );
}

const customerOrderStatusCopy = {
  ACEITO: "Aceito pela loja",
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  CANCELADO: "Cancelado",
  CONCLUIDO: "Concluido",
  NEGOCIANDO: "Em negociacao",
  PREPARANDO: "Em preparo",
  PRONTO_RETIRADA: "Pronto para retirada",
  RECEBIDO: "Recebido pela loja",
  SAIU_ENTREGA: "Saiu para entrega",
};

function StoreOrdersAccordion({ cancelingOrderId, expandedOrderId, onCancel, onToggle, orders }) {
  return (
    <View style={styles.orderAccordionList}>
      {orders.map((order) => {
        const expanded = Number(expandedOrderId) === Number(order.id);
        return (
          <View key={order.id} style={[styles.orderAccordionCard, expanded && styles.orderAccordionCardOpen]}>
            <Pressable
              accessibilityState={{ expanded }}
              onPress={() => onToggle(order.id)}
              style={({ pressed }) => [styles.orderAccordionToggle, pressed && styles.pressed]}
            >
              <View style={styles.orderAccordionIcon}>
                <Ionicons color={colors.primaryDark} name="bag-check-outline" size={19} />
              </View>
              <View style={styles.orderAccordionCopy}>
                <Text numberOfLines={1} style={styles.orderAccordionCode}>
                  Pedido {compactStoreOrderCode(order.code)}
                </Text>
                <Text style={styles.orderAccordionDate}>{formatStoreOrderDate(order.createdAt)}</Text>
              </View>
              <View style={styles.orderAccordionStatus}>
                <Text numberOfLines={1} style={styles.orderAccordionStatusText}>
                  {customerOrderStatusCopy[order.status] ?? order.status}
                </Text>
              </View>
              <Ionicons color={colors.textMuted} name={expanded ? "chevron-up" : "chevron-down"} size={18} />
            </Pressable>
            {expanded ? (
              <View style={styles.orderAccordionBody}>
                <InlineOrderProgress order={order} />
                <OrderFulfillmentDetails order={order} />
                <View style={styles.orderAccordionItems}>
                  {(order.items ?? []).map((item) => (
                    <View key={item.id} style={styles.orderAccordionItem}>
                      <Text style={styles.orderAccordionQuantity}>{item.quantity}x</Text>
                      <Text numberOfLines={2} style={styles.orderAccordionItemName}>{item.name}</Text>
                      <Text style={styles.orderAccordionItemPrice}>{formatarDinheiro(item.totalCents)}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.orderAccordionTotal}>
                  <Text style={styles.orderAccordionTotalLabel}>Total</Text>
                  <Text style={styles.orderAccordionTotalValue}>{formatarDinheiro(order.totalCents)}</Text>
                </View>
                {order.payment ? (
                  <View style={styles.orderAccordionPayment}>
                    <Ionicons
                      color={["PAGO", "LIQUIDADO"].includes(order.payment.status) ? colors.primaryDark : colors.textSecondary}
                      name={["PAGO", "LIQUIDADO"].includes(order.payment.status) ? "checkmark-circle" : order.payment.status === "EM_DISPUTA" ? "sync-outline" : "card-outline"}
                      size={18}
                    />
                    <Text style={styles.orderAccordionPaymentText}>
                      {order.payment.status === "EM_DISPUTA"
                        ? "Estorno sendo processado"
                        : order.payment.status === "ESTORNADO"
                          ? "Pagamento devolvido"
                          : ["PAGO", "LIQUIDADO"].includes(order.payment.status)
                            ? "Pagamento confirmado"
                            : "Pagamento pendente"}
                    </Text>
                  </View>
                ) : null}
                {order.cashback && ["PAGO", "LIQUIDADO"].includes(order.payment?.status) ? (
                  <View style={styles.orderCashbackPreview}>
                    <View style={styles.orderCashbackIcon}>
                      <Ionicons color={colors.primaryDark} name="gift-outline" size={18} />
                    </View>
                    <View style={styles.orderCashbackCopy}>
                      <Text style={styles.orderCashbackTitle}>
                        {order.cashback.status === "CONFIRMADO_BLOQUEADO"
                          ? "Cashback confirmado"
                          : "Cashback previsto"}
                      </Text>
                      <Text style={styles.orderCashbackText}>
                        {order.cashback.status === "CONFIRMADO_BLOQUEADO"
                          ? "Valor protegido durante o prazo de seguranca."
                          : "Sera confirmado quando voce receber o pedido."}
                      </Text>
                    </View>
                    <Text style={styles.orderCashbackValue}>{formatarDinheiro(order.cashback.amountCents)}</Text>
                  </View>
                ) : null}
                {order.customerCancellation?.available ? (
                  <View style={styles.orderCancellationInline}>
                    <Text style={styles.orderCancellationTitle}>A loja ainda nao aceitou. O que deseja fazer?</Text>
                    <Text style={styles.orderCancellationText}>O pedido continua ativo ate voce confirmar o cancelamento.</Text>
                    <View style={styles.orderCancellationActions}>
                      <Pressable
                        disabled={cancelingOrderId === order.id}
                        onPress={() => onCancel(order, "ORIGINAL")}
                        style={styles.orderCancellationButton}
                      >
                        <Text style={styles.orderCancellationButtonText}>Estornar na origem</Text>
                      </Pressable>
                      <Pressable
                        disabled={cancelingOrderId === order.id}
                        onPress={() => onCancel(order, "BALANCE")}
                        style={[styles.orderCancellationButton, styles.orderCancellationButtonPrimary]}
                      >
                        {cancelingOrderId === order.id ? (
                          <ActivityIndicator color={colors.card} size="small" />
                        ) : (
                          <Text style={styles.orderCancellationButtonPrimaryText}>Receber em saldo</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function OrderFulfillmentDetails({ order }) {
  const pickup = order.deliveryMode === "RETIRADA";
  const address = pickup ? order.store?.pickupAddress : order.address;
  const addressLine = formatOrderAddress(address);
  const extra = [address?.complemento, address?.referencia ? `Referencia: ${address.referencia}` : null]
    .filter(Boolean)
    .join(" - ");

  return (
    <View style={styles.fulfillmentCard}>
      <View style={styles.fulfillmentIcon}>
        <Ionicons color={colors.primaryDark} name={pickup ? "storefront-outline" : "bicycle-outline"} size={19} />
      </View>
      <View style={styles.fulfillmentCopy}>
        <Text style={styles.fulfillmentTitle}>{pickup ? "Retirada na loja" : "Entrega no endereco"}</Text>
        <Text style={styles.fulfillmentAddress}>
          {addressLine || (pickup ? order.store?.name : "Endereco informado no checkout")}
        </Text>
        {extra ? <Text style={styles.fulfillmentExtra}>{extra}</Text> : null}
        <Text style={styles.fulfillmentHint}>
          {pickup
            ? `Aguarde o status "Pronto para retirada" e apresente o pedido ${compactStoreOrderCode(order.code)}.`
            : Number(order.deliveryFeeCents ?? 0) > 0
              ? `Taxa de entrega: ${formatarDinheiro(order.deliveryFeeCents)}.`
              : "Entrega sem taxa adicional."}
        </Text>
      </View>
    </View>
  );
}

function InlineOrderProgress({ order }) {
  const pickup = order.deliveryMode === "RETIRADA";
  const steps = [
    { key: "RECEBIDO", icon: "receipt-outline", label: "Recebido" },
    { key: "ACEITO", icon: "checkmark-circle-outline", label: "Aceito" },
    { key: "PREPARANDO", icon: "cube-outline", label: "Preparo" },
    { key: pickup ? "PRONTO_RETIRADA" : "SAIU_ENTREGA", icon: pickup ? "storefront-outline" : "bicycle-outline", label: pickup ? "Retirada" : "A caminho" },
    { key: "CONCLUIDO", icon: "bag-check-outline", label: "Concluido" },
  ];
  const currentIndex = steps.findIndex((step) => step.key === order.status);
  return (
    <View style={styles.inlineProgress}>
      {steps.map((step, index) => {
        const reached = currentIndex >= 0 && index <= currentIndex;
        return (
          <View key={step.key} style={styles.inlineProgressStep}>
            {index ? <View style={[styles.inlineProgressLine, reached && styles.inlineProgressLineDone]} /> : null}
            <View style={[styles.inlineProgressDot, reached && styles.inlineProgressDotDone]}>
              <Ionicons color={reached ? colors.card : colors.textMuted} name={step.icon} size={14} />
            </View>
            <Text numberOfLines={1} style={[styles.inlineProgressLabel, reached && styles.inlineProgressLabelDone]}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function compactStoreOrderCode(code = "") {
  const suffix = String(code).split("-").at(-1);
  return suffix ? `#${suffix}` : code;
}

function formatStoreOrderDate(value) {
  if (!value) return "Agora";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

function formatOrderAddress(address) {
  if (!address) return "";
  const street = [address.rua, address.numero].filter(Boolean).join(", ");
  const city = [address.cidade, address.estado].filter(Boolean).join(" - ");
  return [street, address.bairro, city, address.cep ? `CEP ${address.cep}` : null]
    .filter(Boolean)
    .join(" · ");
}

function StoreWelcomeCard({ onAddProduct, onOpenCatalog, onOpenProduct, store }) {
  const delivery = store?.delivery;
  const cashback = Number(store?.cashbackPercent ?? 0);
  const deliveryLabel = delivery?.available
    ? Number(delivery.feeCents ?? 0) > 0
      ? `Entrega ${formatarDinheiro(delivery.feeCents)}`
      : "Entrega gratis"
    : "Somente retirada";

  return (
    <View style={styles.storeWelcome}>
      <View style={styles.storeWelcomeBody}>
        <View style={styles.storeWelcomeHeading}>
          <View style={styles.storeWelcomeLogo}>
            {store?.logoUrl ? (
              <Image
                resizeMode="contain"
                source={{ uri: resolveMediaUrl(store.logoUrl) }}
                style={styles.storeWelcomeLogoImage}
              />
            ) : (
              <Ionicons color={colors.primaryDark} name="storefront-outline" size={21} />
            )}
          </View>
          <View style={styles.catalogActionCopy}>
            <Text style={styles.storeWelcomeEyebrow}>LOJA</Text>
            <Text numberOfLines={1} style={styles.storeWelcomeTitle}>{store?.name ?? "Loja"}</Text>
            {store?.description ? (
              <Text numberOfLines={1} style={styles.storeWelcomeText}>{store.description}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.storeWelcomeMeta}>
          <InfoChip icon="pricetag-outline" text={store?.category?.name ?? "Loja"} />
          <InfoChip icon="bicycle-outline" text={deliveryLabel} />
          {cashback > 0 ? <InfoChip icon="gift-outline" text={`${cashback}% cashback`} /> : null}
        </View>
        {(store?.products ?? []).length ? (
          <View style={styles.inlineProducts}>
            {(store.products ?? []).slice(0, 4).map((product) => (
              <CompactProductCard
                key={product.id}
                onAdd={(origin) => onAddProduct(product, origin)}
                onPress={() => onOpenProduct(product)}
                product={product}
              />
            ))}
          </View>
        ) : null}
        <Pressable onPress={onOpenCatalog} style={({ pressed }) => [styles.catalogLink, pressed && styles.pressed]}>
          <Ionicons color={colors.primaryDark} name="grid-outline" size={17} />
          <Text style={styles.catalogLinkText}>Ver todos os produtos</Text>
          <Text style={styles.catalogLinkCount}>{store?.products?.length ?? store?.productsCount ?? 0}</Text>
          <Ionicons color={colors.primaryDark} name="chevron-forward" size={17} />
        </Pressable>
      </View>
    </View>
  );
}

function CompactProductCard({ onAdd, onPress, product }) {
  const imageUrl = resolveMediaUrl(product.imageUrl);
  return (
    <View style={styles.compactProduct}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.compactProductMain, pressed && styles.pressed]}>
        <View style={styles.compactProductImage}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.compactProductImageAsset} />
          ) : (
            <Ionicons color={colors.primaryDark} name="cube-outline" size={19} />
          )}
        </View>
        <Text numberOfLines={2} style={styles.compactProductName}>{product.name}</Text>
      </Pressable>
      <View style={styles.compactProductFooter}>
        <Text numberOfLines={1} style={styles.compactProductPrice}>
          {formatarDinheiro(product.promotionalPriceCents ?? product.priceCents)}
        </Text>
        <CartAddButton direction="up" name={product.name} onPress={onAdd} size={29} />
      </View>
    </View>
  );
}

function StoreProductSuggestions({ onAdd, onOpen, products, title }) {
  return (
    <View style={styles.composerSuggestions}>
      <View style={styles.composerSuggestionsHeading}>
        <Ionicons color={colors.primaryDark} name="sparkles-outline" size={14} />
        <Text style={styles.composerSuggestionsTitle}>{title}</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.composerSuggestionsList}
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
      >
        {products.map((product) => {
          const imageUrl = resolveMediaUrl(product.imageUrl);
          return (
            <View key={product.id} style={styles.composerSuggestion}>
              <Pressable
                onPress={() => onOpen(product)}
                style={({ pressed }) => [styles.composerSuggestionMain, pressed && styles.pressed]}
              >
                <View style={styles.composerSuggestionImage}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.composerSuggestionImageAsset} />
                  ) : (
                    <Ionicons color={colors.primaryDark} name="cube-outline" size={17} />
                  )}
                </View>
                <View style={styles.composerSuggestionCopy}>
                  <Text numberOfLines={1} style={styles.composerSuggestionName}>{product.name}</Text>
                  <Text style={styles.composerSuggestionPrice}>
                    {formatarDinheiro(product.promotionalPriceCents ?? product.priceCents)}
                  </Text>
                </View>
              </Pressable>
              <CartAddButton
                direction="up"
                name={product.name}
                onPress={(origin) => onAdd(product, origin)}
                size={29}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function StoreJourneyStatus() {
  return (
    <View style={styles.journeyStatus}>
      <Ionicons color={colors.primaryDark} name="chatbubbles-outline" size={20} />
      <View style={styles.catalogActionCopy}>
        <Text style={styles.journeyStatusTitle}>Canal direto com o cliente</Text>
        <Text style={styles.journeyStatusText}>
          Acompanhe a compra, ofereca ajuda e compartilhe produtos quando for util.
        </Text>
      </View>
    </View>
  );
}

function InfoChip({ icon, text }) {
  return (
    <View style={styles.infoChip}>
      <Ionicons color={colors.primaryDark} name={icon} size={14} />
      <Text numberOfLines={1} style={styles.infoChipText}>{text}</Text>
    </View>
  );
}

function CustomerProductRow({ onAdd, onPress, product }) {
  const imageUrl = resolveMediaUrl(product.imageUrl);
  const soldOut = product.stockControlled && Number(product.stockQuantity ?? 0) <= 0;
  return (
    <View style={[styles.customerProduct, soldOut && styles.customerProductDisabled]}>
      <Pressable
        disabled={soldOut}
        onPress={onPress}
        style={({ pressed }) => [styles.customerProductMain, pressed && styles.pressed]}
      >
        <View style={styles.customerProductImage}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.customerProductImageAsset} />
          ) : (
            <Ionicons color={colors.primaryDark} name="cube-outline" size={21} />
          )}
        </View>
        <View style={styles.catalogActionCopy}>
          <Text numberOfLines={1} style={styles.customerProductName}>{product.name}</Text>
          <Text numberOfLines={1} style={styles.customerProductText}>
            {soldOut ? "Esgotado" : product.shortDescription || product.description || "Ver detalhes do produto"}
          </Text>
          <Text style={styles.customerProductPrice}>
            {formatarDinheiro(product.promotionalPriceCents ?? product.priceCents)}
          </Text>
        </View>
      </Pressable>
      {!soldOut && onAdd ? (
        <CartAddButton direction="up" name={product.name} onPress={onAdd} size={32} />
      ) : null}
    </View>
  );
}

function CustomerCatalogModal({ onAddProduct, onClose, onOpenProduct, store, visible }) {
  const products = store?.products ?? [];
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <View style={styles.shareSheet}>
          <View style={styles.shareHeader}>
            <View style={styles.shareHeaderIcon}>
              <Ionicons color={colors.primaryDark} name="grid-outline" size={21} />
            </View>
            <View style={styles.shareHeaderCopy}>
              <Text style={styles.shareEyebrow}>CATALOGO DA LOJA</Text>
              <Text numberOfLines={1} style={styles.shareTitle}>{store?.name ?? "Produtos"}</Text>
            </View>
            <Pressable accessibilityLabel="Fechar catalogo" onPress={onClose} style={styles.shareClose}>
              <Ionicons color={colors.textPrimary} name="close" size={21} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.catalogList} showsVerticalScrollIndicator={false}>
            {products.length ? products.map((product) => (
              <CustomerProductRow
                key={product.id}
                onAdd={(origin) => onAddProduct(product, origin)}
                onPress={() => onOpenProduct(product)}
                product={product}
              />
            )) : (
              <View style={styles.shareEmpty}>
                <Ionicons color={colors.textMuted} name="cube-outline" size={24} />
                <Text style={styles.shareEmptyText}>Esta loja ainda nao possui produtos disponiveis.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StoreTypingIndicator() {
  const [activeDot, setActiveDot] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveDot((current) => (current + 1) % 3);
    }, 260);
    return () => clearInterval(interval);
  }, []);

  return (
    <View
      accessibilityLabel="A loja esta procurando produtos"
      accessibilityLiveRegion="polite"
      style={styles.storeTypingLine}
    >
      <View style={styles.storeTypingAvatar}>
        <Ionicons color={colors.primaryDark} name="storefront-outline" size={15} />
      </View>
      <View style={styles.storeTypingBubble}>
        {[0, 1, 2].map((dot) => (
          <View
            key={dot}
            style={[
              styles.storeTypingDot,
              dot === activeDot && styles.storeTypingDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function MessageBubble({
  accessToken,
  loading,
  message,
  onAddProduct,
  onOpenCatalog,
  onOpenContent,
  onOpenSearchProduct,
  searchPending,
  searchSuggestions,
}) {
  if (message.author === "system" && message.content?.kind === "PRODUCT") {
    return (
      <View style={styles.journeyProduct}>
        <Text style={styles.journeyProductLabel}>JORNADA DE COMPRA</Text>
        <CommercialMessageCard
          content={message.content}
          loading={loading}
          onAdd={onAddProduct ? (origin) => onAddProduct(message.content.product, origin) : null}
          onPress={() => onOpenContent(message)}
          text={message.text}
          type="PRODUTO"
        />
      </View>
    );
  }
  if (message.author === "system") {
    return (
      <View style={styles.systemMessage}>
        <Ionicons color={colors.primaryDark} name="information-circle-outline" size={15} />
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  if (message.type !== "TEXTO" && message.content) {
    return (
      <View style={[styles.messageLine, message.isMine && styles.messageLineMine]}>
        <CommercialMessageCard
          content={message.content}
          loading={loading}
          onAdd={message.content?.kind === "PRODUCT" && onAddProduct
            ? (origin) => onAddProduct(message.content.product, origin)
            : null}
          onPress={() => onOpenContent(message)}
          text={message.text}
          type={message.type}
        />
        <ChatMessageMeta createdAt={message.createdAt} isMine={message.isMine} readAt={message.readAt} />
      </View>
    );
  }

  const searchProducts = message.content?.kind === "SEARCH" && !searchPending
    ? message.content.products ?? []
    : null;

  return (
    <View style={[styles.messageLine, message.isMine && styles.messageLineMine]}>
      <View style={[
        styles.bubble,
        message.content?.kind === "SUPPORT" && styles.bubbleSupport,
        message.isMine && styles.bubbleMine,
      ]}>
        <ChatAttachment accessToken={accessToken} attachment={message.attachment} isMine={message.isMine} />
        {message.author === "store" && message.sentBy?.name ? (
          <Text style={[styles.messageSender, message.isMine && styles.messageSenderMine]}>
            {message.isMine ? "Voce" : message.sentBy.name} · Atendente
          </Text>
        ) : null}
        {message.content?.kind === "SUPPORT" ? (
          <View style={styles.supportBadge}>
            <Ionicons
              color={message.isMine ? colors.card : colors.primaryDark}
              name="headset-outline"
              size={12}
            />
            <Text style={[styles.supportBadgeText, message.isMine && styles.supportBadgeTextMine]}>
              SUPORTE
            </Text>
          </View>
        ) : null}
        {message.text ? <Text style={[styles.messageText, message.isMine && styles.messageTextMine]}>{message.text}</Text> : null}
        <ChatMessageMeta createdAt={message.createdAt} isMine={message.isMine} readAt={message.readAt} />
      </View>
      {searchProducts ? (
        <ChatSearchResults
          onAdd={onAddProduct}
          onOpenCatalog={onOpenCatalog}
          onOpen={onOpenSearchProduct}
          products={searchProducts}
          query={message.content.query}
          suggestions={message.content.suggestions ?? searchSuggestions ?? []}
          total={message.content.productCount ?? searchProducts.length}
        />
      ) : null}
    </View>
  );
}

function ChatSearchResults({ onAdd, onOpen, onOpenCatalog, products, query, suggestions, total }) {
  const isSuggestion = total === 0;
  const [suggestionPage, setSuggestionPage] = useState(0);
  const suggestionBatchSize = 2;
  const suggestionPageCount = Math.max(1, Math.ceil(suggestions.length / suggestionBatchSize));
  const visibleProducts = isSuggestion
    ? suggestions.slice(
        suggestionPage * suggestionBatchSize,
        (suggestionPage + 1) * suggestionBatchSize,
      )
    : products;

  useEffect(() => {
    setSuggestionPage(0);
  }, [query, suggestions.length]);

  function showOtherSuggestions() {
    setSuggestionPage((current) => (current + 1) % suggestionPageCount);
  }

  return (
    <View style={styles.chatSearchResults}>
      <View style={styles.chatSearchHeading}>
        <Ionicons color={colors.primaryDark} name="sparkles-outline" size={14} />
        <Text style={styles.chatSearchTitle}>
          {total > 0
            ? `${total} produto${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"}`
            : visibleProducts.length
              ? "Produtos que podem combinar"
              : "Nenhum produto encontrado"}
        </Text>
      </View>
      {isSuggestion ? (
        <Text style={styles.searchResponseText}>
          Nao encontramos exatamente isso. Veja algumas opcoes parecidas:
        </Text>
      ) : null}
      {visibleProducts.length ? (
        <View style={styles.chatSearchGrid}>
          {visibleProducts.slice(0, 4).map((product) => {
            const imageUrl = resolveMediaUrl(product.imageUrl);
            const soldOut = product.stockControlled && Number(product.stockQuantity ?? 0) <= 0;
            return (
              <View key={product.id} style={[styles.chatSearchProduct, soldOut && styles.customerProductDisabled]}>
                <Pressable
                  disabled={!onOpen || soldOut}
                  onPress={() => onOpen(product)}
                  style={({ pressed }) => [styles.chatSearchProductMain, pressed && styles.pressed]}
                >
                  <View style={styles.chatSearchProductImage}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.customerProductImageAsset} />
                    ) : (
                      <Ionicons color={colors.primaryDark} name="cube-outline" size={20} />
                    )}
                  </View>
                  <Text numberOfLines={2} style={styles.chatSearchProductName}>{product.name}</Text>
                  <Text style={styles.chatSearchProductPrice}>
                    {formatarDinheiro(product.promotionalPriceCents ?? product.priceCents)}
                  </Text>
                </Pressable>
                {!soldOut && onAdd ? (
                  <View style={styles.chatSearchAdd}>
                    <CartAddButton direction="up" name={product.name} onPress={(origin) => onAdd(product, origin)} size={28} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.searchResponseText}>Tente outro nome ou abra todos os produtos.</Text>
      )}
      {isSuggestion && onOpenCatalog ? (
        <View style={styles.chatSearchActions}>
          {suggestions.length > suggestionBatchSize ? (
            <Pressable
              onPress={showOtherSuggestions}
              style={({ pressed }) => [styles.chatSearchOtherButton, pressed && styles.pressed]}
            >
              <Ionicons color={colors.primaryDark} name="refresh-outline" size={17} />
              <Text style={styles.chatSearchOtherButtonText}>Outros</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onOpenCatalog}
            style={({ pressed }) => [styles.chatSearchCatalogButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.card} name="grid-outline" size={17} />
            <Text style={styles.chatSearchCatalogButtonText}>Ver todos</Text>
            <Ionicons color={colors.card} name="arrow-forward" size={16} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function CommercialMessageCard({ content, loading, onAdd, onPress, text, type }) {
  const product = content.product;
  const category = content.category;
  const catalogProducts = content.products ?? [];
  const title =
    type === "PRODUTO"
      ? product?.name
      : type === "CATEGORIA"
        ? category?.name
        : `Catalogo de ${content.store?.name ?? "produtos"}`;
  const action =
    type === "PRODUTO"
      ? "Ver produto"
      : type === "CATEGORIA"
        ? "Explorar categoria"
        : "Abrir catalogo";
  const icon =
    type === "PRODUTO"
      ? "cube-outline"
      : type === "CATEGORIA"
        ? "grid-outline"
        : "albums-outline";

  return (
    <View style={styles.commercialCardShell}>
    <Pressable
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.commercialCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.commercialTopline}>
        <View style={styles.commercialIcon}>
          <Ionicons color={colors.primaryDark} name={icon} size={18} />
        </View>
        <Text style={styles.commercialEyebrow}>
          {type === "PRODUTO" ? "PRODUTO" : type === "CATEGORIA" ? "CATEGORIA" : "CATALOGO"}
        </Text>
      </View>

      {type === "PRODUTO" && product?.imageUrl ? (
        <Image
          resizeMode="cover"
          source={{ uri: resolveMediaUrl(product.imageUrl) }}
          style={styles.commercialProductImage}
        />
      ) : null}

      {type === "CATALOGO" && catalogProducts.length ? (
        <View style={styles.catalogPreview}>
          {catalogProducts.slice(0, 4).map((item) => (
            <View style={styles.catalogThumb} key={item.id}>
              {item.imageUrl ? (
                <Image
                  resizeMode="cover"
                  source={{ uri: resolveMediaUrl(item.imageUrl) }}
                  style={styles.catalogThumbImage}
                />
              ) : (
                <Ionicons color={colors.primaryDark} name="cube-outline" size={17} />
              )}
            </View>
          ))}
        </View>
      ) : null}

      <Text numberOfLines={2} style={styles.commercialTitle}>{title}</Text>
      <Text numberOfLines={2} style={styles.commercialText}>{text}</Text>

      {type === "PRODUTO" ? (
        <Text style={styles.commercialPrice}>
          {formatarDinheiro(
            product?.promotionalPriceCents ?? product?.priceCents ?? 0,
          )}
        </Text>
      ) : type === "CATALOGO" ? (
        <Text style={styles.commercialCount}>
          {content.productCount ?? 0} produto{content.productCount === 1 ? "" : "s"}
        </Text>
      ) : null}

      <View style={styles.commercialAction}>
        <Text style={styles.commercialActionText}>{action}</Text>
        {loading ? (
          <ActivityIndicator color={colors.primaryDark} size="small" />
        ) : (
          <Ionicons color={colors.primaryDark} name="arrow-forward" size={16} />
        )}
      </View>
    </Pressable>
      {type === "PRODUTO" && onAdd ? (
        <CartAddButton
          direction="up"
          name={product?.name ?? "produto"}
          onPress={onAdd}
          size={29}
        />
      ) : null}
    </View>
  );
}

function ShareCatalogModal({
  conversation,
  onClose,
  onShare,
  sharing,
  visible,
}) {
  const category = conversation?.shareOptions?.category;
  const products = conversation?.shareOptions?.products ?? [];

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalOverlay}>
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <View style={styles.shareSheet}>
          <View style={styles.shareHeader}>
            <View style={styles.shareHeaderIcon}>
              <Ionicons color={colors.primaryDark} name="albums-outline" size={21} />
            </View>
            <View style={styles.shareHeaderCopy}>
              <Text style={styles.shareEyebrow}>MOSTRAR NO CHAT</Text>
              <Text style={styles.shareTitle}>Compartilhar da loja</Text>
            </View>
            <Pressable
              accessibilityLabel="Fechar"
              onPress={onClose}
              style={styles.shareClose}
            >
              <Ionicons color={colors.textPrimary} name="close" size={21} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.shareContent}
            showsVerticalScrollIndicator={false}
          >
            <ShareOption
              description={`${products.length} produto${products.length === 1 ? "" : "s"} da loja`}
              icon="albums-outline"
              loading={sharing === "CATALOGO-"}
              onPress={() => onShare("CATALOGO")}
              title="Catalogo completo"
            />

            {category ? (
              <ShareOption
                description="Leva o cliente para esta categoria na busca"
                icon="grid-outline"
                loading={sharing === "CATEGORIA-"}
                onPress={() => onShare("CATEGORIA")}
                title={category.name}
              />
            ) : null}

            <View style={styles.shareSectionHeading}>
              <Text style={styles.shareSectionTitle}>Produtos</Text>
              <Text style={styles.shareSectionCount}>{products.length}</Text>
            </View>

            {products.length ? (
              products.map((product) => (
                <Pressable
                  disabled={Boolean(sharing)}
                  key={product.id}
                  onPress={() => onShare("PRODUTO", product.id)}
                  style={({ pressed }) => [
                    styles.shareProduct,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.shareProductImage}>
                    {product.imageUrl ? (
                      <Image
                        resizeMode="cover"
                        source={{ uri: resolveMediaUrl(product.imageUrl) }}
                        style={styles.shareProductImageAsset}
                      />
                    ) : (
                      <Ionicons color={colors.primaryDark} name="cube-outline" size={20} />
                    )}
                  </View>
                  <View style={styles.shareProductCopy}>
                    <Text numberOfLines={1} style={styles.shareProductName}>
                      {product.name}
                    </Text>
                    <Text style={styles.shareProductPrice}>
                      {formatarDinheiro(
                        product.promotionalPriceCents ?? product.priceCents,
                      )}
                    </Text>
                  </View>
                  {sharing === `PRODUTO-${product.id}` ? (
                    <ActivityIndicator color={colors.primaryDark} size="small" />
                  ) : (
                    <Ionicons color={colors.primaryDark} name="send-outline" size={18} />
                  )}
                </Pressable>
              ))
            ) : (
              <View style={styles.shareEmpty}>
                <Ionicons color={colors.textMuted} name="cube-outline" size={22} />
                <Text style={styles.shareEmptyText}>
                  Cadastre produtos para compartilha-los aqui.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ShareOption({ description, icon, loading, onPress, title }) {
  return (
    <Pressable
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.shareOption,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.shareOptionIcon}>
        <Ionicons color={colors.primaryDark} name={icon} size={21} />
      </View>
      <View style={styles.shareOptionCopy}>
        <Text style={styles.shareOptionTitle}>{title}</Text>
        <Text style={styles.shareOptionText}>{description}</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primaryDark} size="small" />
      ) : (
        <Ionicons color={colors.primaryDark} name="send-outline" size={18} />
      )}
    </Pressable>
  );
}

function getInitials(value = "") {
  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

const styles = StyleSheet.create({
  cartFlight: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderColor: colors.card,
    borderRadius: radius.round,
    borderWidth: 3,
    height: 38,
    justifyContent: "center",
    overflow: "hidden",
    position: "absolute",
    width: 38,
    zIndex: 200,
    ...shadowSoft,
  },
  cartFlightImage: { height: "100%", width: "100%" },
  inlineProgress: { flexDirection: "row", paddingVertical: spacing.xs },
  inlineProgressDot: { alignItems: "center", backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.round, borderWidth: 2, height: 27, justifyContent: "center", width: 27, zIndex: 2 },
  inlineProgressDotDone: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  inlineProgressLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 8, textAlign: "center" },
  inlineProgressLabelDone: { color: colors.primaryDark, fontFamily: fonts.bold },
  inlineProgressLine: { backgroundColor: colors.border, height: 3, left: "-50%", position: "absolute", right: "50%", top: 13 },
  inlineProgressLineDone: { backgroundColor: colors.primaryDark },
  inlineProgressStep: { alignItems: "center", flex: 1, gap: 5, minWidth: 0, position: "relative" },
  fulfillmentAddress: { color: colors.textPrimary, fontFamily: fonts.semiBold, fontSize: 10, lineHeight: 15 },
  fulfillmentCard: { alignItems: "flex-start", backgroundColor: colors.backgroundSoft, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.sm },
  fulfillmentCopy: { flex: 1, gap: 3, minWidth: 0 },
  fulfillmentExtra: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 9, lineHeight: 14 },
  fulfillmentHint: { color: colors.primaryDark, fontFamily: fonts.medium, fontSize: 9, lineHeight: 14, marginTop: 2 },
  fulfillmentIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  fulfillmentTitle: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption },
  orderAccordionBody: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm, padding: spacing.md },
  orderAccordionCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  orderAccordionCardOpen: { borderColor: colors.primaryLight },
  orderAccordionCode: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  orderAccordionCopy: { flex: 1, gap: 2, minWidth: 0 },
  orderAccordionCount: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 26, justifyContent: "center", minWidth: 26, paddingHorizontal: 6 },
  orderAccordionCountText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10 },
  orderAccordionDate: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 9 },
  orderAccordionHeading: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  orderAccordionHeadingCopy: { flex: 1, gap: 2, minWidth: 0 },
  orderAccordionHeadingIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 36, justifyContent: "center", width: 36 },
  orderAccordionIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  orderAccordionItem: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 35 },
  orderAccordionItemName: { color: colors.textPrimary, flex: 1, fontFamily: fonts.semiBold, fontSize: typography.caption },
  orderAccordionItemPrice: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  orderAccordionItems: { gap: spacing.xs },
  orderAccordionPayment: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: radius.md, flexDirection: "row", gap: spacing.xs, padding: spacing.sm },
  orderAccordionPaymentText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.bold, fontSize: typography.caption },
  orderAccordionQuantity: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.caption, width: 28 },
  orderAccordionList: { gap: spacing.sm, padding: spacing.sm },
  orderAccordionStatus: { backgroundColor: "#EFF6FF", borderRadius: radius.round, maxWidth: 128, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  orderAccordionStatusText: { color: colors.info, fontFamily: fonts.bold, fontSize: 9 },
  orderAccordionSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10 },
  orderAccordionTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small },
  orderAccordionToggle: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 66, padding: spacing.sm },
  orderAccordionTotal: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.sm },
  orderAccordionTotalLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  orderAccordionTotalValue: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.body },
  orderCancellationActions: { flexDirection: "row", gap: spacing.sm },
  orderCancellationButton: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: spacing.sm },
  orderCancellationButtonPrimary: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  orderCancellationButtonPrimaryText: { color: colors.card, fontFamily: fonts.bold, fontSize: 10 },
  orderCancellationButtonText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, textAlign: "center" },
  orderCancellationInline: { backgroundColor: "#FFF9F2", borderColor: "#F4D7B0", borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.sm },
  orderCancellationText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10, lineHeight: 15 },
  orderCancellationTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  orderCashbackCopy: { flex: 1, gap: 2, minWidth: 0 },
  orderCashbackIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 36, justifyContent: "center", width: 36 },
  orderCashbackPreview: { alignItems: "center", backgroundColor: "#F0FDF4", borderColor: colors.primaryLight, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.sm },
  orderCashbackText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 9, lineHeight: 14 },
  orderCashbackTitle: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption },
  orderCashbackValue: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.body },
  ordersDrawer: { backgroundColor: colors.backgroundSoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  ordersDrawerToggle: { alignItems: "center", backgroundColor: colors.card, flexDirection: "row", gap: spacing.sm, minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.round,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    overflow: "hidden",
    width: 50,
  },
  avatarImage: { height: "100%", width: "100%" },
  avatarText: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
  },
  bubble: {
    backgroundColor: colors.cardMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 4,
    maxWidth: "82%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  bubbleSupport: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  catalogAction: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  catalogActionCopy: { flex: 1, gap: 3, minWidth: 0 },
  catalogActionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  catalogActionText: {
    color: "rgba(255,255,255,0.78)",
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  catalogActionTitle: {
    color: colors.card,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
  },
  catalogList: { gap: spacing.sm, paddingBottom: spacing.xl },
  catalogLink: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 40,
    paddingTop: spacing.sm,
  },
  catalogLinkCount: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    minWidth: 22,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 3,
    textAlign: "center",
  },
  catalogLinkText: {
    color: colors.primaryDark,
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
  },
  catalogPreview: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  catalogThumb: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  catalogThumbImage: { height: "100%", width: "100%" },
  commercialAction: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
  },
  commercialActionText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
  },
  commercialCard: {
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
    width: "100%",
    ...shadowSoft,
  },
  commercialCardShell: {
    alignItems: "flex-end",
    gap: spacing.xs,
    maxWidth: "88%",
    width: 310,
  },
  commercialCount: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
  },
  commercialEyebrow: {
    color: colors.primaryDark,
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 9,
  },
  commercialIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  commercialPrice: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
  },
  commercialProductImage: {
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    width: "100%",
  },
  commercialText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  commercialTime: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 9,
    marginTop: 3,
    paddingHorizontal: spacing.xs,
  },
  commercialTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
  },
  chatSearchAdd: {
    bottom: spacing.xs,
    position: "absolute",
    right: spacing.xs,
  },
  chatSearchActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  chatSearchCatalogButton: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.md,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.sm,
  },
  chatSearchCatalogButtonText: {
    color: colors.card,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
  },
  chatSearchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chatSearchHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  chatSearchOtherButton: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  chatSearchOtherButtonText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
  },
  chatSearchProduct: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 142,
    overflow: "visible",
    padding: spacing.xs,
    position: "relative",
    width: "48.5%",
  },
  chatSearchProductImage: {
    alignItems: "center",
    aspectRatio: 1.55,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  chatSearchProductMain: { flex: 1, gap: 3 },
  chatSearchProductName: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 14,
    paddingRight: spacing.xl,
  },
  chatSearchProductPrice: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 11,
    paddingRight: spacing.xl,
  },
  chatSearchResults: {
    alignSelf: "stretch",
    backgroundColor: colors.cardMuted,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderTopRightRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.xs,
    maxWidth: 390,
    padding: spacing.sm,
    width: "92%",
  },
  chatSearchTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: 11,
  },
  compactProduct: {
    backgroundColor: colors.cardMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
    overflow: "visible",
    padding: spacing.xs,
    width: "48.5%",
  },
  compactProductFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "space-between",
  },
  compactProductMain: { gap: 4 },
  compactProductImage: {
    alignItems: "center",
    aspectRatio: 1.55,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  compactProductImageAsset: { height: "100%", width: "100%" },
  compactProductName: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 14,
    minHeight: 28,
  },
  compactProductPrice: {
    color: colors.primaryDark,
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: typography.caption,
  },
  composerSuggestion: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
    width: 188,
  },
  composerSuggestionMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minWidth: 0,
  },
  composerSuggestionCopy: { flex: 1, gap: 2, minWidth: 0 },
  composerSuggestionImage: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    height: 40,
    justifyContent: "center",
    overflow: "hidden",
    width: 40,
  },
  composerSuggestionImageAsset: { height: "100%", width: "100%" },
  composerSuggestionName: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  composerSuggestionPrice: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 10,
  },
  composerSuggestions: {
    backgroundColor: colors.cardMuted,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  composerSuggestionsHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  composerSuggestionsList: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  composerSuggestionsTitle: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: 9,
    textTransform: "uppercase",
  },
  commercialTopline: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  content: { backgroundColor: colors.background, flex: 1 },
  context: {
    alignItems: "flex-start",
    backgroundColor: colors.primarySoft,
    borderBottomColor: colors.primaryLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  contextText: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  customerProduct: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.sm,
  },
  customerProductMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0,
  },
  customerProductDisabled: { opacity: 0.5 },
  customerProductImage: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 58,
    justifyContent: "center",
    overflow: "hidden",
    width: 58,
  },
  customerProductImageAsset: { height: "100%", width: "100%" },
  customerProductName: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
  },
  customerProductPrice: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.caption,
  },
  customerProductText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  empty: {
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.xxxl,
    padding: spacing.xl,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 54,
    justifyContent: "center",
    width: 54,
  },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 19,
    maxWidth: 330,
    textAlign: "center",
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.label,
  },
  errorStrip: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  eyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 10,
    textTransform: "uppercase",
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    ...shadowSoft,
  },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  headerCart: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    height: 42,
    justifyContent: "center",
    position: "relative",
    width: 42,
  },
  headerCartBadge: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.primaryDark,
    borderRadius: radius.round,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    paddingHorizontal: 0,
    position: "absolute",
    right: -7,
    top: -7,
    width: 22,
  },
  headerCartBadgeText: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    includeFontPadding: false,
    lineHeight: 12,
    textAlign: "center",
    textAlignVertical: "center",
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    lineHeight: 20,
    maxHeight: 112,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  messageLine: { alignItems: "flex-start", width: "100%" },
  messageLineMine: { alignItems: "flex-end" },
  messageScroll: { flex: 1 },
  messageText: {
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 19,
  },
  messageSender: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 9,
    textTransform: "uppercase",
  },
  messageSenderMine: { color: "rgba(255,255,255,0.78)" },
  messageTextMine: { color: colors.card },
  messageTime: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 9,
    textAlign: "right",
  },
  messageTimeMine: { color: "rgba(255,255,255,0.7)" },
  messages: {
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  messagesBottom: { justifyContent: "flex-end" },
  storeTypingAvatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  storeTypingBubble: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    height: 38,
    paddingHorizontal: spacing.md,
  },
  storeTypingDot: {
    backgroundColor: colors.textMuted,
    borderRadius: radius.round,
    height: 6,
    opacity: 0.35,
    transform: [{ scale: 0.85 }],
    width: 6,
  },
  storeTypingDotActive: {
    backgroundColor: colors.primaryDark,
    opacity: 1,
    transform: [{ scale: 1.25 }],
  },
  storeTypingLine: {
    alignItems: "flex-end",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.xs,
  },
  timeline: { flex: 1, position: "relative" },
  infoChip: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: 5,
    maxWidth: "100%",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  infoChipText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  inlineProducts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "space-between",
  },
  journeyProduct: { alignItems: "flex-start", gap: spacing.xs },
  journeyProductLabel: {
    color: colors.textMuted,
    fontFamily: fonts.extraBold,
    fontSize: 9,
    paddingLeft: spacing.xs,
  },
  journeyStatus: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  journeyStatusText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  journeyStatusTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
  },
  modalBackdrop: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  modalOverlay: {
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    flex: 1,
    justifyContent: "flex-end",
  },
  pressed: { opacity: 0.75 },
  searchComposerHint: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  searchComposerHintText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 10,
  },
  searchResponse: {
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  searchResponseEyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 9,
  },
  searchResponseHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  searchResponseText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  searchResponseTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
  },
  send: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  sendDisabled: { backgroundColor: colors.textMuted },
  shareButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.round,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  shareClose: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  shareContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  shareEmpty: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  shareEmptyText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    textAlign: "center",
  },
  shareEyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 9,
  },
  shareHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  shareHeaderCopy: { flex: 1, gap: 2 },
  shareHeaderIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  shareOption: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 70,
    padding: spacing.md,
  },
  shareOptionCopy: { flex: 1, gap: 3, minWidth: 0 },
  shareOptionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  shareOptionText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  shareOptionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
  },
  shareProduct: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 68,
    paddingVertical: spacing.sm,
  },
  shareProductCopy: { flex: 1, gap: 3, minWidth: 0 },
  shareProductImage: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 50,
    justifyContent: "center",
    overflow: "hidden",
    width: 50,
  },
  shareProductImageAsset: { height: "100%", width: "100%" },
  shareProductName: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
  },
  shareProductPrice: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.caption,
  },
  shareSectionCount: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
  },
  shareSectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  shareSectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
  },
  shareSheet: {
    alignSelf: "center",
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "82%",
    maxWidth: 560,
    padding: spacing.lg,
    width: "100%",
  },
  shareTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
  },
  statusDot: {
    backgroundColor: colors.success,
    borderRadius: radius.round,
    height: 7,
    width: 7,
  },
  statusLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  statusText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  systemMessage: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "90%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  systemText: {
    color: colors.primaryDark,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  storeWelcome: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    ...shadowSoft,
  },
  storeWelcomeBody: { gap: spacing.sm, padding: spacing.sm },
  storeWelcomeEyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 9,
  },
  storeWelcomeHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  storeWelcomeLogo: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
    width: 44,
  },
  storeWelcomeLogoImage: { height: "100%", width: "100%" },
  storeWelcomeMeta: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  storeWelcomeText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  storeWelcomeTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
  },
  supportBadge: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  supportBadgeText: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 9,
  },
  supportBadgeTextMine: { color: colors.card },
  supportToggle: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  supportToggleActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
  },
  supportToggleCopy: { flex: 1, gap: 1 },
  supportToggleIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  supportToggleIconActive: { backgroundColor: colors.primary },
  supportToggleText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 10,
    lineHeight: 14,
  },
  supportToggleTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
});
