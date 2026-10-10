import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { getServiceConversations } from "../services/service-chats.api";
import { realtimeEvents } from "../services/realtime";
import { useAuthStore } from "../stores/useAuthStore";
import { finishedServiceStatuses, serviceHistoryKey } from "../utils/service-history";
import { formatarDataHora } from "../utils/date";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, spacing } from "../utils/theme";

export function ServiceHistoryScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const initial = route.params.conversation;
  const groupKey = serviceHistoryKey(initial);
  const [conversations, setConversations] = useState([initial]);
  const [error, setError] = useState("");
  async function load() {
    try {
      const result = await getServiceConversations(session.accessToken);
      setConversations((result.conversations ?? []).filter((item) => finishedServiceStatuses.has(item.status)
        && serviceHistoryKey(item) === groupKey));
      setError("");
    } catch (failure) { setError(failure.message || "Não foi possível atualizar o histórico."); }
  }
  useLiveRefresh({ accessToken: session?.accessToken, scopeKey: groupKey, intervalMs: 0,
    events: [realtimeEvents.serviceChatUpdated, realtimeEvents.serviceChatMessageCreated], onRefresh: load });
  return (
    <ScreenContainer scroll={false} edges={["left", "right"]} contentContainerStyle={styles.content}>
      <PageHeader title={initial.otherPerson?.name ?? "Atendimentos anteriores"} eyebrow="Histórico de serviços"
        subtitle="Abra um atendimento para consultar mensagens, pagamento ou chamar novamente." />
      {error ? <StatePanel danger actionLabel="Tentar novamente" onAction={load} text={error} /> : null}
      <FlatList
        data={[...conversations].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<StatePanel text="Nenhum atendimento encerrado neste histórico." />}
        renderItem={({ item }) => {
          const proposal = item.proposals?.at(-1);
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`Abrir atendimento ${item.id}`}
              onPress={() => navigation.navigate("ServiceConversation", { conversation: item })}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Ionicons color={colors.primaryDark} name="document-text-outline" size={22} />
              <View style={styles.copy}>
                <Text style={styles.title}>{item.serviceType?.name ?? "Serviço"} · #{item.id}</Text>
                <Text style={styles.meta}>{item.status === "ENCERRADA" ? "Finalizado" : "Cancelado"} · {formatarDataHora(item.updatedAt ?? item.createdAt)}</Text>
                {proposal?.amountCents != null ? <Text style={styles.amount}>{formatarDinheiro(proposal.amountCents)}</Text> : null}
              </View>
              {item.unreadCount > 0 ? <Text style={styles.unread}>{item.unreadCount}</Text> : null}
              <Ionicons color={colors.textMuted} name="chevron-forward" size={17} />
            </Pressable>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: spacing.lg },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg,
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14 },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  title: { color: colors.textPrimary, fontFamily: fonts.semiBold, fontSize: 14 },
  meta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 12 },
  amount: { color: colors.primaryDark, fontFamily: fonts.semiBold, fontSize: 14 },
  unread: { color: colors.primaryDark, fontFamily: fonts.bold },
  pressed: { backgroundColor: colors.primarySoft },
});
