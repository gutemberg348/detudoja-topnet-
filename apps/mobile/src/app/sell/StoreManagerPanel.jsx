import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Image, Pressable, Switch, Text, View } from "react-native";
import { BackHeader } from "../../components/BackHeader";
import {
  activeOrderStatuses,
  crmPeriodOptions,
  historyOrderStatuses,
  newOrderStatuses,
  statusCopy,
} from "./seller.constants";
import { StoreOrderChatModal } from "./StoreOrderChatModal";
import { StoreReferralModal } from "./StoreReferralModal";
import { StoreSalesPanel } from "./StoreSalesPanel";
import { sellerStyles as styles } from "./seller.styles";
import {
  compactOrderCode as compactOrderCodeValue,
  countActiveOrdersInPeriod as countActiveOrdersInPeriodValue,
  countNewStoreOrders as countNewStoreOrdersValue,
  formatEstimatedTime as formatEstimatedTimeValue,
  formatOrderStatus as formatOrderStatusValue,
  formatStatus as formatStatusValue,
  isOrderInPeriod as isOrderInPeriodValue,
} from "./seller.utils";
import { normalizeStoreOpeningHours, todayWeekDay } from "./storeSchedule";
import { resolveMediaUrl } from "../../utils/media";
import { formatarDinheiro } from "../../utils/money";
import { colors } from "../../utils/theme";

function countNewStoreOrders(store) {
  return countNewStoreOrdersValue(store, newOrderStatuses);
}

function formatStatus(value = "") {
  return formatStatusValue(value);
}

function formatOrderStatus(value = "") {
  return formatOrderStatusValue(value);
}

function formatEstimatedTime(minutes) {
  return formatEstimatedTimeValue(minutes);
}

