import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { AppButton } from "../components/AppButton";
import { ContactAvatar } from "../components/ContactAvatar";
import { ScreenContainer } from "../components/ScreenContainer";
import {
  acceptFriendInvitation,
  declineFriendInvitation,
  getPersonalChats,
  lookupPersonalContact,
  sendFriendInvitation,
  updateFriendAlias,
} from "../services/personal-chats.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

export function PersonalChatsInboxScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const [data, setData] = useState({ conversations: [], profile: null, requests: [] });
  const [publicId, setPublicId] = useState("");
  const [contactPreview, setContactPreview] = useState(null);
  const [aliasTarget, setAliasTarget] = useState(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!session?.accessToken) return;

    try {
      const response = await getPersonalChats(session.accessToken);
      setData(response);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [session?.accessToken]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);

    socket?.on(realtimeEvents.personalChatCreated, load);
    socket?.on(realtimeEvents.personalChatMessageCreated, load);
    socket?.on(realtimeEvents.personalChatUpdated, load);

    return () => {
      socket?.off(realtimeEvents.personalChatCreated, load);
      socket?.off(realtimeEvents.personalChatMessageCreated, load);
      socket?.off(realtimeEvents.personalChatUpdated, load);
    };
  }, [load, session?.accessToken]);

  useEffect(() => {
    const scannedPublicId = route.params?.scannedPublicId;
    if (!scannedPublicId || !session?.accessToken) return;

    setPublicId(scannedPublicId);
    navigation.setParams({ scannedPublicId: undefined });
    void findContact(scannedPublicId);
  }, [navigation, route.params?.scannedPublicId, session?.accessToken]);

  async function findContact(value = publicId) {
    const id = String(value ?? "").trim();
    if (!id || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    setNotice("");

    try {
      const response = await lookupPersonalContact(session.accessToken, id);
      setContactPreview(response.contact);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitInvitation(contact = contactPreview) {
    if (!contact?.publicId || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    setNotice("");

    try {
      const response = await sendFriendInvitation(session.accessToken, contact.publicId);
      setContactPreview((current) => ({
        ...current,
        relationship: {
          conversationId: response.request.id,
          invitationDirection: "outgoing",
          status: "PENDENTE",
        },
      }));
      setPublicId("");
      setNotice("Convite enviado. Voce podera conversar assim que a pessoa aceitar.");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function decide(request, accepted) {
    setIsSubmitting(true);
    setError("");

    try {
      const response = accepted
        ? await acceptFriendInvitation(session.accessToken, request.id)
        : await declineFriendInvitation(session.accessToken, request.id);
      await load();
      if (accepted && response.conversation) {
        setContactPreview(null);
        navigation.navigate("PersonalConversation", {
          conversation: response.conversation,
        });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function openConversationById(conversationId) {
    const conversation = data.conversations.find(
      (item) => Number(item.id) === Number(conversationId),
    );
    setContactPreview(null);
    navigation.navigate("PersonalConversation", {
      conversation: conversation ?? { id: conversationId },
    });
  }

  function openAliasEditor(conversation) {
    setAliasTarget(conversation);
    setAliasDraft(conversation.alias ?? "");
    setError("");
  }

  async function saveAlias() {
    if (!aliasTarget || isSubmitting) return;
    setIsSubmitting(true);
    setError("");

    try {
      const response = await updateFriendAlias(
        session.accessToken,
        aliasTarget.id,
        aliasDraft.trim() || null,
      );
      setData((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) => (
          conversation.id === aliasTarget.id ? response.conversation : conversation
        )),
      }));
      setAliasTarget(null);
      setNotice(aliasDraft.trim() ? "Nome do contato salvo." : "Nome salvo removido.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyId() {
    await Clipboard.setStringAsync(data.profile?.publicId ?? "");
    setNotice("ID copiado.");
  }

  async function shareProfile() {
    const id = data.profile?.publicId;
    if (!id) return;
    await Share.share({
      message: `Me adicione no Brasil Cashback pelo ID @${id}`,
    });
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right", "bottom"]}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons color={colors.card} name="chatbubbles" size={25} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>Conversas pessoais</Text>
          <Text style={styles.title}>Amigos</Text>
          <Text style={styles.subtitle}>Adicione pelo ID ou QR e converse com privacidade.</Text>
        </View>
        <Pressable accessibilityLabel="Exibir meu QR" onPress={() => setQrOpen(true)} style={styles.qrButton}>
          <Ionicons color={colors.primaryDark} name="qr-code-outline" size={23} />
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} size="large" />
      ) : (
        <>
          <View style={styles.myIdBand}>
            <View style={styles.myIdCopy}>
              <Text style={styles.bandLabel}>Seu ID</Text>
              <Text numberOfLines={1} selectable style={styles.publicId}>@{data.profile?.publicId}</Text>
            </View>
            <Pressable accessibilityLabel="Copiar meu ID" onPress={copyId} style={styles.iconButton}>
              <Ionicons color={colors.primaryDark} name="copy-outline" size={20} />
            </Pressable>
            <Pressable accessibilityLabel="Compartilhar meu ID" onPress={shareProfile} style={styles.iconButton}>
              <Ionicons color={colors.primaryDark} name="share-social-outline" size={20} />
            </Pressable>
          </View>

          <View style={styles.addSection}>
            <Text style={styles.sectionTitle}>Adicionar amigo</Text>
            <View style={styles.addRow}>
              <View style={styles.inputShell}>
                <Ionicons color={colors.textMuted} name="at-outline" size={19} />
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) => {
                    setPublicId(value);
                    setContactPreview(null);
                    setError("");
                  }}
                  onSubmitEditing={() => findContact()}
                  placeholder="@nome.identificador"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="search"
                  style={styles.input}
                  value={publicId}
                />
              </View>
              <Pressable accessibilityLabel="Ler QR de um amigo" onPress={() => navigation.navigate("FriendQrScan")} style={styles.scanButton}>
                <Ionicons color={colors.primaryDark} name="scan-outline" size={22} />
              </Pressable>
            </View>
            <AppButton
              disabled={!publicId.trim()}
              icon="search-outline"
              loading={isSubmitting}
              onPress={() => findContact()}
              title="Localizar contato"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          </View>

          {data.requests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Convites</Text>
              {data.requests.map((request) => (
                <View key={request.id} style={styles.requestRow}>
                  <ContactAvatar
                    name={request.person.name}
                    photoUrl={request.person.photoUrl}
                  />
                  <View style={styles.personCopy}>
                    <Text numberOfLines={1} style={styles.personName}>{request.person.name}</Text>
                    <Text numberOfLines={1} style={styles.personMeta}>@{request.person.publicId}</Text>
                  </View>
                  {request.invitationDirection === "incoming" ? (
                    <View style={styles.requestActions}>
                      <Pressable accessibilityLabel="Recusar convite" disabled={isSubmitting} onPress={() => decide(request, false)} style={styles.declineButton}>
                        <Ionicons color={colors.danger} name="close" size={20} />
                      </Pressable>
                      <Pressable accessibilityLabel="Aceitar convite" disabled={isSubmitting} onPress={() => decide(request, true)} style={styles.acceptButton}>
                        <Ionicons color={colors.card} name="checkmark" size={20} />
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.pending}>Enviado</Text>
                  )}
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Suas conversas</Text>
              <Text style={styles.count}>{data.conversations.length}</Text>
            </View>
            {data.conversations.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons color={colors.primaryDark} name="people-outline" size={28} />
                <Text style={styles.emptyTitle}>Nenhum amigo adicionado</Text>
                <Text style={styles.emptyText}>Compartilhe seu QR ou envie um convite pelo ID.</Text>
              </View>
            ) : data.conversations.map((conversation) => (
              <View key={conversation.id} style={styles.friendRow}>
                <Pressable
                  accessibilityLabel={`Conversar com ${conversation.displayName}`}
                  onPress={() => navigation.navigate("PersonalConversation", { conversation })}
                  style={({ pressed }) => [styles.friendMain, pressed && styles.pressed]}
                >
                  <ContactAvatar
                    name={conversation.displayName}
                    photoUrl={conversation.person.photoUrl}
                  />
                  <View style={styles.personCopy}>
                    <Text numberOfLines={1} style={styles.personName}>{conversation.displayName}</Text>
                    <Text numberOfLines={1} style={styles.personMeta}>
                      {conversation.lastMessage?.text ?? `@${conversation.person.publicId}`}
                    </Text>
                  </View>
                  {conversation.unreadCount > 0 ? (
                    <View style={styles.unread}><Text style={styles.unreadText}>{Math.min(99, conversation.unreadCount)}</Text></View>
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityLabel={`Salvar nome de ${conversation.person.name}`}
                  onPress={() => openAliasEditor(conversation)}
                  style={styles.contactAction}
                >
                  <Ionicons color={colors.primaryDark} name="pencil-outline" size={18} />
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}

      <Modal animationType="fade" onRequestClose={() => setQrOpen(false)} transparent visible={qrOpen}>
        <View style={styles.modalOverlay}>
          <Pressable onPress={() => setQrOpen(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.qrModal}>
            <Pressable accessibilityLabel="Fechar QR" onPress={() => setQrOpen(false)} style={styles.modalClose}>
              <Ionicons color={colors.textPrimary} name="close" size={22} />
            </Pressable>
            <Text style={styles.qrTitle}>Meu QR de amigo</Text>
            <Text style={styles.qrSubtitle}>A outra pessoa aponta a camera e envia o convite.</Text>
            {data.profile?.qrValue ? (
              <View style={styles.qrCode}>
                <QRCode color={colors.textPrimary} size={210} value={data.profile.qrValue} />
              </View>
            ) : null}
            <Text selectable style={styles.qrId}>@{data.profile?.publicId}</Text>
            <AppButton icon="share-social-outline" onPress={shareProfile} title="Compartilhar ID" />
          </View>
        </View>
      </Modal>

      <ContactPreviewModal
        contact={contactPreview}
        error={error}
        loading={isSubmitting}
        onAccept={() => decide({ id: contactPreview?.relationship?.conversationId }, true)}
        onClose={() => setContactPreview(null)}
        onOpenConversation={() => openConversationById(contactPreview?.relationship?.conversationId)}
        onSendInvitation={() => submitInvitation(contactPreview)}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setAliasTarget(null)}
        transparent
        visible={Boolean(aliasTarget)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable onPress={() => setAliasTarget(null)} style={StyleSheet.absoluteFill} />
          <View style={styles.aliasModal}>
            <ContactAvatar
              name={aliasTarget?.person?.name}
              photoUrl={aliasTarget?.person?.photoUrl}
              size={58}
            />
            <Text style={styles.qrTitle}>Salvar nome do contato</Text>
            <Text style={styles.qrSubtitle}>
              Este nome aparece somente para voce. O perfil original continua como @{aliasTarget?.person?.publicId}.
            </Text>
            <TextInput
              autoFocus
              maxLength={80}
              onChangeText={setAliasDraft}
              placeholder={aliasTarget?.person?.name ?? "Nome do contato"}
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              style={styles.aliasInput}
              value={aliasDraft}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <AppButton
                disabled={isSubmitting}
                onPress={() => setAliasTarget(null)}
                title="Cancelar"
                variant="outline"
              />
              <AppButton loading={isSubmitting} onPress={saveAlias} title="Salvar nome" />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

function ContactPreviewModal({
  contact,
  error,
  loading,
  onAccept,
  onClose,
  onOpenConversation,
  onSendInvitation,
}) {
  const relationship = contact?.relationship;
  const isActive = relationship?.status === "ATIVA";
  const isIncoming = relationship?.status === "PENDENTE"
    && relationship.invitationDirection === "incoming";
  const isOutgoing = relationship?.status === "PENDENTE"
    && relationship.invitationDirection === "outgoing";
  const canInvite = !contact?.isSelf
    && (!relationship || relationship.status === "RECUSADA");

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(contact)}>
      <View style={styles.modalOverlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.contactModal}>
          <Pressable accessibilityLabel="Fechar contato" onPress={onClose} style={styles.modalClose}>
            <Ionicons color={colors.textPrimary} name="close" size={22} />
          </Pressable>
          <ContactAvatar name={contact?.name} photoUrl={contact?.photoUrl} size={70} />
          <View style={styles.contactIdentity}>
            <Text numberOfLines={2} style={styles.contactName}>{contact?.name}</Text>
            <Text selectable style={styles.qrId}>@{contact?.publicId}</Text>
          </View>

          {contact?.isSelf ? (
            <View style={styles.relationshipNotice}>
              <Ionicons color={colors.primaryDark} name="person-circle-outline" size={20} />
              <Text style={styles.relationshipText}>Este e o seu proprio perfil.</Text>
            </View>
          ) : null}
          {isOutgoing ? (
            <View style={styles.relationshipNotice}>
              <Ionicons color={colors.warning} name="time-outline" size={20} />
              <Text style={styles.relationshipText}>Convite enviado. Aguardando a pessoa aceitar.</Text>
            </View>
          ) : null}
          {relationship?.status === "BLOQUEADA" ? (
            <View style={styles.relationshipNotice}>
              <Ionicons color={colors.textMuted} name="lock-closed-outline" size={20} />
              <Text style={styles.relationshipText}>Este contato nao esta disponivel.</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {isActive ? (
            <AppButton icon="chatbubble-outline" onPress={onOpenConversation} title="Abrir conversa" />
          ) : null}
          {isIncoming ? (
            <AppButton icon="person-add-outline" loading={loading} onPress={onAccept} title="Aceitar e conversar" />
          ) : null}
          {canInvite ? (
            <AppButton icon="person-add-outline" loading={loading} onPress={onSendInvitation} title="Enviar convite" />
          ) : null}
          <AppButton disabled={loading} onPress={onClose} title="Fechar" variant="outline" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  acceptButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  addRow: { flexDirection: "row", gap: spacing.sm },
  addSection: { gap: spacing.md },
  aliasInput: { borderColor: colors.borderStrong, borderRadius: radius.md, borderWidth: 1, color: colors.textPrimary, fontFamily: fonts.medium, fontSize: typography.body, minHeight: 52, paddingHorizontal: spacing.md, width: "100%" },
  aliasModal: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.lg, gap: spacing.md, maxWidth: 400, padding: spacing.xl, width: "100%", ...shadowSoft },
  bandLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  contactAction: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  contactIdentity: { alignItems: "center", gap: spacing.xs },
  contactModal: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.lg, gap: spacing.md, maxWidth: 380, padding: spacing.xl, width: "100%", ...shadowSoft },
  contactName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h2, textAlign: "center" },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  count: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption },
  declineButton: { alignItems: "center", backgroundColor: "#FFF1F2", borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  empty: { alignItems: "center", borderColor: colors.border, borderRadius: radius.md, borderStyle: "dashed", borderWidth: 1, gap: spacing.sm, padding: spacing.xl },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, textAlign: "center" },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption },
  friendMain: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.md, minWidth: 0, paddingVertical: spacing.sm },
  friendRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.sm, minHeight: 66 },
  hero: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  heroCopy: { flex: 1, gap: 2, minWidth: 0 },
  heroIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 52, justifyContent: "center", width: 52 },
  iconButton: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  input: { color: colors.textPrimary, flex: 1, fontFamily: fonts.medium, fontSize: typography.small, paddingVertical: 0 },
  inputShell: { alignItems: "center", borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flex: 1, flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md },
  kicker: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, textTransform: "uppercase" },
  modalClose: { alignItems: "center", alignSelf: "flex-end", backgroundColor: colors.cardMuted, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  modalActions: { gap: spacing.sm, width: "100%" },
  modalOverlay: { alignItems: "center", backgroundColor: "rgba(8, 24, 18, 0.52)", flex: 1, justifyContent: "center", padding: spacing.lg },
  myIdBand: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  myIdCopy: { flex: 1, minWidth: 0 },
  notice: { color: colors.primaryDark, fontFamily: fonts.medium, fontSize: typography.caption },
  pending: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: typography.caption },
  personCopy: { flex: 1, minWidth: 0 },
  personMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, marginTop: 2 },
  personName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  pressed: { backgroundColor: colors.primarySoft, opacity: 0.78 },
  publicId: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  qrButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 46, justifyContent: "center", width: 46 },
  qrCode: { backgroundColor: colors.card, padding: spacing.md },
  qrId: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.small },
  qrModal: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.lg, gap: spacing.md, maxWidth: 380, padding: spacing.xl, width: "100%", ...shadowSoft },
  qrSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18, textAlign: "center" },
  qrTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h2 },
  relationshipNotice: { alignItems: "center", alignSelf: "stretch", backgroundColor: colors.cardMuted, borderRadius: radius.md, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  relationshipText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption, lineHeight: 18 },
  requestActions: { flexDirection: "row", gap: spacing.xs },
  requestRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, minHeight: 66, paddingVertical: spacing.sm },
  scanButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 52, justifyContent: "center", width: 52 },
  section: { gap: spacing.sm },
  sectionHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sectionTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.label },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18 },
  title: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h2 },
  unread: { alignItems: "center", backgroundColor: colors.warning, borderRadius: radius.round, minHeight: 23, justifyContent: "center", minWidth: 23, paddingHorizontal: 5 },
  unreadText: { color: "#4A2B00", fontFamily: fonts.bold, fontSize: 10 },
});
