import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../../utils/theme";
import { connectionLabel, isDirectConnection, personInitials } from "./network.utils";

const VISIBLE_GENERATIONS = 2;

export function NetworkMatrix({ currentUser, levels, onSelectPerson, people, selectedPerson }) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [focusId, setFocusId] = useState(currentUser.id);
  const graph = useMemo(() => buildNetworkGraph(currentUser, people), [currentUser, people]);
  const focusPerson = graph.peopleById.get(focusId) ?? graph.root;
  const parent = graph.peopleById.get(focusPerson.parentId) ?? null;
  const visibleLevels = useMemo(
    () => buildVisibleLevels(focusPerson.id, graph.childrenByParent, VISIBLE_GENERATIONS),
    [focusPerson.id, graph.childrenByParent],
  );
  const visibleCount = visibleLevels.reduce((total, level) => total + level.length, 0);

  useEffect(() => {
    if (selectedPerson?.id && graph.peopleById.has(selectedPerson.id)) setFocusId(selectedPerson.id);
  }, [graph.peopleById, selectedPerson?.id]);

  useEffect(() => {
    if (!graph.peopleById.has(focusId)) setFocusId(graph.root.id);
  }, [focusId, graph.peopleById, graph.root.id]);

  function selectFocus(person) {
    setFocusId(person.id);
    onSelectPerson(person.id === graph.root.id ? null : person);
  }

  return (
    <View style={styles.surface}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>MAPA LATERAL DA REDE</Text>
          <Text style={styles.title}>Explore por ramificacoes</Text>
          <Text style={styles.subtitle}>Cada toque coloca a pessoa no topo e abre mais dois niveis.</Text>
        </View>
        <View style={styles.totalBubble}>
          <Text style={styles.totalValue}>{people.length}</Text>
          <Text style={styles.totalLabel}>pessoas</Text>
        </View>
      </View>

      <View style={styles.legend}>
        <Legend color={colors.primary} label="Indicacao direta" />
        <Legend color={colors.info} label="Ligacao de rede" />
        <Legend icon="lock-closed" label="Ganho bloqueado" />
      </View>

      <View style={styles.browser}>
        <View style={styles.browserToolbar}>
          <View style={styles.browserPath}>
            <Ionicons color={colors.primaryDark} name="git-branch-outline" size={16} />
            <Text numberOfLines={1} style={styles.browserPathText}>
              {focusPerson.id === graph.root.id ? "Inicio da sua rede" : `Explorando ${focusPerson.name}`}
            </Text>
          </View>
          {focusPerson.id !== graph.root.id ? (
            <Pressable accessibilityRole="button" onPress={() => selectFocus(graph.root)} style={styles.rootButton}>
              <Ionicons color={colors.primaryDark} name="home-outline" size={15} />
              <Text style={styles.rootButtonText}>Minha raiz</Text>
            </Pressable>
          ) : null}
        </View>

        <FocusCard
          isRoot={focusPerson.id === graph.root.id}
          onBack={parent ? () => selectFocus(parent) : null}
          person={focusPerson}
        />

        {visibleCount ? (
          <ScrollView contentContainerStyle={styles.generations} horizontal showsHorizontalScrollIndicator={false}>
            {visibleLevels.map((generation, index) => (
              <GenerationColumn
                generation={generation}
                generationNumber={index + 1}
                key={`${focusPerson.id}-${index + 1}`}
                last={index === visibleLevels.length - 1}
                onSelect={selectFocus}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.branchEmpty}>
            <View style={styles.branchEmptyIcon}><Ionicons color={colors.primaryDark} name="leaf-outline" size={20} /></View>
            <View style={styles.branchEmptyCopy}>
              <Text style={styles.branchEmptyTitle}>Fim desta ramificacao</Text>
              <Text style={styles.branchEmptyText}>Essa pessoa ainda nao possui pessoas posicionadas abaixo dela.</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.navigationHint}>
        <Ionicons color={colors.primaryDark} name="arrow-forward-circle-outline" size={20} />
        <Text style={styles.navigationHintText}>Toque em qualquer pessoa do ultimo nivel para abrir os dois proximos niveis.</Text>
      </View>

      <Pressable accessibilityRole="button" onPress={() => setDetailsVisible((visible) => !visible)} style={styles.detailsButton}>
        <View style={styles.detailsButtonIcon}><Ionicons color={colors.primaryDark} name="analytics-outline" size={18} /></View>
        <View style={styles.detailsButtonCopy}>
          <Text style={styles.detailsButtonTitle}>Distribuicao completa</Text>
          <Text style={styles.detailsButtonText}>Resumo dos 20 niveis da matriz</Text>
        </View>
        <Ionicons color={colors.primaryDark} name={detailsVisible ? "chevron-up" : "chevron-down"} size={20} />
      </Pressable>

      {detailsVisible ? <LevelsTable levels={levels} /> : null}
    </View>
  );
}

function FocusCard({ isRoot, onBack, person }) {
  const direct = isDirectConnection(person) || isRoot;
  return (
    <View style={styles.focusCard}>
      {onBack ? (
        <Pressable accessibilityLabel="Voltar uma pessoa na rede" onPress={onBack} style={styles.focusBack}>
          <Ionicons color={colors.primaryDark} name="arrow-back" size={19} />
        </Pressable>
      ) : <View style={styles.focusBackPlaceholder} />}
      <PersonAvatar large person={person} root={isRoot} />
      <View style={styles.focusCopy}>
        <Text style={styles.focusEyebrow}>PESSOA EM FOCO</Text>
        <Text numberOfLines={1} style={styles.focusName}>{isRoot ? "Voce" : person.name}</Text>
        <Text numberOfLines={1} style={[styles.focusConnection, direct ? styles.directText : styles.networkText]}>
          {isRoot ? "Sua posicao inicial" : `${connectionLabel(person)} - nivel ${person.level}`}
        </Text>
      </View>
      <View style={[styles.focusStatus, person.qualified ? styles.focusStatusReady : styles.focusStatusLocked]}>
        <Ionicons color={person.qualified ? colors.primaryDark : "#64748B"} name={person.qualified ? "checkmark-circle" : "lock-closed"} size={17} />
        <Text style={[styles.focusStatusText, !person.qualified && styles.focusStatusTextLocked]}>{person.qualified ? "Apto" : "Bloqueado"}</Text>
      </View>
    </View>
  );
}

function GenerationColumn({ generation, generationNumber, last, onSelect }) {
  return (
    <View style={styles.generationColumn}>
      <View style={styles.generationHeader}>
        <View style={styles.generationNumber}><Text style={styles.generationNumberText}>+{generationNumber}</Text></View>
        <View style={styles.generationHeaderCopy}>
          <Text style={styles.generationTitle}>{generationNumber === 1 ? "Proximo nivel" : "Nivel seguinte"}</Text>
          <Text style={styles.generationCount}>{generation.length} {generation.length === 1 ? "pessoa" : "pessoas"}</Text>
        </View>
        <Ionicons color={colors.primaryLight} name="arrow-forward" size={18} />
      </View>
      <View style={styles.generationList}>
        {generation.length ? generation.map((item) => (
          <BranchPersonCard key={item.person.id} last={last} onPress={() => onSelect(item.person)} parentName={item.parentName} person={item.person} />
        )) : (
          <View style={styles.generationEmpty}>
            <Ionicons color={colors.textMuted} name="remove-outline" size={18} />
            <Text style={styles.generationEmptyText}>Nenhuma conexao neste nivel</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function BranchPersonCard({ last, onPress, parentName, person }) {
  const direct = isDirectConnection(person);
  return (
    <Pressable accessibilityHint="Coloca esta pessoa em foco e mostra mais dois niveis" accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.personCard, pressed && styles.personCardPressed]}>
      <View style={[styles.personRail, direct ? styles.personRailDirect : styles.personRailNetwork]} />
      <PersonAvatar person={person} />
      <View style={styles.personCopy}>
        <Text numberOfLines={1} style={styles.personName}>{person.name}</Text>
        <Text numberOfLines={1} style={styles.personMeta}>{parentName ? `Abaixo de ${parentName}` : connectionLabel(person)}</Text>
        {last ? <Text style={styles.advanceText}>Toque para avancar +2</Text> : null}
      </View>
      <View style={styles.personAction}>
        {!person.qualified ? <Ionicons color="#64748B" name="lock-closed" size={12} /> : null}
        <Ionicons color={colors.primaryDark} name="chevron-forward" size={17} />
      </View>
    </Pressable>
  );
}

function PersonAvatar({ large = false, person, root = false }) {
  return (
    <View style={[styles.avatar, root ? styles.avatarRoot : isDirectConnection(person) ? styles.avatarDirect : styles.avatarNetwork, large && styles.avatarLarge]}>
      <Text style={[styles.avatarText, root && styles.avatarTextRoot, large && styles.avatarTextLarge]}>{personInitials(person.name)}</Text>
    </View>
  );
}

function Legend({ color, icon, label }) {
  return <View style={styles.legendItem}>{icon ? <Ionicons color="#64748B" name={icon} size={12} /> : <View style={[styles.legendDot, { backgroundColor: color }]} />}<Text style={styles.legendText}>{label}</Text></View>;
}

function LevelsTable({ levels }) {
  return (
    <View style={styles.levelTable}>
      <View style={styles.levelHeader}><Text style={[styles.levelHeaderText, styles.levelNumberColumn]}>Nivel</Text><Text style={styles.levelHeaderText}>Esquerda</Text><Text style={styles.levelHeaderText}>Direita</Text><Text style={styles.levelHeaderText}>Total</Text></View>
      {levels.map((level) => <View key={level.level} style={styles.levelRow}><Text style={[styles.levelNumberText, styles.levelNumberColumn]}>{level.level}</Text><Text style={styles.levelValue}>{level.left}</Text><Text style={styles.levelValue}>{level.right}</Text><Text style={styles.levelTotal}>{level.total}</Text></View>)}
    </View>
  );
}

function buildNetworkGraph(currentUser, people) {
  const root = { ...currentUser, level: 0, parentId: null, placementType: "RAIZ" };
  const peopleById = new Map([[root.id, root], ...people.map((person) => [person.id, person])]);
  const childrenByParent = new Map();
  people.forEach((person) => {
    const children = childrenByParent.get(person.parentId) ?? [];
    children.push(person);
    childrenByParent.set(person.parentId, children);
  });
  childrenByParent.forEach((children) => children.sort((first, second) => {
    if (first.position !== second.position) return (first.position ?? 0) - (second.position ?? 0);
    return first.name.localeCompare(second.name);
  }));
  return { childrenByParent, peopleById, root };
}

function buildVisibleLevels(focusId, childrenByParent, depth) {
  const result = [];
  let parents = [{ id: focusId, name: null }];
  for (let index = 0; index < depth; index += 1) {
    const generation = parents.flatMap((parent) => (childrenByParent.get(parent.id) ?? []).map((person) => ({ parentName: parent.name, person })));
    result.push(generation);
    parents = generation.map(({ person }) => ({ id: person.id, name: person.name }));
  }
  return result;
}

const styles = StyleSheet.create({
  advanceText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9, fontWeight: "700", marginTop: 3 },
  avatar: { alignItems: "center", borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  avatarDirect: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderWidth: 1 },
  avatarLarge: { height: 52, width: 52 },
  avatarNetwork: { backgroundColor: colors.infoSoft, borderColor: "#BFDBFE", borderWidth: 1 },
  avatarRoot: { backgroundColor: colors.primaryDark },
  avatarText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 11, fontWeight: "800" },
  avatarTextLarge: { fontSize: typography.label },
  avatarTextRoot: { color: colors.card },
  branchEmpty: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: radius.lg, flexDirection: "row", gap: spacing.md, margin: spacing.md, padding: spacing.md },
  branchEmptyCopy: { flex: 1, gap: 2 },
  branchEmptyIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  branchEmptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  branchEmptyTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  browser: { backgroundColor: "#F7F9F8", borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  browserPath: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.xs, minWidth: 0 },
  browserPathText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  browserToolbar: { alignItems: "center", backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.sm },
  detailsButton: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md },
  detailsButtonCopy: { flex: 1, gap: 2 },
  detailsButtonIcon: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  detailsButtonText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  detailsButtonTitle: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  directText: { color: colors.primaryDark },
  eyebrow: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  focusBack: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 36, justifyContent: "center", width: 36 },
  focusBackPlaceholder: { width: 4 },
  focusCard: { alignItems: "center", backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 86, padding: spacing.md },
  focusConnection: { fontFamily: fonts.medium, fontSize: 10 },
  focusCopy: { flex: 1, gap: 2, minWidth: 0 },
  focusEyebrow: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 9, fontWeight: "700" },
  focusName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
  focusStatus: { alignItems: "center", borderRadius: radius.round, flexDirection: "row", gap: 3, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  focusStatusLocked: { backgroundColor: "#F1F5F9" },
  focusStatusReady: { backgroundColor: colors.primarySoft },
  focusStatusText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9, fontWeight: "700" },
  focusStatusTextLocked: { color: "#64748B" },
  generationColumn: { borderRightColor: colors.border, borderRightWidth: 1, minWidth: 250, padding: spacing.sm, width: 278 },
  generationCount: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 9 },
  generationEmpty: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.md, flexDirection: "row", gap: spacing.xs, padding: spacing.md },
  generationEmptyText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10 },
  generationHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 42, paddingHorizontal: spacing.xs },
  generationHeaderCopy: { flex: 1, gap: 1 },
  generationList: { gap: spacing.xs },
  generationNumber: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 28, justifyContent: "center", width: 28 },
  generationNumberText: { color: colors.card, fontFamily: fonts.extraBold, fontSize: 10, fontWeight: "800" },
  generations: { alignItems: "stretch" },
  generationTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  header: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  headerCopy: { flex: 1, gap: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  legendDot: { borderRadius: radius.round, height: 8, width: 8 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 5 },
  legendText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 10 },
  levelHeader: { backgroundColor: colors.backgroundSoft, flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  levelHeaderText: { color: colors.textMuted, flex: 1, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700", textAlign: "center" },
  levelNumberColumn: { flex: 0.7 },
  levelNumberText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700", textAlign: "center" },
  levelRow: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", minHeight: 38, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  levelTable: { borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  levelTotal: { color: colors.primaryDark, flex: 1, fontFamily: fonts.extraBold, fontSize: typography.caption, fontWeight: "800", textAlign: "center" },
  levelValue: { color: colors.textPrimary, flex: 1, fontFamily: fonts.semiBold, fontSize: typography.caption, fontWeight: "600", textAlign: "center" },
  navigationHint: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, flexDirection: "row", gap: spacing.sm, padding: spacing.sm },
  navigationHintText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.medium, fontSize: 10, lineHeight: 15 },
  networkText: { color: colors.info },
  personAction: { alignItems: "center", flexDirection: "row", gap: 3 },
  personCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 62, overflow: "hidden", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, ...shadowSoft },
  personCardPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  personCopy: { flex: 1, minWidth: 0 },
  personMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 9, marginTop: 2 },
  personName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  personRail: { alignSelf: "stretch", marginBottom: -spacing.xs, marginLeft: -spacing.sm, marginTop: -spacing.xs, width: 4 },
  personRailDirect: { backgroundColor: colors.primary },
  personRailNetwork: { backgroundColor: colors.info },
  rootButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  rootButtonText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  surface: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  totalBubble: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 62, justifyContent: "center", width: 62 },
  totalLabel: { color: "#D1FAE5", fontFamily: fonts.medium, fontSize: 9 },
  totalValue: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
});