export function StoreManagerPanel({
  accessToken,
  chatUnreadCount,
  error,
  isSaving,
  onBack,
  onCallCourier,
  onCreateCharge,
  onDeleteProduct,
  onDeleteStore,
  onEditMedia,
  onEditProduct,
  onEditStore,
  onManageCouriers,
  onManageTeam,
  onNewProduct,
  onOpenCharge,
  onOpenPermanentQr,
  onOpenStoreChats,
  onRefresh,
  onToggleAvailability,
  onUpdateOrderStatus,
  store,
}) {
  const [activeTab, setActiveTab] = useState("orders");
  const [mediaErrors, setMediaErrors] = useState({ banner: false, logo: false });
  const [referralOpen, setReferralOpen] = useState(false);
  const access = store?.access;
  const isOwner = access?.isOwner !== false;
  const canCreateCharges = isOwner || access?.permissions?.createCharges === true;
  const canManageOrders = isOwner || access?.permissions?.manageOrders === true;
  const canUseStoreChats = isOwner || access?.permissions?.storeChats === true;

  useEffect(() => {
    if (store?.id) {
      setActiveTab(canManageOrders ? "orders" : canCreateCharges ? "sales" : "access");
      setMediaErrors({ banner: false, logo: false });
    }
  }, [canCreateCharges, canManageOrders, store?.id]);

  if (!store) {
    return null;
  }

  const bannerUrl = resolveMediaUrl(store.bannerUrl);
  const logoUrl = resolveMediaUrl(store.logoUrl);
  const merchant = store.merchant ?? {};
  const products = store.products ?? [];
  const orders = store.orders ?? [];
  const activeOrdersCount = orders.filter((order) => activeOrderStatuses.has(order.status)).length;
  const newOrdersCount = countNewStoreOrders({ orders });
  const storeIsActive = store.status === "ATIVA";
  const merchantStatus = merchant.status
    ? statusCopy[merchant.status] ?? formatStatus(merchant.status)
    : "Ativo";
  const openingHours = normalizeStoreOpeningHours(store.openingHours);
  const todayHours = openingHours.find((item) => item.day === todayWeekDay());

  return (
    <View style={styles.storeWorkspace}>
      <View style={styles.workspaceTopbar}>
        <BackHeader onPress={onBack} title="Voltar" />
        <View style={styles.workspaceTopbarActions}>
          {canUseStoreChats ? (
            <Pressable
              accessibilityLabel={`Abrir conversas de ${store.name}`}
              onPress={onOpenStoreChats}
              style={({ pressed }) => [
                styles.workspaceChatButton,
                chatUnreadCount > 0 && styles.workspaceChatButtonUnread,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                color={chatUnreadCount > 0 ? "#92400E" : colors.primaryDark}
                name="chatbubbles-outline"
                size={20}
              />
              {chatUnreadCount > 0 ? (
                <View style={styles.workspaceChatBadge}>
                  <Text style={styles.workspaceChatBadgeText}>
                    {chatUnreadCount > 9 ? "9+" : chatUnreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          <View style={[styles.workspaceStatusPill, !storeIsActive && styles.workspaceStatusPillInactive]}>
            <View style={[styles.workspaceStatusDot, !storeIsActive && styles.workspaceStatusDotInactive]} />
            <Text style={[styles.workspaceStatusText, !storeIsActive && styles.workspaceStatusTextInactive]}>
              {storeIsActive ? "Ativa" : "Desativada"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.storeManagerHero}>
        <View style={styles.storeBanner}>
          {bannerUrl && !mediaErrors.banner ? (
            <Image
              onError={() => setMediaErrors((current) => ({ ...current, banner: true }))}
              resizeMode="cover"
              source={{ uri: bannerUrl }}
              style={styles.storeBannerImage}
            />
          ) : (
            <LinearGradient
              colors={["#DCFCE7", "#F8FAFC"]}
              style={styles.storeBannerFallback}
            >
              <Ionicons color={colors.primaryDark} name="images-outline" size={26} />
            </LinearGradient>
          )}
        </View>
        <View style={styles.storeManagerInfo}>
          <View style={styles.storeLogo}>
            {logoUrl && !mediaErrors.logo ? (
              <Image
                onError={() => setMediaErrors((current) => ({ ...current, logo: true }))}
                resizeMode="contain"
                source={{ uri: logoUrl }}
                style={styles.storeLogoImage}
              />
            ) : (
              <Ionicons color={colors.primaryDark} name="storefront-outline" size={26} />
            )}
          </View>
          <View style={styles.storeManagerCopy}>
            <Text numberOfLines={1} style={styles.storeManagerName}>
              {store.name}
            </Text>
            <Text numberOfLines={2} style={styles.storeManagerMeta}>
              {store.category?.name ?? "Sem categoria"} · painel comercial
            </Text>
          </View>
        </View>
        <View style={styles.storeManagerBadges}>
          <View style={styles.managerBadge}>
            <Text style={styles.managerBadgeText}>
              {store.visibleInApp ? "Visivel na busca" : "Oculta na busca"}
            </Text>
          </View>
          <View style={styles.managerBadge}>
            <Text style={styles.managerBadgeText}>
              Lojista {merchantStatus}
            </Text>
          </View>
          <View style={styles.managerBadge}>
            <Text style={styles.managerBadgeText}>
              Entrega {formatarDinheiro(store.deliveryFeeCents ?? 0)}
            </Text>
          </View>
        </View>
      </View>

      {isOwner ? <><View
        style={[
          styles.availabilityCard,
          store.openForOrders === false && styles.availabilityCardClosed,
        ]}
      >
        <View
          style={[
            styles.availabilityIcon,
            store.openForOrders === false && styles.availabilityIconClosed,
          ]}
        >
          <Ionicons
            color={store.openForOrders === false ? colors.warning : colors.primaryDark}
            name={store.openForOrders === false ? "pause-outline" : "radio-outline"}
            size={22}
          />
        </View>
        <View style={styles.availabilityCopy}>
          <Text style={styles.availabilityTitle}>
            {store.openForOrders === false ? "Loja fechada" : "Loja recebendo pedidos"}
          </Text>
          <Text style={styles.availabilityText}>
            {todayHours?.enabled
              ? `Hoje: ${todayHours.opensAt} ate ${todayHours.closesAt}`
              : "Hoje nao ha atendimento programado"}
          </Text>
        </View>
        <Switch
          accessibilityLabel="Receber novos pedidos"
          disabled={isSaving}
          ios_backgroundColor={colors.border}
          onValueChange={() => onToggleAvailability(store)}
          thumbColor={colors.card}
          trackColor={{ false: colors.border, true: colors.primary }}
          value={store.openForOrders !== false}
        />
      </View>

      <Pressable
        onPress={() => onEditStore(store)}
        style={({ pressed }) => [styles.scheduleSummary, pressed && styles.pressed]}
      >
        <View style={styles.scheduleSummaryIcon}>
          <Ionicons color={colors.primaryDark} name="time-outline" size={20} />
        </View>
        <View style={styles.scheduleSummaryCopy}>
          <Text style={styles.scheduleSummaryTitle}>Horario de funcionamento</Text>
          <Text style={styles.scheduleSummaryText}>
            {openingHours.filter((item) => item.enabled).length} dias configurados
          </Text>
        </View>
        <Text style={styles.scheduleSummaryAction}>Editar</Text>
        <Ionicons color={colors.primaryDark} name="chevron-forward" size={17} />
      </Pressable></> : null}

      <View style={styles.managerMetrics}>
        <ManagerMetric
          danger={newOrdersCount > 0}
          icon="notifications-outline"
          label="Acao agora"
          value={String(newOrdersCount)}
        />
        <ManagerMetric
          icon="pulse-outline"
          label="Em andamento"
          value={String(activeOrdersCount)}
        />
        <ManagerMetric
          icon="cube-outline"
          label="Produtos"
          value={String(products.length)}
        />
        <ManagerMetric
          icon="qr-code-outline"
          label="Vendas QR"
          value={String(store.chargesCount ?? 0)}
        />
      </View>

      <View style={styles.managerActionGrid}>
        {canCreateCharges ? <ManagerAction
          icon="print-outline"
          label="QR permanente"
          onPress={() => onOpenPermanentQr?.(store)}
        /> : null}
        {canCreateCharges ? <ManagerAction
          icon="qr-code-outline"
          label="Nova cobranca"
          onPress={() => onCreateCharge(store)}
        /> : null}
        {isOwner ? <ManagerAction
          icon="create-outline"
          label="Editar dados"
          onPress={() => onEditStore(store)}
        /> : null}
        {isOwner ? <ManagerAction
          icon="images-outline"
          label="Identidade visual"
          onPress={() => onEditMedia(store)}
        /> : null}
        {isOwner ? <ManagerAction
          icon="add-circle-outline"
          label="Novo produto"
          onPress={() => onNewProduct(store)}
        /> : null}
        {isOwner ? <ManagerAction
          icon="share-social-outline"
          label="Indicar loja"
          onPress={() => setReferralOpen(true)}
        /> : null}
        {isOwner ? <ManagerAction
          icon="people-circle-outline"
          label="Funcionarios"
          onPress={onManageTeam}
        /> : null}
      </View>

      {isOwner ? <View style={styles.courierHub}>
        <View style={styles.courierHubHeader}>
          <View style={styles.courierActionIcon}>
            <Ionicons color={colors.card} name="bicycle-outline" size={22} />
          </View>
          <View style={styles.courierActionCopy}>
            <Text style={styles.courierActionEyebrow}>ENTREGAS DA LOJA</Text>
            <Text style={styles.courierActionTitle}>Motoboys sob demanda</Text>
            <Text style={styles.courierActionText}>Chame sua equipe ou encontre profissionais online.</Text>
          </View>
        </View>
        <View style={styles.courierHubActions}>
          <Pressable
            accessibilityLabel={`Chamar motoboy para ${store.name}`}
            onPress={onCallCourier}
            style={({ pressed }) => [styles.courierPrimaryAction, pressed && styles.pressed]}
          >
            <Ionicons color={colors.card} name="navigate-outline" size={17} />
            <Text style={styles.courierPrimaryActionText}>Chamar entregador</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Gerenciar equipe de motoboys de ${store.name}`}
            onPress={onManageCouriers}
            style={({ pressed }) => [styles.courierSecondaryAction, pressed && styles.pressed]}
          >
            <Ionicons color={colors.primaryDark} name="people-outline" size={17} />
            <Text style={styles.courierSecondaryActionText}>Equipe</Text>
          </Pressable>
        </View>
      </View> : null}

      {error ? <Text style={styles.modalError}>{error}</Text> : null}

      <View style={styles.storeManagerTabs}>
        {canManageOrders ? <StoreManagerTab
          active={activeTab === "orders"}
          badge={activeOrdersCount}
          icon="receipt-outline"
          label="CRM"
          onPress={() => setActiveTab("orders")}
        /> : null}
        {isOwner ? <StoreManagerTab
          active={activeTab === "products"}
          badge={products.length}
          icon="cube-outline"
          label="Produtos"
          onPress={() => setActiveTab("products")}
        /> : null}
        {canCreateCharges ? <StoreManagerTab
          active={activeTab === "sales"}
          badge={store.chargesCount ?? 0}
          icon="bar-chart-outline"
          label="Financeiro"
          onPress={() => setActiveTab("sales")}
        /> : null}
      </View>

      {activeTab === "orders" && canManageOrders ? (
        <StoreCrmPanel
          accessToken={accessToken}
          isSaving={isSaving}
          onRefresh={onRefresh}
          onUpdateStatus={(order, status) => onUpdateOrderStatus(store, order, status)}
          orders={orders}
          store={store}
        />
      ) : activeTab === "products" && isOwner ? (
        <StoreProductsPanel
          isSaving={isSaving}
          onDeleteProduct={onDeleteProduct}
          onDeleteStore={onDeleteStore}
          onEditProduct={onEditProduct}
          onNewProduct={onNewProduct}
          products={products}
          store={store}
        />
      ) : activeTab === "sales" && canCreateCharges ? (
        <StoreSalesPanel
          accessToken={accessToken}
          onOpenCharge={onOpenCharge}
          store={store}
        />
      ) : null}

      {isOwner ? <StoreReferralModal
        accessToken={accessToken}
        onClose={() => setReferralOpen(false)}
        open={referralOpen}
        store={store}
      /> : null}
    </View>
  );
}

function ManagerMetric({
  danger = false,
  highlight = false,
  icon,
  label,
  value,
}) {
  return (
    <View
      style={[
        styles.managerMetric,
        highlight && styles.managerMetricHighlight,
        danger && styles.managerMetricDanger,
      ]}
    >
      <Ionicons color={danger ? colors.danger : colors.primaryDark} name={icon} size={17} />
      <Text style={[styles.managerMetricValue, danger && styles.managerMetricValueDanger]}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.managerMetricLabel}>{label}</Text>
    </View>
  );
}

function StoreManagerTab({ active, badge, icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.storeManagerTab,
        active && styles.storeManagerTabActive,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        color={active ? colors.card : colors.primaryDark}
        name={icon}
        size={18}
      />
      <Text style={[styles.storeManagerTabText, active && styles.storeManagerTabTextActive]}>
        {label}
      </Text>
      <View style={[styles.storeManagerTabBadge, active && styles.storeManagerTabBadgeActive]}>
        <Text
          style={[
            styles.storeManagerTabBadgeText,
            active && styles.storeManagerTabBadgeTextActive,
          ]}
        >
          {badge}
        </Text>
      </View>
    </Pressable>
  );
}

function StoreProductsPanel({
  isSaving,
  onDeleteProduct,
  onDeleteStore,
  onEditProduct,
  onNewProduct,
  products,
  store,
}) {
  const featuredProducts = products.filter((product) => product.featured).length;
  const lowStockProducts = products.filter((product) => (
    product.stockControlled && Number(product.stockQuantity ?? 0) <= 5
  )).length;

  return (
    <View style={styles.storeTabPanel}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Produtos da loja</Text>
          <Text style={styles.storeTabSubtitle}>
            Catalogo, preco, estoque e imagens ficam separados dos pedidos.
          </Text>
        </View>
        <Pressable onPress={() => onNewProduct(store)} style={styles.refreshButton}>
          <Ionicons color={colors.primaryDark} name="add" size={18} />
        </Pressable>
      </View>

      <View style={styles.catalogMetrics}>
        <CatalogMetric icon="cube-outline" label="No catalogo" value={products.length} />
        <CatalogMetric icon="star-outline" label="Destaques" value={featuredProducts} />
        <CatalogMetric
          alert={lowStockProducts > 0}
          icon="alert-circle-outline"
          label="Estoque baixo"
          value={lowStockProducts}
        />
      </View>

      <View style={styles.salesList}>
        {products.length ? (
          products.map((product) => (
            <StoreProductRow
              key={product.id}
              isSaving={isSaving}
              onDelete={() => onDeleteProduct(store, product)}
              onEdit={() => onEditProduct(store, product)}
              product={product}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons color={colors.textMuted} name="cube-outline" size={24} />
            <Text style={styles.emptyTitle}>Nenhum produto cadastrado</Text>
            <Text style={styles.emptyText}>
              Adicione produtos para montar a vitrine dessa loja.
            </Text>
          </View>
        )}
      </View>

      <Pressable
        disabled={isSaving}
        onPress={() => onDeleteStore(store)}
        style={({ pressed }) => [
          styles.deleteStoreButton,
          pressed && styles.pressed,
          isSaving && styles.disabledAction,
        ]}
      >
        <Ionicons color={colors.danger} name="trash-outline" size={18} />
        <Text style={styles.deleteStoreText}>Excluir loja</Text>
      </Pressable>
    </View>
  );
}

function CatalogMetric({ alert = false, icon, label, value }) {
  return (
    <View style={[styles.catalogMetric, alert && styles.catalogMetricAlert]}>
      <Ionicons color={alert ? colors.warning : colors.primaryDark} name={icon} size={17} />
      <Text style={styles.catalogMetricValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.catalogMetricLabel}>{label}</Text>
    </View>
  );
}

function ManagerAction({ icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.managerAction, pressed && styles.pressed]}
    >
      <View style={styles.managerActionIcon}>
        <Ionicons color={colors.primaryDark} name={icon} size={20} />
      </View>
      <Text style={styles.managerActionText}>{label}</Text>
    </Pressable>
  );
}

function StoreCrmPanel({ accessToken, isSaving, onRefresh, onUpdateStatus, orders, store }) {
  const [chatOrder, setChatOrder] = useState(null);
  const [period, setPeriod] = useState("today");
  const [stageFilter, setStageFilter] = useState("all");
  const [view, setView] = useState("active");
  const allActiveOrders = orders.filter((order) => activeOrderStatuses.has(order.status));
  const filteredOrders = orders.filter((order) => isOrderInPeriod(order, period));
  const activeOrders = filteredOrders.filter((order) => activeOrderStatuses.has(order.status));
  const historyOrders = filteredOrders.filter((order) => historyOrderStatuses.has(order.status));
  const baseVisibleOrders = view === "history" ? historyOrders : activeOrders;
  const hasActiveOutsideCurrentPeriod = view === "active" && allActiveOrders.length > activeOrders.length;
  const actionNowCount = countNewStoreOrders({ orders });
  const activeOrdersValue = activeOrders.reduce(
    (total, order) => total + Number(order.totalCents ?? 0),
    0,
  );
  const activeStages = [
    { icon: "chatbubbles-outline", key: "attention", label: "Negociar", statuses: ["NEGOCIANDO", "RECEBIDO"] },
    { icon: "wallet-outline", key: "payment", label: "Pagamento", statuses: ["AGUARDANDO_PAGAMENTO"] },
    { icon: "restaurant-outline", key: "production", label: "Producao", statuses: ["ACEITO", "PREPARANDO"] },
    { icon: "bicycle-outline", key: "delivery", label: "Entrega", statuses: ["SAIU_ENTREGA", "PRONTO_RETIRADA"] },
  ];
  const historyStages = [
    { icon: "checkmark-circle-outline", key: "completed", label: "Concluidos", statuses: ["CONCLUIDO"] },
    { icon: "close-circle-outline", key: "canceled", label: "Cancelados", statuses: ["CANCELADO"] },
  ];
  const stages = view === "history" ? historyStages : activeStages;
  const selectedStage = stages.find((stage) => stage.key === stageFilter);
  const visibleOrders = selectedStage
    ? baseVisibleOrders.filter((order) => (
        selectedStage.key === "attention"
          ? countNewStoreOrders({ orders: [order] }) > 0
          : selectedStage.statuses.includes(order.status)
      ))
    : baseVisibleOrders;

  function changeView(nextView) {
    setView(nextView);
    setStageFilter("all");
  }

  return (
    <View style={styles.crmPanel}>
      <View style={styles.sectionHeader}>
        <View style={styles.crmHeaderCopy}>
          <Text style={styles.sectionTitle}>Pedidos recebidos</Text>
          <Text style={styles.crmSubtitle}>
            Atenda os pedidos ativos e consulte finalizados no historico.
          </Text>
        </View>
        {allActiveOrders.length > 0 ? (
          <View style={styles.ordersBadge}>
            <Text style={styles.ordersBadgeText}>{allActiveOrders.length}</Text>
          </View>
        ) : null}
      </View>

      {actionNowCount > 0 && view === "active" ? (
        <Pressable
          onPress={() => {
            setPeriod("all");
            setStageFilter("attention");
          }}
          style={({ pressed }) => [styles.crmPriority, pressed && styles.pressed]}
        >
          <View style={styles.crmPriorityIcon}>
            <Ionicons color={colors.card} name="notifications" size={18} />
          </View>
          <View style={styles.crmPriorityCopy}>
            <Text style={styles.crmPriorityTitle}>
              {actionNowCount} {actionNowCount === 1 ? "pedido precisa" : "pedidos precisam"} de voce
            </Text>
            <Text style={styles.crmPriorityText}>Toque para ver somente o que pede acao agora.</Text>
          </View>
          <Ionicons color={colors.card} name="arrow-forward" size={18} />
        </Pressable>
      ) : null}

      <View style={styles.crmFilters}>
        {crmPeriodOptions.map((option) => {
          const periodActiveCount = countActiveOrdersInPeriod(orders, option.value);
          const selected = period === option.value;

          return (
            <Pressable
              key={option.value}
              onPress={() => setPeriod(option.value)}
              style={({ pressed }) => [
                styles.crmFilterButton,
                selected && styles.crmFilterButtonActive,
                periodActiveCount > 0 && !selected && styles.crmFilterButtonWithBadge,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[
                styles.crmFilterText,
                selected && styles.crmFilterTextActive,
              ]}>
                {option.label}
              </Text>
              {periodActiveCount > 0 ? (
                <View style={[
                  styles.crmFilterBadge,
                  selected && styles.crmFilterBadgeActive,
                ]}>
                  <Text style={[
                    styles.crmFilterBadgeText,
                    selected && styles.crmFilterBadgeTextActive,
                  ]}>
                    {periodActiveCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.crmOverview}>
        <View style={styles.crmOverviewCopy}>
          <Text style={styles.crmOverviewLabel}>Volume ativo no periodo</Text>
          <Text style={styles.crmOverviewValue}>{formatarDinheiro(activeOrdersValue)}</Text>
        </View>
        <View style={styles.crmOverviewAside}>
          <Text style={styles.crmOverviewAsideValue}>{activeOrders.length}</Text>
          <Text style={styles.crmOverviewAsideLabel}>em andamento</Text>
        </View>
      </View>

      <View style={styles.crmPipeline}>
        {stages.map((stage) => (
          <Pressable
            key={stage.key}
            onPress={() => setStageFilter((current) => current === stage.key ? "all" : stage.key)}
            style={({ pressed }) => [
              styles.crmStage,
              stageFilter === stage.key && styles.crmStageActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={stageFilter === stage.key ? colors.card : colors.primaryDark}
              name={stage.icon}
              size={17}
            />
            <Text style={[styles.crmStageValue, stageFilter === stage.key && styles.crmStageValueActive]}>
              {baseVisibleOrders.filter((order) => (
                stage.key === "attention"
                  ? countNewStoreOrders({ orders: [order] }) > 0
                  : stage.statuses.includes(order.status)
              )).length}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.crmStageLabel,
                stageFilter === stage.key && styles.crmStageLabelActive,
              ]}
            >
              {stage.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.crmViewTabs}>
        <CrmViewTab
          active={view === "active"}
          count={activeOrders.length}
          icon="flash-outline"
          label="Ativos"
          onPress={() => changeView("active")}
        />
        <CrmViewTab
          active={view === "history"}
          count={historyOrders.length}
          icon="archive-outline"
          label="Historico"
          onPress={() => changeView("history")}
        />
      </View>

      {visibleOrders.length ? (
        <View style={styles.orderList}>
          {visibleOrders.map((order) => (
            <StoreOrderRow
              history={view === "history"}
              isSaving={isSaving}
              key={order.id}
              onOpenChat={setChatOrder}
              onUpdateStatus={onUpdateStatus}
              order={order}
            />
          ))}
        </View>
      ) : (
        <View style={styles.crmEmpty}>
          <View style={styles.crmEmptyIcon}>
            <Ionicons color={colors.primaryDark} name="receipt-outline" size={22} />
          </View>
          <View style={styles.crmEmptyCopy}>
            <Text style={styles.emptyTitle}>
              {selectedStage
                ? `Nenhum pedido em ${selectedStage.label.toLowerCase()}`
                : hasActiveOutsideCurrentPeriod
                  ? "Pedido em outro periodo"
                  : "Nenhum pedido por aqui"}
            </Text>
            <Text style={styles.emptyText}>
              {selectedStage
                ? "Toque novamente no filtro para voltar a ver todas as etapas."
                : hasActiveOutsideCurrentPeriod
                ? "Tem pedido ativo em outro periodo. Veja a bolinha em 7 dias ou Todos para achar rapido."
                : "Novas solicitacoes aparecem aqui em tempo real para negociar e atender."}
            </Text>
          </View>
        </View>
      )}

      <StoreOrderChatModal
        accessToken={accessToken}
        onClose={() => setChatOrder(null)}
        onMessagesRead={onRefresh}
        open={Boolean(chatOrder)}
        order={chatOrder}
        store={store}
      />
    </View>
  );
}

function CrmViewTab({ active, count, icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.crmViewTab,
        active && styles.crmViewTabActive,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={active ? colors.primaryDark : colors.textSecondary} name={icon} size={17} />
      <Text style={[styles.crmViewTabText, active && styles.crmViewTabTextActive]}>
        {label}
      </Text>
      <View style={[styles.crmViewCount, active && styles.crmViewCountActive]}>
        <Text style={[styles.crmViewCountText, active && styles.crmViewCountTextActive]}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function StoreOrderRow({ history = false, isSaving, onOpenChat, onUpdateStatus, order }) {
  const actions = history ? historyOrderActions(order) : orderActions(order);
  const unreadCount = Number(order.unreadStoreMessages ?? 0);
  const latestProposal = order.latestProposal ?? order.proposals?.at(-1);
  const needsProposal = order.status === "NEGOCIANDO" && latestProposal?.status !== "PENDENTE";
  const paidProposalAwaitingPreparation = order.status === "RECEBIDO"
    && ["PAGA", "CONCLUIDA"].includes(latestProposal?.status);
  const needsAttention = !history && (
    unreadCount > 0 || needsProposal || (order.status === "RECEBIDO" && !paidProposalAwaitingPreparation)
  );
  const itemsText = (order.items ?? [])
    .map((item) => `${item.quantity}x ${item.name}`)
    .join(", ");
  const paymentText = order.payment
    ? `${order.payment.method} - ${formatOrderStatus(order.payment.status)}`
    : order.status === "NEGOCIANDO"
      ? "Aguardando proposta da loja"
      : "Aguardando pagamento do cliente";
  const conversationLabel = needsProposal
    ? "Montar proposta"
    : unreadCount > 0
      ? "Responder cliente"
      : "Abrir conversa";
  const attentionText = needsProposal
    ? "Confira os itens e envie o valor final."
    : unreadCount > 0
      ? `${unreadCount} ${unreadCount === 1 ? "mensagem nova" : "mensagens novas"} do cliente.`
      : paidProposalAwaitingPreparation
        ? "Pagamento confirmado. O proximo passo e preparar o pedido."
      : order.status === "RECEBIDO"
        ? "Pagamento confirmado. Aceite o pedido para iniciar."
        : "";

  return (
    <View style={[
      styles.storeOrderRow,
      history && styles.storeOrderRowHistory,
      needsAttention && styles.storeOrderRowAttention,
    ]}>
      <View style={[
        styles.orderIcon,
        history && styles.orderIconHistory,
        needsAttention && styles.orderIconAttention,
      ]}>
        <Ionicons
          color={needsAttention ? colors.card : colors.primaryDark}
          name={needsAttention ? "notifications-outline" : "receipt-outline"}
          size={20}
        />
      </View>
      <View style={styles.orderCopy}>
        <View style={styles.orderHeaderRow}>
          <View style={styles.orderCodePill}>
            <Ionicons color={colors.primaryDark} name="pricetag-outline" size={13} />
            <Text style={styles.orderCode}>{compactOrderCode(order.code)}</Text>
          </View>
          <View style={styles.orderStatusGroup}>
            {unreadCount > 0 ? (
              <View style={styles.orderUnreadBadge}>
                <Text style={styles.orderUnreadBadgeText}>{unreadCount}</Text>
              </View>
            ) : null}
            <Text style={styles.orderStatus}>{formatOrderStatus(order.status)}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.orderBuyer}>
          {order.customer?.name ?? "Cliente"}
        </Text>
        <Text style={styles.orderItems}>{itemsText}</Text>
        {order.address ? (
          <Text style={styles.orderAddress}>
            {order.address.rua}, {order.address.numero} - {order.address.bairro}
          </Text>
        ) : (
          <Text style={styles.orderAddress}>Retirada na loja</Text>
        )}
        <View style={styles.orderFooter}>
          <Text style={styles.orderPayment}>
            {paymentText}
          </Text>
          <Text style={styles.orderTotal}>{formatarDinheiro(order.totalCents)}</Text>
        </View>
        {attentionText ? (
          <View style={styles.orderAttentionLine}>
            <Ionicons color={colors.primaryDark} name="flash-outline" size={14} />
            <Text style={styles.orderAttentionText}>{attentionText}</Text>
          </View>
        ) : null}
        <View style={styles.orderActionsRow}>
          <Pressable
            onPress={() => onOpenChat(order)}
            style={({ pressed }) => [
              styles.orderActionButton,
              styles.orderChatButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={colors.info} name="chatbubbles-outline" size={15} />
            <Text style={styles.orderChatText}>{conversationLabel}</Text>
          </Pressable>
          {actions.map((action) => (
            <Pressable
              disabled={isSaving}
              key={`${action.label}-${action.status}`}
              onPress={() => onUpdateStatus(order, action.status)}
              style={({ pressed }) => [
                styles.orderActionButton,
                action.danger && styles.orderActionDanger,
                pressed && styles.pressed,
                isSaving && styles.disabledAction,
              ]}
            >
              <Ionicons
                color={action.danger ? colors.danger : colors.primaryDark}
                name={action.icon}
                size={15}
              />
              <Text
                style={[
                  styles.orderActionText,
                  action.danger && styles.orderActionTextDanger,
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function orderActions(order) {
  const nextByStatus = {
    ACEITO: { icon: "restaurant-outline", label: "Preparar", status: "PREPARANDO" },
    PREPARANDO:
      order.deliveryMode === "RETIRADA"
        ? { icon: "bag-check-outline", label: "Pronto", status: "PRONTO_RETIRADA" }
        : { icon: "bicycle-outline", label: "Enviar", status: "SAIU_ENTREGA" },
    RECEBIDO: { icon: "checkmark-circle-outline", label: "Aceitar", status: "ACEITO" },
  };

  if (["CANCELADO", "CONCLUIDO"].includes(order.status)) {
    return [];
  }

  const actions = [];
  const nextAction = nextByStatus[order.status];

  if (nextAction) {
    actions.push(nextAction);
  }

  actions.push({
    danger: true,
    icon: "close-circle-outline",
    label: "Cancelar",
    status: "CANCELADO",
  });

  return actions;
}

function historyOrderActions(order) {
  return [];
}

function isOrderInPeriod(order, period) {
  return isOrderInPeriodValue(order, period);
}

function countActiveOrdersInPeriod(orders, period) {
  return countActiveOrdersInPeriodValue(orders, period);
}

function compactOrderCode(value = "") {
  return compactOrderCodeValue(value);
}

function StoreProductRow({ isSaving, onDelete, onEdit, product }) {
  const imageUrl = resolveMediaUrl(product.imageUrl);
  const price = product.promotionalPriceCents ?? product.priceCents;
  const stockText = product.stockControlled
    ? `${product.stockQuantity ?? 0} em estoque`
    : "Estoque livre";
  const deliveryText = [
    product.acceptDelivery ? "Entrega" : null,
    product.acceptPickup ? "Retirada" : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <View style={styles.productManageRow}>
      <Pressable onPress={onEdit} style={styles.productManageMain}>
        <View style={styles.productThumb}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.productThumbImage} />
          ) : (
            <Ionicons color={colors.primaryDark} name="cube-outline" size={22} />
          )}
        </View>
        <View style={styles.productManageCopy}>
          <Text numberOfLines={1} style={styles.saleTitle}>{product.name}</Text>
          <Text numberOfLines={1} style={styles.saleMeta}>
            {formatarDinheiro(price)} - {formatEstimatedTime(product.estimatedTimeMinutes)}
          </Text>
          <Text numberOfLines={1} style={styles.productManageMeta}>
            {stockText} - {deliveryText || "Sem canal definido"}
          </Text>
        </View>
      </Pressable>
      <View style={styles.storeActions}>
        <Pressable onPress={onEdit} style={styles.storeActionButton}>
          <Ionicons color={colors.primaryDark} name="create-outline" size={16} />
        </Pressable>
        <Pressable
          disabled={isSaving}
          onPress={onDelete}
          style={[styles.storeActionButton, styles.storeActionDanger]}
        >
          <Ionicons color={colors.danger} name="trash-outline" size={16} />
        </Pressable>
      </View>
    </View>
  );
}
