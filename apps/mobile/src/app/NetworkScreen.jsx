import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { InviteNetworkCard } from "../components/InviteNetworkCard";
import { IconButton } from "../components/IconButton";
import { NetworkSearchBar } from "../components/NetworkSearchBar";
import { ScreenContainer } from "../components/ScreenContainer";
import { SectionHeader } from "../components/SectionHeader";
import { NetworkMatrix } from "./network/NetworkMatrix";
import { NetworkParticipantCard } from "./network/NetworkParticipantCard";
import { NetworkGuideModal } from "./network/NetworkGuideModal";
import {
  hasSeenNetworkGuide,
  markNetworkGuideSeen,
} from "./network/networkGuidePreference";
import { getNetworkOverview } from "../services/network.api";
import { useAuthStore } from "../stores/useAuthStore";
import { formatarDinheiro } from "../utils/money";
import {
  colors,
  fonts,
  radius,
  shadowSoft,
  spacing,
  typography,
} from "../utils/theme";

const INITIAL_PARTICIPANTS_VISIBLE = 12;

const filters = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Ativos" },
  { key: "verified", label: "Verificados" },
  { key: "qualified", label: "Qualificados" },
];

const accountTypeLabels = {
  CONSUMIDOR: "Consumidor",
  LOJISTA: "Lojista",
  VENDEDOR: "Vendedor",
};

