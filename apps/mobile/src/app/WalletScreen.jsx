import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { IconButton } from "../components/IconButton";
import { MovementItem } from "../components/MovementItem";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { WalletMovementReceiptModal } from "../components/WalletMovementReceiptModal";
import { useWalletStore } from "../stores/useWalletStore";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

const walletVisuals = {
  cashback: {
    accent: "#0F9F6E",
    color: "#EAFBF4",
    icon: "bag-handle-outline",
    purpose: "Receba de volta uma parte das compras elegiveis.",
  },
  rede: {
    accent: "#2563EB",
    color: "#EEF5FF",
    icon: "git-network-outline",
    purpose: "Ganhos liberados pelos eventos qualificados da sua rede.",
  },
  saldo_pix: {
    accent: "#07805C",
    color: "#ECFDF5",
    icon: "qr-code-outline",
    purpose: "Saldo adicionado para pagar dentro da plataforma.",
  },
  vendas: {
    accent: "#D97706",
    color: "#FFF7ED",
    icon: "storefront-outline",
    purpose: "Recebimentos de vendas e indicacoes comerciais confirmadas.",
  },
};

const movementLabels = {
  AJUSTE_MANUAL: "Ajuste",
  BLOQUEIO: "Bloqueio",
  CREDITO: "Credito",
  DEBITO: "Debito",
  DESBLOQUEIO: "Desbloqueio",
  ESTORNO: "Estorno",
  EXPIRACAO: "Expiracao",
};

