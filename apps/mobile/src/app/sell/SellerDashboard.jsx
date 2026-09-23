import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { resolveMediaUrl } from "../../utils/media";
import { formatarDinheiro } from "../../utils/money";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../../utils/theme";
import { countNewStoreOrders, formatStatus } from "./seller.utils";

const chargeStatusCopy = {
  ATIVA: "Aguardando",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
  PAGA: "Recebida",
  PROCESSANDO: "Processando",
};

const payoutStatusCopy = {
  CANCELADO: "Valor na carteira",
  EM_RECONCILIACAO: "Confirmando Pix",
  FALHOU: "Valor na carteira",
  PAGO: "Pix enviado",
  PENDENTE: "Pix em envio",
  PROCESSANDO: "Pix em envio",
};

export function SellerDashboard({
  charges,
  payoutAccount,
  profile,
  onCreateSale,
  onOpenServiceDesk,
  onCreateStore,
  onOpenAutonomousHistory,
  onOpenCharge,
  onOpenChargeHistory,
  onOpenGuide,
  onOpenPayout,
  onOpenStoreChats,
  onOpenStore,
  sales,
  serviceCallsCount,
  serviceNotificationCount,
  sellerServices,
  storeConversations = [],
  stores,
  totalNewOrders,
}) {
  const [chargesOpen, setChargesOpen] = useState(false);
  const payoutReady = payoutAccount?.status === "ATIVA";
  const activeCharges = charges.filter((charge) => ["ATIVA", "PROCESSANDO"].includes(charge.status)).length;
  const paidRecentCents = charges
    .filter((charge) => charge.status === "PAGA")
    .reduce((total, charge) => total + Number(charge.amountCents ?? 0), 0);
  const serviceOperationCreated = sellerServices.some((service) => service.enabled);
  const enabledServiceCount = sellerServices.filter((service) => service.enabled).length;
  const activeServiceCount = sellerServices.filter((service) => service.available).length;
  const courierServices = sellerServices.filter(
    (service) => service.requiresCourierProfile || service.operationalType === "ENTREGA_LOCAL",
  );
  const courierOperationCreated = courierServices.some((service) => service.enabled);
  const activeCourierCount = courierServices.filter((service) => service.available).length;
  const servicesFirst = serviceOperationCreated && stores.length === 0;
  const hasBothOperations = serviceOperationCreated && stores.length > 0;
  const openStoreCount = stores.filter((store) => store.openForOrders !== false).length;
  const chatEnabledStoreCount = stores.filter(
    (store) => store.access?.isOwner !== false || store.access?.permissions?.storeChats,
  ).length;
  const storeChatUnreadCount = storeConversations.reduce(
    (total, conversation) => total + Number(conversation.unreadCount ?? 0),
    0,
  );
  const storeChatUnreadByStore = storeConversations.reduce(
    (counts, conversation) => {
      const storeId = Number(conversation.store?.id);

      if (storeId) {
        counts.set(
          storeId,
          (counts.get(storeId) ?? 0) + Number(conversation.unreadCount ?? 0),
        );
      }

      return counts;
    },
    new Map(),
  );
  const priorityStore = stores.find(
    (store) => countNewStoreOrders(store, new Set(["NEGOCIANDO", "RECEBIDO"])) > 0,
  );

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroTopline}>
          <View style={styles.heroHeading}>
            <View style={styles.heroHeadingIcon}>
              <Ionicons color={colors.primaryDark} name="analytics-outline" size={19} />
            </View>
            <Text style={styles.heroHeadingText}>Central de trabalho</Text>
          </View>
          <Pressable
            accessibilityLabel="Abrir guia de como vender"
            onPress={onOpenGuide}
            style={({ pressed }) => [styles.guideButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.primaryDark} name="school-outline" size={16} />
            <Text style={styles.guideButtonText}>Guia</Text>
          </Pressable>
        </View>
        <Text style={styles.heroSubtitle}>Seus comercios e servicos, cada um no seu lugar.</Text>

        {hasBothOperations ? (
          <>
            <View style={styles.operationSummaryGrid}>
              <OperationSummaryCard
                detail={`${openStoreCount} recebendo pedido${openStoreCount === 1 ? "" : "s"}`}
                icon="storefront-outline"
                label="Comercios"
                value={stores.length}
              />
              <OperationSummaryCard
                active={activeServiceCount > 0}
                detail={activeServiceCount ? `${activeServiceCount} online agora` : "Todos offline"}
                icon="briefcase-outline"
                label="Servicos"
                value={enabledServiceCount}
              />
            </View>
            <View style={[styles.metrics, styles.metricsCompact]}>
              <HeroMetric
                icon="notifications-outline"
                label="Pedidos novos"
                tone={totalNewOrders > 0 ? "danger" : "default"}
                value={String(totalNewOrders)}
              />
              <View style={styles.metricDivider} />
              <HeroMetric icon="time-outline" label="QR em aberto" value={String(activeCharges)} />
            </View>
          </>
        ) : (
          <View style={styles.metrics}>
            <HeroMetric
              icon={servicesFirst ? "briefcase-outline" : "storefront-outline"}
              label={servicesFirst ? "Servicos" : "Lojas"}
              value={String(servicesFirst ? enabledServiceCount : stores.length)}
            />
            <View style={styles.metricDivider} />
            <HeroMetric
              icon="notifications-outline"
              label="Pedidos novos"
              tone={totalNewOrders > 0 ? "danger" : "default"}
              value={String(totalNewOrders)}
            />
            <View style={styles.metricDivider} />
            <HeroMetric icon="time-outline" label="QR em aberto" value={String(activeCharges)} />
          </View>
        )}
      </View>

      {courierOperationCreated ? (
        <ServiceSection
          activeCount={activeCourierCount}
          callsCount={serviceCallsCount}
          courierMode
          notificationCount={serviceNotificationCount}
          onOpen={onOpenServiceDesk}
          profile={profile}
          serviceOperationCreated
          servicesCount={courierServices.length}
        />
      ) : null}

      <Pressable
        accessibilityHint="Configura a chave Pix que recebe vendas presenciais"
        accessibilityLabel="Recebimento de vendas presenciais"
        onPress={onOpenPayout}
        style={({ pressed }) => [
          styles.payoutCard,
          !payoutReady && styles.payoutCardPending,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.payoutIcon, !payoutReady && styles.payoutIconPending]}>
          <Ionicons
            color={payoutReady ? colors.card : "#92400E"}
            name={payoutReady ? "flash" : "key-outline"}
            size={19}
          />
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.payoutTitle}>
            {payoutReady
              ? "Repasse presencial configurado"
              : payoutAccount
                ? "Chave Pix em validacao"
                : "Cadastre sua chave Pix"}
          </Text>
          <Text numberOfLines={1} style={styles.payoutText}>
            {payoutReady
              ? `${payoutAccount.keyType} ${payoutAccount.keyMasked} · QR pago envia o valor liquido`
              : payoutAccount
                ? "Envie novamente para validar o pagamento"
              : "Obrigatoria para receber imediatamente nas vendas por QR"}
          </Text>
        </View>
        <View style={[styles.payoutStatus, !payoutReady && styles.payoutStatusPending]}>
          <View style={[styles.payoutDot, !payoutReady && styles.payoutDotPending]} />
          <Text style={[styles.payoutStatusText, !payoutReady && styles.payoutStatusTextPending]}>
            {payoutReady ? "Pronto" : payoutAccount ? "Validar" : "Configurar"}
          </Text>
        </View>
        <Ionicons color={payoutReady ? colors.primaryDark : "#92400E"} name="chevron-forward" size={18} />
      </Pressable>

      <View style={styles.commandGrid}>
        <CommandCard
          accent
          hint={stores.length ? "Cobranca rapida da sua loja" : "Venda presencial sem loja"}
          icon="qr-code-outline"
          label="Cobrar agora"
          onPress={onCreateSale}
        />
        {chatEnabledStoreCount ? (
          <CommandCard
            hint="Abra as conversas gerais das suas lojas"
            icon="chatbubbles-outline"
            label="Conversas das lojas"
            notificationCount={storeChatUnreadCount}
            notificationTone="conversation"
            onPress={onOpenStoreChats}
          />
        ) : null}
      </View>

      {storeChatUnreadCount > 0 ? (
        <Pressable
          onPress={onOpenStoreChats}
          style={({ pressed }) => [
            styles.alert,
            styles.alertConversation,
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.alertIcon, styles.alertConversationIcon]}>
            <Ionicons color="#92400E" name="chatbubbles" size={20} />
          </View>
          <View style={styles.alertCopy}>
            <Text style={[styles.alertTitle, styles.alertConversationTitle]}>
              {storeChatUnreadCount} mensagem{storeChatUnreadCount === 1 ? "" : "s"} de cliente
            </Text>
            <Text style={[styles.alertText, styles.alertConversationText]}>
              Responda as duvidas gerais das suas lojas sem misturar com pedidos.
            </Text>
          </View>
          <Ionicons color="#92400E" name="arrow-forward" size={19} />
        </Pressable>
      ) : null}

      {totalNewOrders > 0 ? (
        <Pressable
          onPress={() => priorityStore && onOpenStore(priorityStore)}
          style={({ pressed }) => [
            styles.alert,
            styles.alertOrder,
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.alertIcon, styles.alertOrderIcon]}>
            <Ionicons color={colors.card} name="notifications" size={20} />
          </View>
          <View style={styles.alertCopy}>
            <Text style={[styles.alertTitle, styles.alertOrderTitle]}>{totalNewOrders} pedido{totalNewOrders === 1 ? "" : "s"} aguardando voce</Text>
            <Text style={[styles.alertText, styles.alertOrderText]}>Abra a loja sinalizada para aceitar e acompanhar pelo CRM.</Text>
          </View>
          <Ionicons color={colors.danger} name="arrow-forward" size={19} />
        </Pressable>
      ) : null}

      {servicesFirst && !courierOperationCreated ? (
        <ServiceSection
          activeCount={activeServiceCount}
          callsCount={serviceCallsCount}
          notificationCount={serviceNotificationCount}
          onOpen={onOpenServiceDesk}
          profile={profile}
          serviceOperationCreated={serviceOperationCreated}
          servicesCount={enabledServiceCount}
        />
      ) : null}

      <CommerceSection
        onCreateStore={onCreateStore}
        onOpenStore={onOpenStore}
        storeChatUnreadByStore={storeChatUnreadByStore}
        stores={stores}
      />

      {!servicesFirst && !courierOperationCreated ? (
        <ServiceSection
          activeCount={activeServiceCount}
          callsCount={serviceCallsCount}
          notificationCount={serviceNotificationCount}
          onOpen={onOpenServiceDesk}
          profile={profile}
          serviceOperationCreated={serviceOperationCreated}
          servicesCount={enabledServiceCount}
        />
      ) : null}

      <Pressable
        accessibilityHint="Abre ou fecha as cobrancas recentes"
        accessibilityLabel="Cobrancas recentes"
        onPress={() => setChargesOpen((current) => !current)}
        style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.pressed]}
      >
        <View style={styles.sectionIcon}>
          <Ionicons color={colors.primaryDark} name="receipt-outline" size={19} />
        </View>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>Cobrancas recentes</Text>
          <Text style={styles.sectionSubtitle}>
            {chargesOpen ? "Ultimas movimentacoes por QR" : `${charges.length} cobranca${charges.length === 1 ? "" : "s"} recentes`}
          </Text>
        </View>
        {activeCharges > 0 ? (
          <View style={styles.collapsibleBadge}>
            <Text style={styles.collapsibleBadgeText}>{activeCharges} aberta{activeCharges === 1 ? "" : "s"}</Text>
          </View>
        ) : null}
        <Ionicons color={colors.primaryDark} name={chargesOpen ? "chevron-up" : "chevron-down"} size={20} />
      </Pressable>

      {chargesOpen ? (
        <View style={styles.collapsibleContent}>
          <Pressable
            onPress={onOpenChargeHistory}
            style={({ pressed }) => [styles.historyLink, pressed && styles.pressed]}
          >
            <Text style={styles.historyLinkText}>Ver historico completo</Text>
            <Ionicons color={colors.primaryDark} name="arrow-forward" size={16} />
          </Pressable>
          {charges.length ? (
            <View style={styles.list}>
              {charges.slice(0, 5).map((charge) => (
                <ChargeRow charge={charge} key={charge.id} onPress={onOpenCharge} />
              ))}
            </View>
          ) : (
            <EmptyState icon="qr-code-outline" text="As cobrancas geradas aparecerao aqui." title="Nenhuma cobranca recente" />
          )}

          {paidRecentCents > 0 ? (
            <View style={styles.receivedStrip}>
              <Ionicons color={colors.primaryDark} name="trending-up-outline" size={19} />
              <Text style={styles.receivedLabel}>Recebido nas cobrancas recentes</Text>
              <Text style={styles.receivedValue}>{formatarDinheiro(paidRecentCents)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <SectionHeading
        action="Ver todas"
        icon="flash-outline"
        onPress={onOpenAutonomousHistory}
        subtitle="Vendas criadas sem vinculo com loja"
        title="Vendas autonomas"
      />
      {sales.length ? (
        <View style={styles.list}>
          {sales.slice(0, 5).map((sale) => (
            <AutonomousSaleRow key={sale.id} onPress={onOpenCharge} sale={sale} />
          ))}
        </View>
      ) : (
        <EmptyState icon="flash-outline" text="Gere uma venda autonoma para iniciar seu historico." title="Nenhuma venda autonoma" />
      )}
    </>
  );
}

function CommerceSection({ onCreateStore, onOpenStore, storeChatUnreadByStore, stores }) {
  return (
    <>
      <SectionHeading
        action={stores.length ? "Nova loja" : "Criar loja"}
        icon="storefront-outline"
        imageUrl={stores[0]?.logoUrl}
        onPress={onCreateStore}
        subtitle={stores.length ? "Pedidos, produtos e equipe de cada loja" : "Cadastre seu primeiro comercio"}
        title="Meus comercios"
      />
      {stores.length ? (
        <View style={styles.list}>
          {stores.map((store) => (
            <StoreRow
              chatUnreadCount={storeChatUnreadByStore.get(Number(store.id)) ?? 0}
              key={store.id}
              onPress={onOpenStore}
              store={store}
            />
          ))}
        </View>
      ) : (
        <OperationStartCard
          icon="storefront-outline"
          onPress={onCreateStore}
          text="Crie sua vitrine, cadastre produtos e comece a receber pedidos."
          title="Criar minha loja"
        />
      )}
    </>
  );
}

function ServiceSection({
  activeCount,
  callsCount,
  courierMode = false,
  notificationCount,
  onOpen,
  profile,
  serviceOperationCreated,
  servicesCount,
}) {
  return (
    <>
      <SectionHeading
        action={serviceOperationCreated ? (courierMode ? "Abrir" : "Gerenciar") : "Comecar"}
        icon={courierMode ? "bicycle-outline" : "briefcase-outline"}
        onPress={onOpen}
        subtitle={courierMode ? "Corridas, chamados e sua disponibilidade" : "Perfil profissional, disponibilidade e atendimentos"}
        title={courierMode ? "Central do motoboy" : "Meus servicos"}
      />
      {serviceOperationCreated ? (
        <ServiceOperationRow
          activeCount={activeCount}
          callsCount={callsCount}
          courierMode={courierMode}
          notificationCount={notificationCount}
          onPress={onOpen}
          profile={profile}
          servicesCount={servicesCount}
        />
      ) : (
        <OperationStartCard
          icon="person-add-outline"
          onPress={onOpen}
          text="Escolha o que voce faz e fique online para receber chamados. Nao precisa criar loja."
          title="Quero prestar servicos"
        />
      )}
    </>
  );
}

function OperationStartCard({ icon, onPress, text, title }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.operationStart, pressed && styles.pressed]}>
      <View style={styles.operationStartIcon}><Ionicons color={colors.card} name={icon} size={21} /></View>
      <View style={styles.rowCopy}>
        <Text style={styles.operationStartTitle}>{title}</Text>
        <Text style={styles.operationStartText}>{text}</Text>
      </View>
      <View style={styles.operationStartArrow}><Ionicons color={colors.primaryDark} name="arrow-forward" size={18} /></View>
    </Pressable>
  );
}

