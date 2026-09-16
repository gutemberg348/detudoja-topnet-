import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../../utils/theme";
import { isDirectConnection, personInitials } from "./network.utils";

const VISIBLE_GENERATIONS = 3;

export function NetworkMatrix({ currentUser, levels = [], onSelectPerson, people = [], selectedPerson }) {
  const graph = useMemo(() => buildNetworkGraph(currentUser, people), [currentUser, people]);
  const [focusId, setFocusId] = useState(graph.root.id);
  const focusPerson = graph.peopleById.get(focusId) ?? graph.root;
  const parent = graph.peopleById.get(focusPerson.parentId) ?? null;
  const visibleLevels = useMemo(
    () => buildVisibleLevels(focusPerson.id, graph.childrenByParent, VISIBLE_GENERATIONS),
    [focusPerson.id, graph.childrenByParent],
  );
  const hasDescendants = visibleLevels.some((generation) => generation.length);

  useEffect(() => {
    if (selectedPerson?.id && graph.peopleById.has(selectedPerson.id)) {
      setFocusId(selectedPerson.id);
    }
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
          <Text style={styles.eyebrow}>MAPA DA SUA REDE</Text>
          <Text style={styles.title}>Navegue para o lado</Text>
          <Text style={styles.subtitle}>Tres niveis por vez. Toque em qualquer bolinha para ela virar o novo inicio.</Text>
        </View>
        <View style={styles.totalBubble}><Text style={styles.totalValue}>{people.length}</Text><Text style={styles.totalLabel}>pessoas</Text></View>
      </View>

      <View style={styles.legend}>
        <Legend color={colors.primary} label="Indicacao direta" />
        <Legend color={colors.info} label="Rede" />
        <Legend icon="lock-closed" label="Ganho bloqueado" />
      </View>

      <View style={styles.toolbar}>
        <View style={styles.toolbarPerson}>
          <Ionicons color={colors.primaryDark} name="navigate-circle-outline" size={18} />
          <Text numberOfLines={1} style={styles.toolbarText}>{focusPerson.id === graph.root.id ? "Sua rede" : focusPerson.name}</Text>
        </View>
        {parent ? <Pressable accessibilityLabel="Voltar um nivel" onPress={() => selectFocus(parent)} style={styles.toolButton}><Ionicons color={colors.primaryDark} name="arrow-back" size={17} /></Pressable> : null}
        {focusPerson.id !== graph.root.id ? <Pressable accessibilityLabel="Voltar para minha raiz" onPress={() => selectFocus(graph.root)} style={styles.toolButton}><Ionicons color={colors.primaryDark} name="home-outline" size={17} /></Pressable> : null}
      </View>

      <ScrollView contentContainerStyle={styles.tree} horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.rootLane}>
          <Text style={styles.levelLabel}>INICIO</Text>
          <NetworkOrb large onPress={() => selectFocus(focusPerson)} person={focusPerson} root />
        </View>

        {visibleLevels.map((generation, index) => (
          <View key={`${focusPerson.id}-${index}`} style={styles.levelGroup}>
            <View style={styles.connector}><View style={styles.connectorLine} /><Ionicons color={colors.primaryLight} name="chevron-forward" size={16} /></View>
            <View style={styles.levelLane}>
              <Text style={styles.levelLabel}>NIVEL +{index + 1}</Text>
              <View style={styles.orbList}>
                {generation.length ? generation.map(({ parentName, person }) => (
                  <NetworkOrb key={person.id} last={index === VISIBLE_GENERATIONS - 1} onPress={() => selectFocus(person)} parentName={parentName} person={person} />
                )) : <EmptyLevel />}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {!hasDescendants ? (
        <View style={styles.emptyBranch}><Ionicons color={colors.primaryDark} name="leaf-outline" size={19} /><Text style={styles.emptyBranchText}>Essa pessoa ainda nao possui pessoas abaixo dela.</Text></View>
      ) : (
        <View style={styles.hint}><Ionicons color={colors.primaryDark} name="finger-print-outline" size={19} /><Text style={styles.hintText}>Chegou ao terceiro nivel? Toque em uma bolinha e ela abre os tres niveis seguintes.</Text></View>
      )}

      <LevelsTable levels={levels} />
    </View>
  );
}

function NetworkOrb({ large = false, last = false, onPress, parentName, person, root = false }) {
  const direct = root || isDirectConnection(person);
  return (
    <Pressable accessibilityHint="Coloca esta pessoa no inicio e mostra os tres niveis seguintes" accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.orbButton, large && styles.orbButtonLarge, pressed && styles.pressed]}>
      <View style={[styles.orbRing, direct ? styles.orbRingDirect : styles.orbRingNetwork, large && styles.orbRingLarge, root && styles.orbRingRoot]}>
        <View style={[styles.orb, direct ? styles.orbDirect : styles.orbNetwork, large && styles.orbLarge, root && styles.orbRoot]}>
          <Text style={[styles.orbInitials, large && styles.orbInitialsLarge, root && styles.orbInitialsRoot]}>{personInitials(person.name)}</Text>
          {!person.qualified ? <View style={styles.lock}><Ionicons color={colors.card} name="lock-closed" size={9} /></View> : null}
        </View>
      </View>
      <Text numberOfLines={2} style={[styles.personName, large && styles.personNameLarge]}>{root ? (person.level === 0 ? "Voce" : person.name) : person.name}</Text>
      {parentName ? <Text numberOfLines={1} style={styles.parentName}>de {parentName}</Text> : null}
      {last ? <View style={styles.openMore}><Text style={styles.openMoreText}>abrir +3</Text><Ionicons color={colors.primaryDark} name="arrow-forward" size={10} /></View> : null}
    </Pressable>
  );
}

function EmptyLevel() {
  return <View style={styles.emptyLevel}><View style={styles.emptyOrb}><Ionicons color={colors.textMuted} name="person-add-outline" size={20} /></View><Text style={styles.emptyLevelText}>Livre</Text></View>;
}

function Legend({ color, icon, label }) {
  return <View style={styles.legendItem}>{icon ? <Ionicons color="#64748B" name={icon} size={12} /> : <View style={[styles.legendDot, { backgroundColor: color }]} />}<Text style={styles.legendText}>{label}</Text></View>;
}

function LevelsTable({ levels }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => setOpen((current) => !current)} style={styles.detailsButton}>
        <View style={styles.detailsIcon}><Ionicons color={colors.primaryDark} name="analytics-outline" size={18} /></View>
        <View style={styles.detailsCopy}><Text style={styles.detailsTitle}>Resumo dos 20 niveis</Text><Text style={styles.detailsText}>Veja a ocupacao esquerda e direita</Text></View>
        <Ionicons color={colors.primaryDark} name={open ? "chevron-up" : "chevron-down"} size={20} />
      </Pressable>
      {open ? (
        <View style={styles.levelTable}>
          <View style={styles.levelHeader}><Text style={[styles.levelHeaderText, styles.levelNumberColumn]}>Nivel</Text><Text style={styles.levelHeaderText}>Esquerda</Text><Text style={styles.levelHeaderText}>Direita</Text><Text style={styles.levelHeaderText}>Total</Text></View>
          {levels.map((level) => <View key={level.level} style={styles.levelRow}><Text style={[styles.levelNumberText, styles.levelNumberColumn]}>{level.level}</Text><Text style={styles.levelValue}>{level.left}</Text><Text style={styles.levelValue}>{level.right}</Text><Text style={styles.levelTotal}>{level.total}</Text></View>)}
        </View>
      ) : null}
    </View>
  );
}

