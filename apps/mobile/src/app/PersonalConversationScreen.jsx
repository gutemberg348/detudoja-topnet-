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
import { ContactAvatar } from "../components/ContactAvatar";
import {
  blockPersonalConversation,
  getPersonalConversation,
  sendPersonalMessage,
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
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session?.accessToken || !conversationId) return;

    try {
      const response = await getPersonalConversation(session.accessToken, conversationId);
      setConversation(response.conversation);
      setAlias(response.conversation.alias ?? "");
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, session?.accessToken]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const onMessage = (payload) => {
      if (Number(payload?.conversationId) === Number(conversationId)) load();
    };

    socket?.on(realtimeEvents.personalChatMessageCreated, onMessage);
    socket?.on(realtimeEvents.personalChatUpdated, onMessage);
    return () => {
      socket?.off(realtimeEvents.personalChatMessageCreated, onMessage);
      socket?.off(realtimeEvents.personalChatUpdated, onMessage);
    };
  }, [conversationId, load, session?.accessToken]);

  useEffect(() => {
    if (conversation?.messages?.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [conversation?.messages?.length]);

  async function sendMessage() {
    const message = draft.trim();
    if (!message || isSending) return;
    setDraft("");
    setIsSending(true);
    setError("");

    try {
      const response = await sendPersonalMessage(
        session.accessToken,
        conversationId,
        message,
      );
      setConversation(response.conversation);
    } catch (requestError) {
      setDraft(message);
      setError(requestError.message);
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
          <FlatList
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={styles.messages}
            data={conversation?.messages ?? []}
            keyExtractor={(item) => String(item.id)}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={(
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons color={colors.primaryDark} name="chatbubble-ellipses-outline" size={27} />
                </View>
                <Text style={styles.emptyTitle}>Comece a conversa</Text>
                <Text style={styles.emptyText}>Agora voces podem trocar mensagens dentro do Brasil Cashback.</Text>
              </View>
            )}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ref={listRef}
            renderItem={({ item }) => <MessageBubble message={item} />}
            style={styles.list}
          />
        )}

        <ChatComposer
          draft={draft}
          onChangeDraft={setDraft}
          onFocus={() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120)}
          onSend={sendMessage}
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

function MessageBubble({ message }) {
  const time = new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <View style={[styles.messageLine, message.isMine && styles.messageLineMine]}>
      <View style={[styles.bubble, message.isMine && styles.bubbleMine]}>
        <Text style={[styles.messageText, message.isMine && styles.messageTextMine]}>{message.text}</Text>
        <View style={styles.messageMeta}>
          <Text style={[styles.messageTime, message.isMine && styles.messageTimeMine]}>{time}</Text>
          {message.isMine ? (
            <Ionicons color={message.readAt ? "#A7F3D0" : "#BDE5D6"} name="checkmark-done" size={13} />
          ) : null}
        </View>
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
  messageMeta: { alignItems: "center", alignSelf: "flex-end", flexDirection: "row", gap: 3 },
  messageText: { color: colors.textPrimary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20 },
  messageTextMine: { color: colors.card },
  messageTime: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 9 },
  messageTimeMine: { color: "#BDE5D6" },
  messages: { flexGrow: 1, gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  modalCard: { alignItems: "stretch", backgroundColor: colors.card, borderRadius: radius.lg, gap: spacing.md, maxWidth: 400, padding: spacing.xl, width: "92%", ...shadowSoft },
  modalIcon: { alignItems: "center", alignSelf: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 54, justifyContent: "center", width: 54 },
  modalOverlay: { alignItems: "center", backgroundColor: "rgba(8, 24, 18, 0.52)", flex: 1, justifyContent: "center", padding: spacing.lg },
  modalText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20, textAlign: "center" },
  modalTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h2, textAlign: "center" },
  personId: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, marginTop: 2 },
  personName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.label },
  safeArea: { backgroundColor: colors.background, flex: 1 },
});
