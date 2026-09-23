import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { formatarDinheiro } from "../utils/money";
import {
  colors,
  fonts,
  radius,
  shadow,
  spacing,
  typography,
} from "../utils/theme";

function resetToTab(navigation, screen) {
  navigation.reset({
    index: 0,
    routes: [{ name: "Main", params: { screen } }],
  });
}

function resetToOrderChat(navigation, order, conversationId) {
  navigation.reset({
    index: 1,
    routes: [
      { name: "Main" },
      {
        name: "StoreConversation",
        params: {
          conversationId,
          openOrderId: order?.id,
          store: order?.store,
          storeId: order?.storeId ?? order?.store?.id,
        },
      },
    ],
  });
}

export function OnlineOrderSuccessScreen({ navigation, route }) {
  const order = route.params?.order ?? null;
  const conversationId = route.params?.conversationId ?? null;
  const store = order?.store ?? route.params?.store;
  const payment = order?.payment ?? route.params?.payment ?? {};

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.successCard}>
        <View style={styles.successIcon}>
          <Ionicons color={colors.primaryDark} name="checkmark" size={34} />
        </View>
        <Text style={styles.title}>Pedido enviado</Text>
        <Text style={styles.subtitle}>
          A loja ja recebeu esse pedido no painel de vendas.
        </Text>
      </LinearGradient>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{store?.name ?? "Loja"}</Text>
        <Text style={styles.orderCode}>{order?.code ?? "Pedido criado"}</Text>
        <View style={styles.divider} />
        <SummaryRow label="Total" value={formatarDinheiro(payment.totalCents ?? order?.totalCents ?? 0)} />
        <SummaryRow
          label="Saldo usado"
          value={formatarDinheiro(payment.balanceCents ?? payment.balanceUsedCents ?? 0)}
        />
        <SummaryRow
          label="Pix complementar"
          value={formatarDinheiro(payment.pixCents ?? payment.pixComplementCents ?? 0)}
        />
      </View>

      <View style={styles.timeline}>
        <TimelineStep active label="Pedido recebido" />
        <TimelineStep label="Loja preparando" />
        <TimelineStep label="Saiu para entrega/retirada" />
        <TimelineStep label="Concluido" last />
      </View>

      <View style={styles.actions}>
        <AppButton
          icon="chatbubbles-outline"
          onPress={() => resetToOrderChat(navigation, order, conversationId)}
          title="Voltar para o chat"
        />
        <AppButton
          onPress={() => resetToTab(navigation, "Buscar")}
          title="Ver lojas"
          variant="outline"
        />
      </View>
    </ScreenContainer>
  );
}

function SummaryRow({ label, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function TimelineStep({ active = false, label, last = false }) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineMarkerWrap}>
        <View style={[styles.timelineMarker, active && styles.timelineMarkerActive]}>
          {active ? <Ionicons color={colors.card} name="checkmark" size={13} /> : null}
        </View>
        {!last ? <View style={styles.timelineLine} /> : null}
      </View>
      <Text style={[styles.timelineLabel, active && styles.timelineLabelActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.md,
  },
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
  },
  orderCode: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    ...shadow,
  },
  panelTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  subtitle: {
    color: "rgba(255,255,255,0.84)",
    fontFamily: fonts.regular,
    fontSize: typography.body,
    lineHeight: 22,
    textAlign: "center",
  },
  successCard: {
    alignItems: "center",
    borderRadius: 26,
    gap: spacing.md,
    padding: spacing.xl,
    ...shadow,
  },
  successIcon: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 70,
    justifyContent: "center",
    width: 70,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  timeline: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadow,
  },
  timelineLabel: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    minHeight: 34,
  },
  timelineLabelActive: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontWeight: "800",
  },
  timelineLine: {
    backgroundColor: colors.border,
    flex: 1,
    width: 2,
  },
  timelineMarker: {
    alignItems: "center",
    backgroundColor: colors.border,
    borderRadius: radius.round,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  timelineMarkerActive: {
    backgroundColor: colors.primaryDark,
  },
  timelineMarkerWrap: {
    alignItems: "center",
    alignSelf: "stretch",
    width: 30,
  },
  timelineRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  title: {
    color: colors.card,
    fontFamily: fonts.extraBold,
    fontSize: typography.h1,
    fontWeight: "800",
    textAlign: "center",
  },
});