function buildNetworkGraph(currentUser, people) {
  const safeCurrentUser = currentUser ?? { id: "root", name: "Voce", qualified: false };
  const root = { ...safeCurrentUser, level: 0, parentId: null, placementType: "RAIZ" };
  const peopleById = new Map([[root.id, root], ...people.map((person) => [person.id, person])]);
  const childrenByParent = new Map();
  people.forEach((person) => {
    const children = childrenByParent.get(person.parentId) ?? [];
    children.push(person);
    childrenByParent.set(person.parentId, children);
  });
  childrenByParent.forEach((children) => children.sort((first, second) => (first.position ?? 0) - (second.position ?? 0) || first.name.localeCompare(second.name)));
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
  connector: { alignItems: "center", flexDirection: "row", marginHorizontal: 2, paddingTop: 84, width: 30 }, connectorLine: { backgroundColor: colors.primaryLight, height: 2, width: 14 }, detailsButton: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 54, paddingHorizontal: spacing.md }, detailsCopy: { flex: 1 }, detailsIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 }, detailsText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10 }, detailsTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  emptyBranch: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: radius.lg, flexDirection: "row", gap: spacing.sm, padding: spacing.md }, emptyBranchText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.regular, fontSize: typography.caption }, emptyLevel: { alignItems: "center", gap: 4, width: 76 }, emptyLevelText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 9 }, emptyOrb: { alignItems: "center", borderColor: colors.border, borderRadius: radius.round, borderStyle: "dashed", borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  eyebrow: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10 }, header: { alignItems: "center", flexDirection: "row", gap: spacing.md }, headerCopy: { flex: 1, gap: 3 }, hint: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, flexDirection: "row", gap: spacing.sm, padding: spacing.sm }, hintText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.medium, fontSize: 10, lineHeight: 15 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }, legendDot: { borderRadius: radius.round, height: 8, width: 8 }, legendItem: { alignItems: "center", flexDirection: "row", gap: 5 }, legendText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 10 }, levelGroup: { flexDirection: "row" }, levelLabel: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.8, marginBottom: spacing.sm, textAlign: "center" }, levelLane: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, minWidth: 112, paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  levelHeader: { backgroundColor: colors.backgroundSoft, flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, levelHeaderText: { color: colors.textMuted, flex: 1, fontFamily: fonts.bold, fontSize: 10, textAlign: "center" }, levelNumberColumn: { flex: 0.7 }, levelNumberText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: typography.caption, textAlign: "center" }, levelRow: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", minHeight: 38, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, levelTable: { borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, marginTop: spacing.sm, overflow: "hidden" }, levelTotal: { color: colors.primaryDark, flex: 1, fontFamily: fonts.extraBold, fontSize: typography.caption, textAlign: "center" }, levelValue: { color: colors.textPrimary, flex: 1, fontFamily: fonts.semiBold, fontSize: typography.caption, textAlign: "center" },
  lock: { alignItems: "center", backgroundColor: "#64748B", borderColor: colors.card, borderRadius: radius.round, borderWidth: 2, bottom: -3, height: 19, justifyContent: "center", position: "absolute", right: -5, width: 19 }, openMore: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: 2, marginTop: 3, paddingHorizontal: 6, paddingVertical: 2 }, openMoreText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 8 }, orb: { alignItems: "center", borderRadius: radius.round, height: 50, justifyContent: "center", width: 50 }, orbButton: { alignItems: "center", minHeight: 92, width: 84 }, orbButtonLarge: { minHeight: 112, width: 100 }, orbDirect: { backgroundColor: colors.primarySoft }, orbInitials: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 13 }, orbInitialsLarge: { fontSize: 17 }, orbInitialsRoot: { color: colors.card }, orbLarge: { height: 64, width: 64 }, orbList: { alignItems: "center", gap: spacing.md }, orbNetwork: { backgroundColor: colors.infoSoft }, orbRing: { alignItems: "center", borderRadius: radius.round, borderWidth: 2, height: 58, justifyContent: "center", width: 58 }, orbRingDirect: { borderColor: colors.primary }, orbRingLarge: { height: 72, width: 72 }, orbRingNetwork: { borderColor: colors.info }, orbRingRoot: { borderColor: colors.primaryDark }, orbRoot: { backgroundColor: colors.primaryDark },
  parentName: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 8, marginTop: 1, maxWidth: 78 }, personName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 10, lineHeight: 12, marginTop: 5, textAlign: "center" }, personNameLarge: { fontSize: typography.caption, lineHeight: 15 }, pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] }, rootLane: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, justifyContent: "flex-start", minWidth: 118, padding: spacing.md },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 }, surface: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md }, title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3 }, toolbar: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: radius.md, flexDirection: "row", gap: spacing.xs, minHeight: 42, paddingHorizontal: spacing.sm }, toolbarPerson: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.xs, minWidth: 0 }, toolbarText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.bold, fontSize: typography.caption }, toolButton: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 32, justifyContent: "center", width: 32 }, totalBubble: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 58, justifyContent: "center", width: 58 }, totalLabel: { color: "#D1FAE5", fontFamily: fonts.medium, fontSize: 8 }, totalValue: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.h3 }, tree: { alignItems: "flex-start", paddingBottom: spacing.xs, paddingRight: spacing.md },
});