function ServiceOperationRow({
  activeCount,
  callsCount,
  courierMode = false,
  notificationCount,
  onPress,
  profile,
  servicesCount,
}) {
  const isOnline = activeCount > 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.serviceOperation, isOnline && styles.serviceOperationActive, pressed && styles.pressed]}>
      <View style={[styles.serviceOperationIcon, isOnline && styles.serviceOperationIconActive]}>
        <Ionicons color={isOnline ? colors.card : colors.primaryDark} name={courierMode ? "bicycle-outline" : "briefcase-outline"} size={21} />
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.storeTitleLine}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {courierMode ? "Area do motoboy" : `Servicos de ${profile?.publicName ?? "voce"}`}
          </Text>
          <View style={[styles.operationStatus, isOnline && styles.operationStatusActive]}>
            <View style={[styles.operationDot, isOnline && styles.operationDotActive]} />
            <Text style={[styles.operationStatusText, isOnline && styles.operationStatusTextActive]}>{isOnline ? "online" : "offline"}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {courierMode
            ? callsCount
              ? `${callsCount} chamado${callsCount === 1 ? "" : "s"} aguardando voce`
              : isOnline
                ? "Disponivel para receber novas corridas"
                : "Abra para ficar online e receber corridas"
            : `${servicesCount} servico${servicesCount === 1 ? "" : "s"} configurado${servicesCount === 1 ? "" : "s"}${callsCount ? ` · ${callsCount} chamado${callsCount === 1 ? "" : "s"}` : " · abra para atender chamados"}`}
        </Text>
      </View>
      {notificationCount > 0 ? (
        <View style={styles.serviceNotification}>
          <Ionicons color="#92400E" name="chatbubble-ellipses" size={13} />
          <Text style={styles.serviceNotificationText}>{notificationCount}</Text>
        </View>
      ) : null}
      <Ionicons color={colors.primaryDark} name="chevron-forward" size={19} />
    </Pressable>
  );
}

