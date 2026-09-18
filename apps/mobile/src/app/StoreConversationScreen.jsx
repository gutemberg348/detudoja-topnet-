import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
import { BackHeader } from "../components/BackHeader";
import { CartAddButton } from "../components/CartAddButton";
import { useConversationRealtime } from "../hooks/useConversationRealtime";
import { useChatTimeline } from "../hooks/useChatTimeline";
import { getMarketplaceStore } from "../services/marketplace.api";
import { realtimeEvents } from "../services/realtime";
import {
  getStoreConversation,
  openStoreConversation,
  sendStoreConversationMessage,
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
  } = useCartStore();
  const insets = useSafeAreaInsets();
  const initialConversation = route.params?.conversation ?? null;
  const initialStore = route.params?.store ?? null;
  const scrollRef = useRef(null);
  const [conversation, setConversation] = useState(initialConversation);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initialConversation?.messages);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [openingContent, setOpeningContent] = useState("");
  const [sending, setSending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState("");
  const [supportMode, setSupportMode] = useState(false);
  const [catalogSearchFocused, setCatalogSearchFocused] = useState(false);
  const [storeCatalog, setStoreCatalog] = useState(
    initialStore?.products ? initialStore : null,
  );
  const conversationId = conversation?.id ?? initialConversation?.id;
  const storeId =
    conversation?.store?.id
    ?? initialConversation?.store?.id
    ?? initialStore?.id
    ?? route.params?.storeId;
  const timeline = useChatTimeline({
    itemCount: conversation?.messages?.length ?? 0,
    scrollRef,
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

  useEffect(() => {
    load();
  }, [load]);

  const refreshConversation = useCallback(() => {
    load({ silent: true });
  }, [load]);

  useConversationRealtime({
    accessToken: session?.accessToken,
    conversationId: conversation?.id,
    events: [
      realtimeEvents.storeChatMessageCreated,
      realtimeEvents.storeChatUpdated,
    ],
    onUpdate: refreshConversation,
  });

  async function send(payload = null) {
    const isCommercial = payload?.type && payload.type !== "TEXTO";
    const message = payload?.message ?? (isCommercial ? "" : draft.trim());
    const sendsSupport = !conversation?.isStore && supportMode && !isCommercial;

    if ((!message && !payload?.attachment && !isCommercial) || !conversation?.id || sending || !session?.accessToken) {
      return;
    }

    setSending(true);
    setError("");

    try {
      const response = await sendStoreConversationMessage(
        session.accessToken,
        conversation.id,
        conversation.isStore
          ? (payload ?? message)
          : {
              ...(payload ?? {}),
              message,
              searchCatalog: !sendsSupport && Boolean(message && !payload?.attachment && !isCommercial),
              support: sendsSupport,
            },
      );

      setDraft("");
      if (sendsSupport) setSupportMode(false);
      setCatalogSearchFocused(false);
      setConversation(response.conversation);
    } catch (requestError) {
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

  function addProduct(product) {
    if (!storeView || !product) return;
    addItem(buildCartItem(product), storeView, conversation?.id);
    if (conversation?.id && session?.accessToken && !conversation.isStore) {
      void trackStoreConversationActivity(session.accessToken, conversation.id, {
        action: "ADD_TO_CART",
        productId: product.id,
      }).catch(() => {});
    }
  }

  function addSharedProduct(product) {
    const catalogProduct = (storeView?.products ?? []).find(
      (item) => String(item.id) === String(product?.id),
    );
    addProduct(catalogProduct ?? product);
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
  const currentStoreItemCount = itemCountForStore(storeView?.id);
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
        {!conversation?.isStore && currentStoreItemCount > 0 ? (
          <Pressable
            accessibilityLabel={`Abrir carrinho com ${currentStoreItemCount} itens`}
            onPress={() => navigation.navigate("Cart")}
            style={({ pressed }) => [styles.headerCart, pressed && styles.pressed]}
          >
            <Ionicons color={colors.card} name="bag-handle" size={20} />
            <View style={styles.headerCartBadge}>
              <Text style={styles.headerCartBadgeText}>
                {currentStoreItemCount > 99 ? "99+" : currentStoreItemCount}
              </Text>
            </View>
          </Pressable>
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
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={[styles.messages, conversation?.isStore && styles.messagesBottom]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={timeline.onContentSizeChange}
          onLayout={timeline.onLayout}
          onScroll={timeline.onScroll}
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
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: supportMode }}
            onPress={() => setSupportMode((current) => !current)}
            style={({ pressed }) => [
              styles.supportToggle,
              supportMode && styles.supportToggleActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={supportMode ? colors.primaryDark : colors.textMuted}
              name={supportMode ? "checkbox" : "square-outline"}
              size={21}
            />
            <View style={styles.supportToggleCopy}>
              <Text style={styles.supportToggleTitle}>Enviar como suporte</Text>
              <Text style={styles.supportToggleText}>
                {supportMode
                  ? "A loja recebera um aviso desta mensagem"
                  : "Desmarcado: o campo pesquisa produtos sem notificar a loja"}
              </Text>
            </View>
          </Pressable>
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
    </ScreenContainer>
  );
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
                onAdd={() => onAddProduct(product)}
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
                onPress={() => onAdd(product)}
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
                onAdd={() => onAddProduct(product)}
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

function MessageBubble({
  accessToken,
  loading,
  message,
  onAddProduct,
  onOpenCatalog,
  onOpenContent,
  onOpenSearchProduct,
  searchSuggestions,
}) {
  if (message.author === "system" && message.content?.kind === "PRODUCT") {
    return (
      <View style={styles.journeyProduct}>
        <Text style={styles.journeyProductLabel}>JORNADA DE COMPRA</Text>
        <CommercialMessageCard
          content={message.content}
          loading={loading}
          onAdd={onAddProduct ? () => onAddProduct(message.content.product) : null}
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
            ? () => onAddProduct(message.content.product)
            : null}
          onPress={() => onOpenContent(message)}
          text={message.text}
          type={message.type}
        />
        <ChatMessageMeta createdAt={message.createdAt} isMine={message.isMine} readAt={message.readAt} />
      </View>
    );
  }

  const searchProducts = message.content?.kind === "SEARCH"
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
          suggestions={message.content.suggestions ?? searchSuggestions ?? []}
          total={message.content.productCount ?? searchProducts.length}
        />
      ) : null}
    </View>
  );
}

function ChatSearchResults({ onAdd, onOpen, onOpenCatalog, products, suggestions, total }) {
  const isSuggestion = total === 0;
  const visibleProducts = isSuggestion ? suggestions : products;

  return (
    <View style={styles.chatSearchResults}>
      <View style={styles.chatSearchHeading}>
        <Ionicons color={colors.primaryDark} name="sparkles-outline" size={14} />
        <Text style={styles.chatSearchTitle}>
          {total > 0
            ? `${total} produto${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"}`
            : visibleProducts.length
              ? "Sugestoes para voce"
              : "Nenhum produto encontrado"}
        </Text>
      </View>
      {isSuggestion ? (
        <Text style={styles.searchResponseText}>
          Nao encontramos exatamente isso, mas estes produtos podem ajudar.
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
                    <CartAddButton direction="up" name={product.name} onPress={() => onAdd(product)} size={28} />
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
        <Pressable
          onPress={onOpenCatalog}
          style={({ pressed }) => [styles.chatSearchCatalogButton, pressed && styles.pressed]}
        >
          <Ionicons color={colors.primaryDark} name="grid-outline" size={17} />
          <Text style={styles.chatSearchCatalogButtonText}>Ver todos os produtos</Text>
          <Ionicons color={colors.primaryDark} name="arrow-forward" size={16} />
        </Pressable>
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
  chatSearchCatalogButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 42,
    paddingHorizontal: spacing.sm,
  },
  chatSearchCatalogButtonText: {
    color: colors.primaryDark,
    flex: 1,
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
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: 3,
    position: "absolute",
    right: -5,
    top: -5,
  },
  headerCartBadgeText: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 9,
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  supportToggleActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
  },
  supportToggleCopy: { flex: 1, gap: 1 },
  supportToggleText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 9,
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