export function WalletScreen({ navigation }) {
  const wallet = useWalletStore();
  const [selectedMovement, setSelectedMovement] = useState(null);

  if (wallet.isLoading && wallet.wallets.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primaryDark} size="large" />
        <Text style={styles.loadingText}>Carregando suas carteiras...</Text>
      </View>
    );
  }

  if (wallet.error && wallet.wallets.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons color={colors.danger} name="cloud-offline-outline" size={34} />
        <Text style={styles.errorText}>{wallet.error}</Text>
        <AppButton onPress={wallet.refresh} title="Tentar novamente" />
      </View>
    );
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <PageHeader
        action={(
          <IconButton
            icon="refresh"
            label="Atualizar carteiras"
            loading={wallet.isLoading}
            onPress={wallet.refresh}
            tone="soft"
          />
        )}
        eyebrow="Central financeira"
        subtitle="Saldos e movimentacoes em um so lugar."
        title="Minhas carteiras"
      />

      <BalanceHero summary={wallet.summary} />

      <View style={styles.actions}>
        <Pressable
          onPress={() => navigation.navigate("WalletDeposit")}
          style={({ pressed }) => [styles.depositAction, pressed && styles.pressed]}
        >
          <View style={styles.depositIcon}>
            <Ionicons color={colors.card} name="add-outline" size={25} />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.depositTitle}>Adicionar saldo Pix</Text>
            <Text style={styles.depositText}>Gere um Pix para usar saldo nas compras do app.</Text>
          </View>
          <Ionicons color={colors.card} name="arrow-forward" size={21} />
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("ChargeScan")}
          style={({ pressed }) => [styles.payAction, pressed && styles.pressed]}
        >
          <View style={styles.payIcon}>
            <Ionicons color={colors.card} name="scan-outline" size={25} />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.payTitle}>Pagar via QR</Text>
            <Text style={styles.payText}>Leia uma cobranca Brasil Cashback e confirme o valor.</Text>
          </View>
          <Ionicons color={colors.card} name="arrow-forward" size={21} />
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("Withdrawal")}
          style={({ pressed }) => [styles.withdrawAction, pressed && styles.pressed]}
        >
          <View style={styles.withdrawIcon}>
            <Ionicons color={colors.primaryDark} name="arrow-up-outline" size={22} />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.withdrawTitle}>Sacar saldo</Text>
            <Text style={styles.withdrawText}>Envie saldos permitidos para sua chave Pix.</Text>
          </View>
          <Ionicons color={colors.primaryDark} name="chevron-forward" size={20} />
        </Pressable>

        <View style={styles.securityLine}>
          <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={18} />
          <Text style={styles.securityText}>O valor e o recebedor sao conferidos antes do pagamento.</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIcon}>
            <Ionicons color={colors.primaryDark} name="layers-outline" size={19} />
          </View>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Composicao do saldo</Text>
            <Text style={styles.sectionSubtitle}>Cada origem fica separada e rastreavel.</Text>
          </View>
          <Text style={styles.sectionCount}>{wallet.wallets.length}</Text>
        </View>

        <View style={styles.walletGrid}>
          {wallet.wallets.map((item) => (
            <WalletCard item={item} key={item.id} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIcon}>
            <Ionicons color={colors.primaryDark} name="receipt-outline" size={19} />
          </View>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Extrato e pagamentos</Text>
            <Text style={styles.sectionSubtitle}>Toque em uma movimentacao para abrir o comprovante.</Text>
          </View>
          <View style={styles.movementCount}>
            <Text style={styles.movementCountText}>{wallet.movements.length}</Text>
          </View>
        </View>

        <View style={styles.extractCard}>
          {wallet.movements.length > 0 ? (
            wallet.movements.map((item) => {
              const isPayment = item.tipo === "DEBITO" && item.origem === "PAGAMENTO";
              const isWalletDeposit = item.tipo === "CREDITO" && item.origem === "DEPOSITO_PIX";
              const isQrPayment = isPayment && Boolean(item.payment?.charge);
              const isOrderPayment = isPayment && Boolean(item.payment?.orderCode);
              const recipient = item.payment?.recipient?.name;

              return (
                <MovementItem
                  item={{
                    ...item,
                    data: new Date(item.data).toLocaleString("pt-BR", {
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "2-digit",
                    }),
                    displayTitle: isQrPayment
                      ? "Pagamento via QR"
                      : isOrderPayment
                        ? "Pagamento de pedido"
                        : isPayment
                          ? "Pagamento"
                        : isWalletDeposit
                          ? "Deposito via Pix"
                      : `${movementLabels[item.tipo] ?? item.tipo} - ${item.walletName}`,
                    summary: isPayment && recipient ? `Para ${recipient}` : item.descricao,
                  }}
                  key={item.id}
                  onPress={() => setSelectedMovement(item)}
                />
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons color={colors.primaryDark} name="receipt-outline" size={23} />
              </View>
              <View style={styles.emptyCopy}>
                <Text style={styles.emptyTitle}>Nenhuma movimentacao ainda</Text>
                <Text style={styles.emptyText}>Seus lancamentos reais aparecerao aqui.</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      <WalletMovementReceiptModal
        movement={selectedMovement}
        onClose={() => setSelectedMovement(null)}
      />
    </ScreenContainer>
  );
}

function BalanceHero({ summary }) {
  return (
    <View style={styles.balanceHero}>
      <View style={styles.balanceTopline}>
        <View>
          <Text style={styles.balanceLabel}>Saldo total disponivel</Text>
          <Text style={styles.balanceValue}>{formatarDinheiro(summary.availableCents)}</Text>
        </View>
        <View style={styles.balanceIcon}>
          <Ionicons color={colors.card} name="wallet-outline" size={23} />
        </View>
      </View>
      <View style={styles.balanceDivider} />
      <View style={styles.balanceFacts}>
        <BalanceFact icon="time-outline" label="Pendente" value={summary.pendingCents} />
        <View style={styles.factDivider} />
        <BalanceFact icon="lock-closed-outline" label="Bloqueado" value={summary.blockedCents} />
      </View>
    </View>
  );
}

function BalanceFact({ icon, label, value }) {
  return (
    <View style={styles.balanceFact}>
      <Ionicons color="#BBF7D0" name={icon} size={17} />
      <View style={styles.factCopy}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{formatarDinheiro(value)}</Text>
      </View>
    </View>
  );
}

function WalletCard({ item }) {
  const visual = walletVisuals[item.code] ?? walletVisuals.saldo_pix;
  const pendingCents = Number(item.pendingCents ?? 0);
  const blockedCents = Number(item.blockedCents ?? 0);

  return (
    <View style={[styles.walletCard, { backgroundColor: visual.color }]}>
      <View style={styles.walletCardHeader}>
        <View style={styles.walletIdentity}>
          <View style={styles.walletIcon}>
            <Ionicons color={visual.accent} name={visual.icon} size={21} />
          </View>
          <View style={styles.walletNameCopy}>
            <Text numberOfLines={1} style={styles.walletName}>{item.name}</Text>
            <Text style={styles.walletStatus}>{item.status === "ATIVA" ? "Carteira ativa" : item.status}</Text>
          </View>
        </View>
        <View style={styles.walletStatusPill}>
          <View style={[styles.activeDot, { backgroundColor: visual.accent }]} />
          <Text style={[styles.walletStatusPillText, { color: visual.accent }]}>Disponivel</Text>
        </View>
      </View>

      <Text style={styles.walletPurpose}>{visual.purpose ?? item.description}</Text>

      <View style={styles.walletBalanceRow}>
        <View style={styles.walletBalanceCopy}>
          <Text style={styles.walletBalanceLabel}>Saldo para usar agora</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.walletValue}>
            {formatarDinheiro(item.availableCents)}
          </Text>
        </View>
        <Ionicons color={visual.accent} name="checkmark-circle-outline" size={22} />
      </View>

      <View style={styles.walletFacts}>
        <WalletCardFact
          icon="time-outline"
          label="Pendente"
          value={pendingCents}
          visual={visual}
        />
        <View style={styles.walletFactDivider} />
        <WalletCardFact
          icon="lock-closed-outline"
          label="Bloqueado"
          value={blockedCents}
          visual={visual}
        />
      </View>

      <View style={styles.walletPermissions}>
        <WalletPermission
          allowed={item.canUseForPurchase}
          icon="cart-outline"
          label="Usar em compras"
          visual={visual}
        />
        <WalletPermission
          allowed={item.canWithdraw}
          icon="arrow-up-circle-outline"
          label={item.canWithdraw ? "Saque permitido" : "Uso dentro do app"}
          visual={visual}
        />
      </View>
    </View>
  );
}

function WalletCardFact({ icon, label, value, visual }) {
  return (
    <View style={styles.walletFact}>
      <Ionicons color={visual.accent} name={icon} size={16} />
      <View style={styles.walletFactCopy}>
        <Text style={styles.walletFactLabel}>{label}</Text>
        <Text style={styles.walletFactValue}>{formatarDinheiro(value)}</Text>
      </View>
    </View>
  );
}

function WalletPermission({ allowed, icon, label, visual }) {
  return (
    <View style={styles.walletPermission}>
      <Ionicons
        color={allowed ? visual.accent : colors.textMuted}
        name={allowed ? icon : "lock-closed-outline"}
        size={14}
      />
      <Text style={[styles.walletPermissionText, allowed && { color: visual.accent }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionCopy: { flex: 1, gap: 3, minWidth: 0 },
  actions: { gap: spacing.sm },
  activeDot: { borderRadius: radius.round, height: 8, width: 8 },
  balanceDivider: { backgroundColor: "rgba(255,255,255,0.18)", height: 1, marginVertical: spacing.lg },
  balanceFact: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm, minWidth: 0 },
  balanceFacts: { alignItems: "center", flexDirection: "row" },
  balanceHero: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, minHeight: 176, padding: spacing.lg },
  balanceIcon: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.14)", borderColor: "rgba(255,255,255,0.2)", borderRadius: radius.round, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  balanceLabel: { color: "#BBF7D0", fontFamily: fonts.medium, fontSize: typography.small },
  balanceTopline: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  balanceValue: { color: colors.card, fontFamily: fonts.extraBold, fontSize: 32, fontWeight: "800", marginTop: spacing.sm },
  centered: { alignItems: "center", backgroundColor: colors.background, flex: 1, gap: spacing.lg, justifyContent: "center", padding: spacing.xl },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  depositAction: { alignItems: "center", backgroundColor: colors.success, borderRadius: radius.lg, flexDirection: "row", gap: spacing.md, minHeight: 76, padding: spacing.lg },
  depositIcon: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.16)", borderRadius: radius.round, height: 46, justifyContent: "center", width: 46 },
  depositText: { color: "#D9FBE6", fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  depositTitle: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  emptyCopy: { flex: 1, gap: 3, minWidth: 0 },
  emptyIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  emptyState: { alignItems: "center", flexDirection: "row", gap: spacing.md, padding: spacing.lg },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  errorText: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.small, textAlign: "center" },
  extractCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.lg },
  factCopy: { flex: 1, gap: 2, minWidth: 0 },
  factDivider: { backgroundColor: "rgba(255,255,255,0.18)", height: 34, marginHorizontal: spacing.md, width: 1 },
  factLabel: { color: "#BBF7D0", fontFamily: fonts.medium, fontSize: typography.caption },
  factValue: { color: colors.card, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  loadingText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.small },
  movementCount: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 28, justifyContent: "center", minWidth: 28, paddingHorizontal: spacing.sm },
  movementCountText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.caption, fontWeight: "800" },
  payAction: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.lg, flexDirection: "row", gap: spacing.md, minHeight: 76, padding: spacing.lg },
  payIcon: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: radius.round, height: 46, justifyContent: "center", width: 46 },
  payText: { color: "#CDEFE2", fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  payTitle: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  pressed: { opacity: 0.78 },
  section: { gap: spacing.md },
  sectionCopy: { flex: 1, gap: 2, minWidth: 0 },
  sectionCount: { color: colors.textMuted, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  sectionHeading: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  sectionIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  sectionSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  sectionTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  securityLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.sm },
  securityText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  walletCard: { borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, minHeight: 230, padding: spacing.lg, width: "100%" },
  walletBalanceCopy: { flex: 1, gap: 3, minWidth: 0 },
  walletBalanceLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  walletBalanceRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  walletCardHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  walletFact: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm },
  walletFactCopy: { flex: 1, gap: 2, minWidth: 0 },
  walletFactDivider: { backgroundColor: colors.border, height: 34, width: 1 },
  walletFactLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10 },
  walletFactValue: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  walletFacts: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.md, paddingTop: spacing.md },
  walletGrid: { gap: spacing.md },
  walletIcon: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  walletIdentity: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm, minWidth: 0 },
  walletName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
  walletNameCopy: { flex: 1, gap: 2, minWidth: 0 },
  walletPermission: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.72)", borderRadius: radius.round, flexDirection: "row", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  walletPermissionText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  walletPermissions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  walletPurpose: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  walletStatus: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10 },
  walletStatusPill: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.74)", borderRadius: radius.round, flexDirection: "row", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  walletStatusPillText: { fontFamily: fonts.bold, fontSize: 9, fontWeight: "700" },
  walletValue: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: 26, fontWeight: "800", minHeight: 31 },
  withdrawAction: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 72, padding: spacing.lg },
  withdrawIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  withdrawText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  withdrawTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
});