function OperationSummaryCard({ active = false, detail, icon, label, value }) {
  return (
    <View style={[styles.operationSummaryCard, active && styles.operationSummaryCardActive]}>
      <View style={[styles.operationSummaryIcon, active && styles.operationSummaryIconActive]}>
        <Ionicons color={active ? colors.card : colors.primaryDark} name={icon} size={20} />
      </View>
      <View style={styles.operationSummaryCopy}>
        <Text style={styles.operationSummaryLabel}>{label}</Text>
        <Text numberOfLines={1} style={[styles.operationSummaryDetail, active && styles.operationSummaryDetailActive]}>{detail}</Text>
      </View>
      <Text style={styles.operationSummaryValue}>{value}</Text>
    </View>
  );
}

function HeroMetric({ icon, label, tone = "default", value }) {
  const danger = tone === "danger";

  return (
    <View style={styles.metric}>
      <Ionicons color={danger ? colors.danger : colors.primaryDark} name={icon} size={18} />
      <Text style={[styles.metricValue, danger && styles.metricValueDanger]}>{value}</Text>
      <Text numberOfLines={1} style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function CommandCard({
  accent = false,
  caption,
  hint,
  icon,
  label,
  notificationCount = 0,
  notificationTone = "default",
  onPress,
}) {
  const conversationAlert =
    notificationCount > 0 && notificationTone === "conversation";

  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.command,
        accent && styles.commandAccent,
        conversationAlert && styles.commandConversation,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.commandIcon,
          accent && styles.commandIconAccent,
          conversationAlert && styles.commandConversationIcon,
        ]}
      >
        <Ionicons
          color={accent ? colors.card : conversationAlert ? "#92400E" : colors.primaryDark}
          name={icon}
          size={20}
        />
      </View>
      <View style={styles.commandCopy}>
        <Text numberOfLines={1} style={[styles.commandLabel, accent && styles.commandLabelAccent]}>{label}</Text>
        {caption ? (
          <Text numberOfLines={1} style={[styles.commandCaption, accent && styles.commandCaptionAccent]}>{caption}</Text>
        ) : null}
      </View>
      {notificationCount > 0 ? (
        <View style={styles.commandNotification}>
          <Text style={styles.commandNotificationText}>
            {notificationCount > 9 ? "9+" : notificationCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function SectionHeading({ action, icon, imageUrl, onPress, subtitle, title }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionIcon}>
        {imageUrl ? (
          <Image
            resizeMode="contain"
            source={{ uri: resolveMediaUrl(imageUrl) }}
            style={styles.operationLogo}
          />
        ) : (
          <Ionicons color={colors.primaryDark} name={icon} size={19} />
        )}
      </View>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}>
        <Text style={styles.sectionActionText}>{action}</Text>
        <Ionicons color={colors.primaryDark} name="chevron-forward" size={15} />
      </Pressable>
    </View>
  );
}

function ChargeRow({ charge, onPress }) {
  const active = charge.status === "ATIVA";
  const paid = charge.status === "PAGA";
  const source = charge.origin === "AVULSA" ? "Autonoma" : charge.merchant?.name ?? "Venda local";
  const financialStatus = paid && charge.payout
    ? payoutStatusCopy[charge.payout.status]
    : null;

  return (
    <Pressable disabled={!active} onPress={() => onPress(charge)} style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && active && styles.pressed]}>
      <View style={[styles.rowIcon, paid && styles.rowIconPaid]}>
        <Ionicons color={paid ? colors.card : colors.primaryDark} name={paid ? "checkmark" : "qr-code-outline"} size={20} />
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>{charge.title}</Text>
        <Text numberOfLines={1} style={styles.rowMeta}>{source}</Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.rowAmount}>{formatarDinheiro(charge.amountCents)}</Text>
        <Text style={[styles.rowStatus, paid && styles.rowStatusPaid]}>
          {active ? "Abrir QR" : financialStatus ?? chargeStatusCopy[charge.status] ?? formatStatus(charge.status)}
        </Text>
      </View>
    </Pressable>
  );
}