export function NetworkScreen() {
  const { session } = useAuthStore();
  const [activeFilter, setActiveFilter] = useState("all");
  const [data, setData] = useState(null);
  const [displayLimit, setDisplayLimit] = useState(INITIAL_PARTICIPANTS_VISIBLE);
  const [error, setError] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const guideCheckedUserRef = useRef(null);

  async function loadNetwork() {
    if (!session?.accessToken) {
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      setData(await getNetworkOverview(session.accessToken));
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar sua rede.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadNetwork();
  }, [session?.accessToken]);

  useEffect(() => {
    const userId = session?.user?.id;

    if (isLoading || !data || !userId || guideCheckedUserRef.current === userId) {
      return undefined;
    }

    guideCheckedUserRef.current = userId;
    let active = true;

    hasSeenNetworkGuide(userId).then((seen) => {
      if (!active || seen) return;
      setGuideOpen(true);
      markNetworkGuideSeen(userId);
    });

    return () => {
      active = false;
    };
  }, [data, isLoading, session?.user?.id]);

  const visiblePeople = useMemo(() => {
    if (!data) {
      return [];
    }

    const term = normalize(search);

    return data.people.filter((person) => {
      const filterMatches =
        activeFilter === "all" ||
        (activeFilter === "active" && person.active) ||
        (activeFilter === "verified" && person.verified) ||
        (activeFilter === "qualified" && person.qualified);
      const searchMatches =
        !term ||
        normalize(person.name).includes(term) ||
        normalize(accountTypeLabels[person.accountType] ?? person.accountType).includes(term);

      return filterMatches && searchMatches;
    });
  }, [activeFilter, data, search]);

  const renderedPeople = useMemo(
    () => visiblePeople.slice(0, displayLimit),
    [displayLimit, visiblePeople],
  );

  useEffect(() => {
    setDisplayLimit(INITIAL_PARTICIPANTS_VISIBLE);
  }, [activeFilter, search]);

  useEffect(() => {
    if (!selectedPerson || !data) {
      return;
    }

    const refreshedPerson = data.people.find((person) => person.id === selectedPerson.id);
    setSelectedPerson(refreshedPerson ?? null);
  }, [data]);

  if (isLoading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primaryDark} size="large" />
        <Text style={styles.loadingText}>Organizando sua rede...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.centered}>
        <Ionicons color={colors.danger} name="git-network-outline" size={38} />
        <Text style={styles.errorText}>{error}</Text>
        <AppButton onPress={loadNetwork} title="Tentar novamente" />
      </View>
    );
  }

  function selectPerson(person) {
    setSelectedPerson((current) => (current?.id === person.id ? null : person));
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroTopline}>
          <View style={styles.heroIdentity}>
            <View style={styles.heroIcon}>
              <Ionicons color={colors.primaryDark} name="git-network-outline" size={22} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>Matriz 2x20</Text>
              <Text style={styles.heroTitle}>Minha rede</Text>
            </View>
          </View>
          <View style={styles.heroActions}>
            <Pressable
              accessibilityLabel="Abrir guia para entender a rede e os ganhos"
              onPress={() => setGuideOpen(true)}
              style={({ pressed }) => [styles.guideButton, pressed && styles.pressed]}
            >
              <Ionicons color={colors.primaryDark} name="school-outline" size={16} />
              <Text style={styles.guideTitle}>Guia</Text>
            </Pressable>
            <IconButton
              disabled={isLoading}
              icon="refresh"
              label="Atualizar rede"
              loading={isLoading}
              onPress={loadNetwork}
              tone="soft"
            />
          </View>
        </View>
        <Text style={styles.heroSubtitle}>
          Acompanhe sua posicao, qualificacao e as pessoas conectadas abaixo de voce.
        </Text>
        <View style={styles.heroStatusRow}>
          <View style={[styles.heroStatus, data.qualification.qualified && styles.heroStatusQualified]}>
            <View style={[styles.heroStatusDot, data.qualification.qualified && styles.heroStatusDotQualified]} />
            <Text style={[styles.heroStatusText, data.qualification.qualified && styles.heroStatusTextQualified]}>
              {data.qualification.qualified ? "Ganhos liberados" : "Qualificacao em andamento"}
            </Text>
          </View>
          <Text style={styles.heroTotal}>{data.summary.total} na sua matriz</Text>
        </View>
      </View>

      <QualificationCard qualification={data.qualification} />

      <View style={styles.summaryGrid}>
        <SummaryCard icon="people-outline" label="Na matriz" value={data.summary.total} />
        <SummaryCard icon="flash-outline" label="Ativos" value={data.summary.active} />
        <SummaryCard icon="shield-checkmark-outline" label="Verificados" value={data.summary.verified} />
        <SummaryCard icon="ribbon-outline" label="Qualificados" value={data.summary.qualified} />
      </View>

      <InviteNetworkCard code={data.invite.code} message={data.invite.message} />

      <View style={styles.section}>
        <SectionHeader
          subtitle="A matriz continua preenchendo da esquerda para a direita."
          title="Sua estrutura"
        />
        <NetworkMatrix
          currentUser={data.currentUser}
          levels={data.matrix.levels}
          onSelectPerson={selectPerson}
          people={data.people}
          selectedPerson={selectedPerson}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader
          subtitle="Encontre, confira o status e abra os detalhes de cada pessoa."
          title="Participantes da rede"
        />
        <NetworkSearchBar onChangeText={setSearch} value={search} />

        <ScrollView
          contentContainerStyle={styles.filterList}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {filters.map((filter) => {
            const active = activeFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                accessibilityRole="button"
                onPress={() => setActiveFilter(filter.key)}
                style={[styles.filter, active && styles.filterActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.participantMeta}>
          <Text style={styles.resultText}>
            {visiblePeople.length} {visiblePeople.length === 1 ? "participante encontrado" : "participantes encontrados"}
          </Text>
          <View style={styles.matrixDot} />
          <Text style={styles.resultText}>Matriz 2x20</Text>
        </View>

        {renderedPeople.length > 0 ? (
          <View style={styles.peopleList}>
            {renderedPeople.map((person) => (
              <NetworkParticipantCard
                key={person.id}
                onPress={() => selectPerson(person)}
                person={person}
                selected={selectedPerson?.id === person.id}
              />
            ))}
          </View>
        ) : (
          <EmptyParticipants search={search} />
        )}

        {visiblePeople.length > renderedPeople.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setDisplayLimit((limit) => limit + INITIAL_PARTICIPANTS_VISIBLE)}
            style={styles.moreButton}
          >
            <Text style={styles.moreButtonText}>Ver mais participantes</Text>
            <Ionicons color={colors.primaryDark} name="arrow-down" size={18} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.kycCard}>
        <View style={styles.kycIcon}>
          <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={23} />
        </View>
        <View style={styles.kycCopy}>
          <Text style={styles.kycTitle}>Quando a rede gera ganhos?</Text>
          <Text style={styles.kycText}>
            A conta precisa estar ativa, com KYC aprovado e dois indicados diretos ativos e verificados. Pessoas de rede continuam visiveis mesmo com ganho bloqueado.
          </Text>
        </View>
      </View>

      {data.rewards.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader subtitle="Lancamentos que ja pertencem a voce." title="Recompensas registradas" />
          <View style={styles.rewardList}>
            {data.rewards.map((reward) => (
              <View key={reward.id} style={styles.rewardRow}>
                <View style={styles.rewardIcon}>
                  <Ionicons color={colors.primaryDark} name="gift-outline" size={20} />
                </View>
                <View style={styles.rewardCopy}>
                  <Text style={styles.rewardTitle}>{reward.type.replaceAll("_", " ")}</Text>
                  <Text style={styles.rewardStatus}>{reward.status}</Text>
                </View>
                <Text style={styles.rewardValue}>{formatarDinheiro(reward.valueCents)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <NetworkGuideModal onClose={() => setGuideOpen(false)} open={guideOpen} />
    </ScreenContainer>
  );
}

function QualificationCard({ qualification }) {
  const progress = Math.min(
    qualification.activeVerifiedDirects / qualification.requiredActiveVerifiedDirects,
    1,
  );

  return (
    <LinearGradient
      colors={qualification.qualified ? ["#E7F9F0", "#FFFFFF"] : ["#FFF7E8", "#FFFFFF"]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[
        styles.qualificationCard,
        qualification.qualified ? styles.qualificationCardQualified : styles.qualificationCardPending,
      ]}
    >
      <View style={styles.qualificationHeader}>
        <View style={[styles.qualificationIcon, !qualification.qualified && styles.qualificationIconPending]}>
          <Ionicons color={colors.card} name={qualification.qualified ? "ribbon" : "lock-closed-outline"} size={21} />
        </View>
        <View style={styles.qualificationCopy}>
          <Text style={[styles.qualificationEyebrow, !qualification.qualified && styles.qualificationEyebrowPending]}>STATUS DE GANHOS DA REDE</Text>
          <Text style={styles.qualificationTitle}>
            {qualification.qualified ? "Conta qualificada" : "Qualificacao em andamento"}
          </Text>
        </View>
      </View>

      <View style={styles.checkList}>
        <QualificationCheck checked={qualification.active} label="Conta ativa" />
        <QualificationCheck checked={qualification.verified} label={`KYC ${qualification.kycStatus.toLowerCase()}`} />
      </View>

      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>Indicados diretos ativos e verificados</Text>
        <Text style={styles.progressValue}>
          {qualification.activeVerifiedDirects}/{qualification.requiredActiveVerifiedDirects}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, !qualification.qualified && styles.progressFillPending, { width: `${progress * 100}%` }]} />
      </View>
    </LinearGradient>
  );
}

function QualificationCheck({ checked, label }) {
  return (
    <View style={styles.checkItem}>
      <Ionicons color={checked ? colors.primaryDark : colors.textMuted} name={checked ? "checkmark-circle" : "ellipse-outline"} size={17} />
      <Text style={styles.checkText}>{label}</Text>
    </View>
  );
}

function SummaryCard({ icon, label, value }) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryIcon}>
        <Ionicons color={colors.primaryDark} name={icon} size={20} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function EmptyParticipants({ search }) {
  return (
    <View style={styles.emptyParticipants}>
      <View style={styles.emptyParticipantsIcon}>
        <Ionicons color={colors.primaryDark} name="people-outline" size={23} />
      </View>
      <Text style={styles.emptyParticipantsTitle}>Nenhuma pessoa encontrada</Text>
      <Text style={styles.emptyParticipantsText}>
        {search ? "Tente outro nome ou mude o filtro." : "Sua rede vai aparecer aqui assim que novas pessoas entrarem na matriz."}
      </Text>
    </View>
  );
}

function normalize(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const styles = StyleSheet.create({
  centered: { alignItems: "center", backgroundColor: colors.background, flex: 1, gap: spacing.lg, justifyContent: "center", padding: spacing.xl },
  checkItem: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.76)", borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: spacing.xs, minHeight: 30, paddingHorizontal: spacing.sm },
  checkList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  checkText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  emptyParticipants: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderStyle: "dashed", borderWidth: 1, gap: spacing.sm, padding: spacing.xl },
  emptyParticipantsIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 46, justifyContent: "center", width: 46 },
  emptyParticipantsText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 19, textAlign: "center" },
  emptyParticipantsTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.label, fontWeight: "700" },
  errorText: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.small, textAlign: "center" },
  filter: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, justifyContent: "center", minHeight: 38, paddingHorizontal: spacing.lg },
  filterActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  filterList: { gap: spacing.sm, paddingRight: spacing.lg },
  filterText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  filterTextActive: { color: colors.card },
  guideButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: 5, minHeight: 34, paddingHorizontal: spacing.sm },
  guideTitle: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  hero: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md, ...shadowSoft },
  heroActions: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  heroCopy: { flexShrink: 1, gap: 1 },
  heroEyebrow: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  heroIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.md, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  heroIdentity: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: spacing.sm },
  heroStatus: { alignItems: "center", backgroundColor: colors.warningSoft, borderRadius: radius.round, flexDirection: "row", gap: 6, minHeight: 28, paddingHorizontal: spacing.sm },
  heroStatusDot: { backgroundColor: colors.warning, borderRadius: radius.round, height: 7, width: 7 },
  heroStatusDotQualified: { backgroundColor: colors.primary },
  heroStatusQualified: { backgroundColor: colors.primarySoft },
  heroStatusRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" },
  heroStatusText: { color: "#92400E", fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  heroStatusTextQualified: { color: colors.primaryDark },
  heroSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  heroTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, fontWeight: "800" },
  heroTopline: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  heroTotal: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: typography.caption },
  kycCard: { alignItems: "flex-start", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.lg },
  kycCopy: { flex: 1, gap: spacing.xs },
  kycIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  kycText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20 },
  kycTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
  loadingText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.small },
  matrixDot: { backgroundColor: colors.primary, borderRadius: radius.round, height: 5, width: 5 },
  moreButton: { alignItems: "center", alignSelf: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: spacing.xs, minHeight: 42, paddingHorizontal: spacing.lg },
  moreButtonText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  participantMeta: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  peopleList: { gap: spacing.sm },
  progressFill: { backgroundColor: colors.primary, borderRadius: radius.round, height: "100%" },
  progressFillPending: { backgroundColor: colors.warning },
  progressHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  progressLabel: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption },
  progressTrack: { backgroundColor: colors.border, borderRadius: radius.round, height: 7, overflow: "hidden" },
  progressValue: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.caption, fontWeight: "800" },
  pressed: { opacity: 0.78 },
  qualificationCard: { borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.lg, ...shadowSoft },
  qualificationCardPending: { borderColor: "#FDE68A" },
  qualificationCardQualified: { borderColor: colors.primaryLight },
  qualificationCopy: { flex: 1, gap: 3 },
  qualificationEyebrow: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  qualificationEyebrowPending: { color: "#92400E" },
  qualificationHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  qualificationIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  qualificationIconPending: { backgroundColor: colors.warning },
  qualificationTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  resultText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: typography.caption },
  rewardCopy: { flex: 1, gap: 3 },
  rewardIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  rewardList: { gap: spacing.sm },
  rewardRow: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.lg },
  rewardStatus: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  rewardTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  rewardValue: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
  section: { gap: spacing.lg },
  summaryCard: { alignItems: "center", flex: 1, gap: 3, minWidth: 64, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  summaryGrid: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", padding: spacing.xs },
  summaryIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 30, justifyContent: "center", width: 30 },
  summaryLabel: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10, textAlign: "center" },
  summaryValue: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
});
