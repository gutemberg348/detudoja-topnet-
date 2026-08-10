import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import { ChatComposer } from "../components/ChatComposer";
import { useConversationRealtime } from "../hooks/useConversationRealtime";
import { getMarketplaceStore } from "../services/marketplace.api";
import { realtimeEvents } from "../services/realtime";
import {
  getStoreConversation,
  openStoreConversation,
  sendStoreConversationMessage,
} from "../services/store-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { resolveMediaUrl } from "../utils/media";
import { formatarHora } from "../utils/date";
import { formatarDinheiro } from "../utils/money";
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
  const initialConversation = route.params?.conversation ?? null;
  const initialStore = route.params?.store ?? null;
  const scrollRef = useRef(null);
  const [conversation, setConversation] = useState(initialConversation);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initialConversation?.messages);
  const [openingContent, setOpeningContent] = useState("");
  const [sending, setSending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState("");
  const conversationId = conversation?.id ?? initialConversation?.id;
  const storeId =
    conversation?.store?.id
    ?? initialConversation?.store?.id
    ?? initialStore?.id
    ?? route.params?.storeId;

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
    ignoreReasons: ["read"],
    onUpdate: refreshConversation,
  });

  async function send() {
    const message = draft.trim();

    if (!message || !conversation?.id || sending || !session?.accessToken) {
      return;
    }

    setSending(true);
    setError("");

    try {
      const response = await sendStoreConversationMessage(
        session.accessToken,
        conversation.id,
        message,
      );

      setDraft("");
      setConversation(response.conversation);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel enviar a mensagem.");
    } finally {
      setSending(false);
    }
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
      navigation.navigate("StoreDetails", {
        lojaId: content.store?.id,
      });
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

  return (
    <ScreenContainer
      contentContainerStyle={styles.content}
      edges={["left", "right"]}
      padded={false}
      scroll={false}
    >
      <View style={styles.header}>
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
            <Text style={styles.statusText}>Canal geral aberto</Text>
          </View>
        </View>
      </View>

      <View style={styles.context}>
        <Ionicons color={colors.primaryDark} name="information-circle-outline" size={17} />
        <Text style={styles.contextText}>
          Tire duvidas sobre produtos, disponibilidade e compras. Cada pedido possui sua propria conversa.
        </Text>
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

      <ScrollView
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        style={styles.messageScroll}
      >
        {(conversation?.messages ?? []).length ? (
          conversation.messages.map((message) => (
            <MessageBubble
              key={message.id}
              loading={openingContent === String(message.id)}
              message={message}
              onOpenContent={openCommercialContent}
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

      <ChatComposer
        draft={draft}
        leadingAction={conversation?.isStore ? (
          <Pressable
            accessibilityLabel="Compartilhar produto ou catalogo"
            onPress={() => setShareOpen(true)}
            style={({ pressed }) => [
              styles.shareButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={colors.primaryDark} name="add" size={23} />
          </Pressable>
        ) : null}
        onChangeDraft={setDraft}
        onSend={send}
        placeholder={
          conversation?.isStore
            ? "Responder ao cliente"
            : "Escreva sua duvida para a loja"
        }
        sending={sending}
        submitOnEnter
      />

      <ShareCatalogModal
        conversation={conversation}
        onClose={() => setShareOpen(false)}
        onShare={shareCommercialContent}
        sharing={sharing}
        visible={shareOpen}
      />
    </ScreenContainer>
  );
}

function MessageBubble({ loading, message, onOpenContent }) {
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
          onPress={() => onOpenContent(message)}
          text={message.text}
          type={message.type}
        />
        <Text style={styles.commercialTime}>{formatarHora(message.createdAt)}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.messageLine, message.isMine && styles.messageLineMine]}>
      <View style={[styles.bubble, message.isMine && styles.bubbleMine]}>
        <Text style={[styles.messageText, message.isMine && styles.messageTextMine]}>
          {message.text}
        </Text>
        <Text style={[styles.messageTime, message.isMine && styles.messageTimeMine]}>
          {formatarHora(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

function CommercialMessageCard({ content, loading, onPress, text, type }) {
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
    maxWidth: "88%",
    padding: spacing.md,
    width: 310,
    ...shadowSoft,
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
  content: { backgroundColor: colors.background },
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
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
});
