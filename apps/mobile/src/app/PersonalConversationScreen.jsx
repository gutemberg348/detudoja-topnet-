import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../components/AppButton";
import { BackHeader } from "../components/BackHeader";
import { ChatComposer } from "../components/ChatComposer";
import { ChatAttachment } from "../components/ChatAttachment";
import { ChatMessageMeta } from "../components/ChatMessageMeta";
import { ChatScrollToLatestButton } from "../components/ChatScrollToLatestButton";
import { ChatTypingIndicator } from "../components/ChatTypingIndicator";
import { ContactAvatar } from "../components/ContactAvatar";
import { useChatTimeline } from "../hooks/useChatTimeline";
import { useChatTyping } from "../hooks/useChatTyping";
import {
  blockPersonalConversation,
  getPersonalConversation,
  markPersonalConversationRead,
  sendPersonalMessage,
  setPersonalConversationTyping,
  updateFriendAlias,
} from "../services/personal-chats.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

export function PersonalConversationScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const insets = useSafeAreaInsets();
  const initialConversation = route.params?.conversation;
  const conversationId = initialConversation?.id ?? route.params?.conversationId;
  const listRef = useRef(null);
  const [conversation, setConversation] = useState(initialConversation ?? null);
  const [draft, setDraft] = useState("");
  const [alias, setAlias] = useState(initialConversation?.alias ?? "");
  const [aliasOpen, setAliasOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialConversation?.messages);
  const [isSending, setIsSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [messagePage, setMessagePage] = useState({ hasMore: true, nextCursor: null });
  const [error, setError] = useState("");
  const timeline = useChatTimeline({
    latestMessageId: conversation?.messages?.at(-1)?.id,
    latestMessageIsMine: conversation?.messages?.at(-1)?.isMine,
    scrollRef: listRef,
  });
  const typing = useChatTyping({
    conversationId,
    draft,
    sendTyping: (isTyping) => setPersonalConversationTyping(session?.accessToken, conversationId, isTyping),
  });

  const load = useCallback(async () => {
    if (!session?.accessToken || !conversationId) return;

    try {
      const response = await getPersonalConversation(session.accessToken, conversationId);
      setConversation(response.conversation);
      setMessagePage(response.messagePage ?? { hasMore: false, nextCursor: null });
      setAlias(response.conversation.alias ?? "");
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, session?.accessToken]);

  const loadOlder = useCallback(async () => {
    if (!session?.accessToken || !conversationId || loadingOlder || !messagePage.hasMore || !messagePage.nextCursor) return;
    setLoadingOlder(true);
    try {
      const response = await getPersonalConversation(session.accessToken, conversationId, {
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
  }, [conversationId, loadingOlder, messagePage.hasMore, messagePage.nextCursor, session?.accessToken]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const onMessage = (payload) => {
      if (Number(payload?.conversationId) !== Number(conversationId) || !payload?.message) return;
      const message = {
        ...payload.message,
        isMine: Number(payload.senderUserId) === Number(session.user?.id),
      };
      setConversation((current) => {
        if (!current || current.messages?.some((item) => Number(item.id) === Number(message.id))) return current;
        return { ...current, lastMessage: message, messages: [...(current.messages ?? []), message] };
      });
      if (!message.isMine) void markPersonalConversationRead(session.accessToken, conversationId).catch(() => {});
    };

    socket?.on(realtimeEvents.personalChatMessageCreated, onMessage);
    const onUpdated = (payload = {}) => {
      if (payload.reason === "read") {
        const readAt = new Date().toISOString();
        setConversation((current) => current
          ? { ...current, messages: (current.messages ?? []).map((item) => item.isMine && !item.readAt ? { ...item, readAt } : item) }
          : current);
      } else load();
    };
    const onTyping = (payload) => {
      if (payload?.scope === "personal" && Number(payload.senderUserId) !== Number(session.user?.id)) typing.receiveTyping(payload);
    };
    socket?.on(realtimeEvents.personalChatUpdated, onUpdated);
    socket?.on(realtimeEvents.chatTyping, onTyping);
    return () => {
      socket?.off(realtimeEvents.personalChatMessageCreated, onMessage);
      socket?.off(realtimeEvents.personalChatUpdated, onUpdated);
      socket?.off(realtimeEvents.chatTyping, onTyping);
    };
  }, [conversationId, load, session?.accessToken, session?.user?.id, typing.receiveTyping]);

  async function sendMessage(payload = null) {
    const message = payload?.message ?? draft.trim();
    if ((!message && !payload?.attachment) || isSending) return;
    if (!payload) setDraft("");
    setIsSending(true);
    setError("");

    try {
      const response = await sendPersonalMessage(
        session.accessToken,
        conversationId,
        payload ?? message,
      );
      setConversation((current) => {
        if (!current) return response.conversation;
        const messages = [...(current.messages ?? [])];
        if (response.message && !messages.some((item) => Number(item.id) === Number(response.message.id))) messages.push(response.message);
        return { ...current, ...response.conversation, messages };
      });
    } catch (requestError) {
      if (!payload) setDraft(message);
      setError(requestError.message);
      throw requestError;
    } finally {
      setIsSending(false);
    }
  }

  async function saveAlias() {
    setIsSending(true);
    setError("");

    try {
      const response = await updateFriendAlias(
        session.accessToken,
        conversationId,
        alias.trim() || null,
      );
      setConversation((current) => ({ ...current, ...response.conversation }));
      setAliasOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSending(false);
    }
  }

  function confirmBlock() {
    Alert.alert(
      "Bloquear este contato?",
      "A conversa sera encerrada e essa pessoa nao podera enviar novas solicitacoes para voce.",
      [
        { style: "cancel", text: "Cancelar" },
        {
          onPress: async () => {
            setIsSending(true);
            setError("");
            try {
              await blockPersonalConversation(
                session.accessToken,
                conversationId,
              );
              navigation.goBack();
            } catch (requestError) {
              setError(requestError.message);
            } finally {
              setIsSending(false);
            }
          },
          style: "destructive",
          text: "Bloquear",
        },
      ],
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        style={styles.keyboard}
      >
        <View style={styles.header}>
          <BackHeader compact onPress={navigation.goBack} showTitle={false} />
          <ContactAvatar
            name={conversation?.displayName}
            photoUrl={conversation?.person?.photoUrl}
            size={44}
          />
          <View style={styles.headerCopy}>
            <Text numberOfLines={1} style={styles.personName}>{conversation?.displayName ?? "Amigo"}</Text>
            <Text numberOfLines={1} style={styles.personId}>
              {conversation?.alias
                ? `${conversation.person.name} · @${conversation.person.publicId}`
                : `@${conversation?.person?.publicId ?? ""}`}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable accessibilityLabel="Editar nome salvo" onPress={() => setAliasOpen(true)} style={styles.aliasButton}>
              <Ionicons color={colors.primaryDark} name="pencil-outline" size={19} />
            </Pressable>
            <Pressable accessibilityLabel="Bloquear contato" disabled={isSending} onPress={confirmBlock} style={styles.blockButton}>
              <Ionicons color={colors.danger} name="ban-outline" size={19} />
            </Pressable>
          </View>
        </View>

        {error ? (
          <View style={styles.errorStrip}>
            <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <View style={styles.timeline}>
            <FlatList
              automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
              contentContainerStyle={styles.messages}
              data={conversation?.messages ?? []}
              keyExtractor={(item) => String(item.id)}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={loadingOlder ? <ActivityIndicator color={colors.primary} size="small" /> : null}
              ListFooterComponent={<ChatTypingIndicator visible={typing.isOtherTyping} />}
              ListEmptyComponent={(
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <Ionicons color={colors.primaryDark} name="chatbubble-ellipses-outline" size={27} />
                  </View>
                  <Text style={styles.emptyTitle}>Comece a conversa</Text>
                  <Text style={styles.emptyText}>Agora voces podem trocar mensagens dentro do Brasil Cashback.</Text>
                </View>
              )}
              onContentSizeChange={timeline.onContentSizeChange}
              onScroll={(event) => {
                timeline.onScroll(event);
                if (event.nativeEvent.contentOffset.y < 60) void loadOlder();
              }}
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              ref={listRef}
              renderItem={({ item }) => <MessageBubble accessToken={session.accessToken} message={item} />}
              scrollEventThrottle={16}
              style={styles.list}
            />
            <ChatScrollToLatestButton onPress={timeline.scrollToLatest} unreadCount={timeline.unreadBelow} visible={!timeline.isAtBottom} />
          </View>
        )}

        <ChatComposer
          draft={draft}
          onAttachmentError={setError}
          onChangeDraft={setDraft}
          onFocus={() => timeline.scrollToLatest(true)}
          onSend={sendMessage}
          onSendAttachment={sendMessage}
          placeholder="Escreva uma mensagem"
          sending={isSending}
          style={{ paddingBottom: Math.max(spacing.sm, insets.bottom + spacing.xs) }}
        />
      </KeyboardAvoidingView>

      <Modal animationType="fade" onRequestClose={() => setAliasOpen(false)} transparent visible={aliasOpen}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <Pressable onPress={() => setAliasOpen(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons color={colors.primaryDark} name="person-outline" size={24} />
            </View>
            <Text style={styles.modalTitle}>Nome salvo</Text>
            <Text style={styles.modalText}>Este apelido aparece somente para voce. O nome original da conta nao muda.</Text>
            <TextInput
              autoFocus
              maxLength={80}
              onChangeText={setAlias}
              placeholder={conversation?.person?.name ?? "Nome do amigo"}
              placeholderTextColor={colors.textMuted}
              style={styles.aliasInput}
              value={alias}
            />
            <AppButton loading={isSending} onPress={saveAlias} title="Salvar nome" />
            <AppButton disabled={isSending} onPress={() => setAliasOpen(false)} title="Cancelar" variant="outline" />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function MessageBubble({ accessToken, message }) {
  return (
    <View style={[styles.messageLine, message.isMine && styles.messageLineMine]}>
      <View style={[styles.bubble, message.isMine && styles.bubbleMine]}>
        <ChatAttachment accessToken={accessToken} attachment={message.attachment} isMine={message.isMine} />
        {message.text ? <Text style={[styles.messageText, message.isMine && styles.messageTextMine]}>{message.text}</Text> : null}
        <ChatMessageMeta createdAt={message.createdAt} isMine={message.isMine} readAt={message.readAt} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  aliasButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  blockButton: { alignItems: "center", backgroundColor: "#FFF1F2", borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  aliasInput: { borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.textPrimary, fontFamily: fonts.medium, fontSize: typography.body, minHeight: 52, paddingHorizontal: spacing.md },
  bubble: { backgroundColor: colors.cardMuted, borderBottomLeftRadius: 4, borderRadius: radius.lg, gap: 4, maxWidth: "84%", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleMine: { backgroundColor: colors.primaryDark, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: 4 },
  empty: { alignItems: "center", alignSelf: "center", gap: spacing.sm, maxWidth: 300, paddingVertical: spacing.xxxl },
  emptyIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 56, justifyContent: "center", width: 56 },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18, textAlign: "center" },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.label },
  errorStrip: { alignItems: "center", backgroundColor: "#FFF1F2", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  errorText: { color: colors.danger, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption },
  header: { alignItems: "center", backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 68, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerActions: { flexDirection: "row", gap: spacing.xs },
  headerCopy: { flex: 1, minWidth: 0 },
  keyboard: { flex: 1 },
  list: { flex: 1 },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  messageLine: { alignItems: "flex-start" },
  messageLineMine: { alignItems: "flex-end" },
  messageText: { color: colors.textPrimary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20 },
  messageTextMine: { color: colors.card },
  messages: { flexGrow: 1, gap: spacing.sm, justifyContent: "flex-end", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  modalCard: { alignItems: "stretch", backgroundColor: colors.card, borderRadius: radius.lg, gap: spacing.md, maxWidth: 400, padding: spacing.xl, width: "92%", ...shadowSoft },
  modalIcon: { alignItems: "center", alignSelf: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 54, justifyContent: "center", width: 54 },
  modalOverlay: { alignItems: "center", backgroundColor: "rgba(8, 24, 18, 0.52)", flex: 1, justifyContent: "center", padding: spacing.lg },
  modalText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20, textAlign: "center" },
  modalTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h2, textAlign: "center" },
  personId: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, marginTop: 2 },
  personName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.label },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  timeline: { flex: 1, position: "relative" },
});