function StoreRow({ chatUnreadCount, onPress, store }) {
  const attentionCount = countNewStoreOrders(store, new Set(["NEGOCIANDO", "RECEBIDO"]));
  const isOpen = store.openForOrders !== false;
  const hasAttention = attentionCount > 0 || chatUnreadCount > 0;

  return (
    <Pressable
      onPress={() => onPress(store)}
      style={({ pressed }) => [
        styles.storeRow,
        attentionCount > 0
          ? styles.storeRowOrderAlert
          : chatUnreadCount > 0
            ? styles.storeRowConversationAlert
            : null,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.storeIcon, hasAttention && styles.storeIconAttention]}>
        {store.logoUrl ? (
          <Image
            accessibilityLabel={`Logo da loja ${store.name}`}
            resizeMode="contain"
            source={{ uri: resolveMediaUrl(store.logoUrl) }}
            style={styles.storeLogo}
          />
        ) : (
          <Ionicons color={colors.primaryDark} name="storefront-outline" size={21} />
        )}
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.storeTitleLine}>
          <Text numberOfLines={1} style={styles.rowTitle}>{store.name}</Text>
        </View>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {store.category?.name ?? "Sem categoria"} · {isOpen ? "recebendo pedidos" : "pedidos pausados"}
        </Text>
      </View>
      {hasAttention ? (
        <View style={styles.storeSignals}>
          {attentionCount > 0 ? (
            <View style={styles.storeOrderNotification}>
              <Ionicons color={colors.card} name="notifications" size={13} />
              <Text style={styles.storeOrderNotificationValue}>{attentionCount}</Text>
            </View>
          ) : null}
          {chatUnreadCount > 0 ? (
            <View style={styles.storeChatNotification}>
              <Ionicons color="#92400E" name="chatbubble-ellipses" size={13} />
              <Text style={styles.storeChatNotificationValue}>{chatUnreadCount}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

function AutonomousSaleRow({ onPress, sale }) {
  const active = sale.charge?.status === "ATIVA";
  return (
    <Pressable disabled={!active} onPress={() => onPress(sale.charge)} style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && active && styles.pressed]}>
      <View style={styles.rowIcon}><Ionicons color={colors.primaryDark} name="flash-outline" size={20} /></View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>{sale.title}</Text>
        <Text numberOfLines={1} style={styles.rowMeta}>{active ? "QR disponivel para pagamento" : formatStatus(sale.status)}</Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.rowAmount}>{formatarDinheiro(sale.amountCents)}</Text>
        <Text style={styles.rowStatus}>{active ? "Ver QR" : "Autonoma"}</Text>
      </View>
    </Pressable>
  );
}

function EmptyState({ icon, text, title }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons color={colors.primaryDark} name={icon} size={22} /></View>
      <View style={styles.rowCopy}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  alert: { alignItems: "center", borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md, ...shadowSoft },
  alertConversation: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  alertConversationIcon: { backgroundColor: "#FEF3C7" },
  alertConversationText: { color: "#78350F" },
  alertConversationTitle: { color: "#78350F" },
  alertCopy: { flex: 1, gap: 3, minWidth: 0 },
  alertIcon: { alignItems: "center", borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  alertOrder: { backgroundColor: colors.dangerSoft, borderColor: "#FECACA" },
  alertOrderIcon: { backgroundColor: colors.danger },
  alertOrderText: { color: "#991B1B" },
  alertOrderTitle: { color: "#7F1D1D" },
  alertText: { fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  alertTitle: { fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
  command: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flex: 1, gap: 6, justifyContent: "center", minHeight: 76, minWidth: 0, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm, position: "relative" },
  commandAccent: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  commandConversation: { backgroundColor: "#FFFCF2", borderColor: "#FDE68A" },
  commandCopy: { alignItems: "center", gap: 1, minHeight: 25 },
  commandGrid: { flexDirection: "row", gap: spacing.sm },
  commandCaption: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 9, lineHeight: 10, textAlign: "center" },
  commandCaptionAccent: { color: "#D1FAE5" },
  commandIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  commandIconAccent: { backgroundColor: "rgba(255,255,255,0.15)" },
  commandConversationIcon: { backgroundColor: "#FEF3C7" },
  commandLabel: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 11, fontWeight: "700", lineHeight: 14, textAlign: "center" },
  commandLabelAccent: { color: colors.card },
  commandNotification: { alignItems: "center", backgroundColor: colors.warning, borderColor: colors.card, borderRadius: radius.round, borderWidth: 2, height: 22, justifyContent: "center", minWidth: 22, paddingHorizontal: 4, position: "absolute", right: 3, top: 3 },
  commandNotificationText: { color: "#4A2B00", fontFamily: fonts.extraBold, fontSize: 10, fontWeight: "800" },
  collapsibleBadge: { backgroundColor: colors.primarySoft, borderRadius: radius.round, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  collapsibleBadgeText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  collapsibleContent: { gap: spacing.md },
  collapsibleHeader: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, minHeight: 66, padding: spacing.md, ...shadowSoft },
  empty: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.lg },
  emptyIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 46, justifyContent: "center", width: 46 },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  hero: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md, ...shadowSoft },
  heroHeading: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: spacing.sm },
  heroHeadingIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 36, justifyContent: "center", width: 36 },
  heroHeadingText: { color: colors.textPrimary, flexShrink: 1, fontFamily: fonts.extraBold, fontSize: typography.h2, fontWeight: "800" },
  heroTopline: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" },
  guideButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: 5, minHeight: 34, paddingHorizontal: spacing.sm },
  guideButtonText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  heroSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  historyLink: { alignItems: "center", alignSelf: "flex-end", flexDirection: "row", gap: spacing.xs, paddingVertical: spacing.xs },
  historyLinkText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  list: { gap: spacing.sm },
  metric: { alignItems: "center", flex: 1, gap: 2, minWidth: 0 },
  metricDivider: { backgroundColor: colors.primaryLight, height: 38, width: 1 },
  metricLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 10 },
  metricValue: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  metricValueDanger: { color: colors.danger },
  metrics: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.lg, flexDirection: "row", paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  metricsCompact: { paddingVertical: spacing.sm },
  operationSummaryCard: { alignItems: "center", backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flex: 1, flexDirection: "row", gap: spacing.sm, minHeight: 68, minWidth: 0, padding: spacing.sm },
  operationSummaryCardActive: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight },
  operationSummaryCopy: { flex: 1, minWidth: 0 },
  operationSummaryDetail: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 9, marginTop: 2 },
  operationSummaryDetailActive: { color: colors.primaryDark },
  operationSummaryGrid: { flexDirection: "row", gap: spacing.sm },
  operationSummaryIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  operationSummaryIconActive: { backgroundColor: colors.primaryDark },
  operationSummaryLabel: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 10 },
  operationSummaryValue: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2 },
  pressed: { opacity: 0.78 },
  receivedLabel: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption },
  receivedStrip: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  receivedValue: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.small, fontWeight: "800" },
  row: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 76, padding: spacing.md },
  rowActive: { borderColor: colors.primaryLight },
  rowAmount: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small, fontWeight: "800" },
  rowCopy: { flex: 1, gap: 4, minWidth: 0 },
  rowEnd: { alignItems: "flex-end", gap: 4 },
  rowIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  rowIconPaid: { backgroundColor: colors.primaryDark },
  rowMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  rowStatus: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  rowStatusPaid: { color: colors.primaryDark },
  rowTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  sectionAction: { alignItems: "center", flexDirection: "row", gap: 2, paddingVertical: spacing.sm },
  sectionActionText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  sectionCopy: { flex: 1, gap: 2, minWidth: 0 },
  sectionHeading: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  sectionIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  operationLogo: { borderRadius: radius.round, height: "100%", width: "100%" },
  sectionSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  sectionTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  serviceOperation: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 82, padding: spacing.md, ...shadowSoft },
  serviceOperationActive: { borderColor: colors.primaryLight },
  serviceOperationIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  serviceOperationIconActive: { backgroundColor: colors.primaryDark },
  serviceNotification: { alignItems: "center", backgroundColor: colors.warning, borderRadius: radius.round, flexDirection: "row", gap: 4, minHeight: 27, paddingHorizontal: spacing.sm },
  serviceNotificationText: { color: "#4A2B00", fontFamily: fonts.extraBold, fontSize: 11, fontWeight: "800" },
  operationStatus: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: 7, paddingVertical: 4 },
  operationStatusActive: { backgroundColor: colors.primarySoft },
  operationDot: { backgroundColor: colors.textMuted, borderRadius: radius.round, height: 5, width: 5 },
  operationDotActive: { backgroundColor: colors.success },
  operationStatusText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  operationStatusTextActive: { color: colors.primaryDark },
  operationStart: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 88, padding: spacing.md, ...shadowSoft },
  operationStartArrow: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  operationStartIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 46, justifyContent: "center", width: 46 },
  operationStartText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  operationStartTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small },
  payoutCard: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 68, padding: spacing.md },
  payoutCardPending: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  payoutDot: { backgroundColor: colors.success, borderRadius: radius.round, height: 6, width: 6 },
  payoutDotPending: { backgroundColor: colors.warning },
  payoutIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  payoutIconPending: { backgroundColor: "#FEF3C7" },
  payoutStatus: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  payoutStatusPending: { backgroundColor: "#FEF3C7" },
  payoutStatusText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  payoutStatusTextPending: { color: "#92400E" },
  payoutText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  payoutTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  storeIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 48, justifyContent: "center", width: 48 },
  storeLogo: { borderRadius: radius.md, height: "100%", width: "100%" },
  storeIconAttention: { borderColor: colors.primaryLight, borderWidth: 1 },
  storeChatNotification: { alignItems: "center", backgroundColor: "#FEF3C7", borderColor: "#FDE68A", borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: 4, minHeight: 28, paddingHorizontal: spacing.sm },
  storeChatNotificationValue: { color: "#78350F", fontFamily: fonts.extraBold, fontSize: typography.caption, fontWeight: "800" },
  storeOrderNotification: { alignItems: "center", backgroundColor: colors.danger, borderRadius: radius.round, flexDirection: "row", gap: 4, minHeight: 28, paddingHorizontal: spacing.sm },
  storeOrderNotificationValue: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.caption, fontWeight: "800" },
  storeSignals: { alignItems: "flex-end", gap: 4 },
  storeRow: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 76, padding: spacing.md },
  storeRowConversationAlert: { backgroundColor: "#FFFCF2", borderColor: "#FDE68A" },
  storeRowOrderAlert: { backgroundColor: colors.dangerSoft, borderColor: "#FECACA" },
  storeTitleLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
});
