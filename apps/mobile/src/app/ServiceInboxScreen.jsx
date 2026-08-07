import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { getServiceConversations } from "../services/service-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

const statusCopy = {
  ABERTA: "Negociando",
  ACORDADA: "Em atendimento",
  AGUARDANDO_CONFIRMACAO: "Confirme o servico",
  CANCELADA: "Cancelada",
  ENCERRADA: "Concluida",
};

export function ServiceInboxScreen({ navigation }) {
  const { session } = useAuthStore();
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const customerConversations = useMemo(
    () => conversations.filter((conversation) => !conversation.isSeller),
    [conversations],
  );

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const response = await getServiceConversations(session.accessToken);
      setConversations(response.conversations ?? []);
    } catch (requestError) {
      if (!silent) setError(requestError.message ?? "Nao foi possivel carregar seus atendimentos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [session?.accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refresh = () => load({ silent: true });

    socket?.on(realtimeEvents.serviceChatCreated, refresh);
    socket?.on(realtimeEvents.serviceChatMessageCreated, refresh);
    socket?.on(realtimeEvents.serviceChatUpdated, refresh);

    return () => {
      socket?.off(realtimeEvents.serviceChatCreated, refresh);
      socket?.off(realtimeEvents.serviceChatMessageCreated, refresh);
      socket?.off(realtimeEvents.serviceChatUpdated, refresh);
    };
  }, [load, session?.accessToken]);

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <PageHeader
        eyebrow="Servicos"
        subtitle="Acompanhe propostas, pagamentos e mensagens dos prestadores."
        title="Meus atendimentos"
      />

      {loading ? (
        <StatePanel icon="chatbubbles-outline" loading text="Carregando conversas..." />
      ) : error ? (
        <StatePanel actionLabel="Tentar novamente" danger icon="alert-circle-outline" onAction={load} text={error} />
      ) : customerConversations.length ? (
        <View style={styles.list}>
          {customerConversations.map((conversation) => (
            <Pressable
              key={conversation.id}
              onPress={() => navigation.navigate("ServiceConversation", { conversation })}
              style={({ pressed }) => [
                styles.card,
                conversation.unreadCount > 0 && styles.cardUnread,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.icon}>
                <Ionicons color={colors.primaryDark} name="briefcase-outline" size={21} />
              </View>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.title}>
                  {conversation.serviceType?.name ?? conversation.segment?.name ?? "Servico"}
                </Text>
                <Text numberOfLines={1} style={styles.name}>
                  {conversation.otherPerson?.name ?? "Prestador"}
                </Text>
                <Text numberOfLines={1} style={styles.message}>
                  {conversation.lastMessage?.text || "Conversa iniciada"}
                </Text>
              </View>
              <View style={styles.end}>
                {conversation.unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{conversation.unreadCount}</Text>
                  </View>
                ) : null}
                <Text style={styles.status}>{statusCopy[conversation.status] ?? conversation.status}</Text>
                <Ionicons color={colors.textMuted} name="chevron-forward" size={17} />
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <StatePanel icon="briefcase-outline" text="Quando voce chamar um prestador, a conversa ficara salva aqui." title="Nenhum atendimento ainda" />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: "center", backgroundColor: colors.warning, borderRadius: radius.round, height: 24, justifyContent: "center", minWidth: 24, paddingHorizontal: 6 },
  badgeText: { color: "#4A2B00", fontFamily: fonts.extraBold, fontSize: 10 },
  card: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 92, padding: spacing.md },
  cardUnread: { borderColor: colors.primary },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  end: { alignItems: "flex-end", gap: 5 },
  icon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 46, justifyContent: "center", width: 46 },
  list: { gap: spacing.sm },
  message: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  name: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  pressed: { opacity: 0.8 },
  status: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9 },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small },
});
