import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../../utils/theme";
import { connectionLabel, isDirectConnection, personInitials } from "./network.utils";

export function NetworkMatrix({ currentUser, levels, onSelectPerson, people, selectedPerson }) {
  const minZoom = 0.65;
  const maxZoom = 1.45;
  const zoomStep = 0.15;
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [treeDepth, setTreeDepth] = useState(4);
  const [zoom, setZoom] = useState(1);
  const pan = useRef(new Animated.ValueXY()).current;
  const panPosition = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const visibleTreePeople = useMemo(
    () => people.filter((person) => person.level <= treeDepth),
    [people, treeDepth],
  );
  const tree = useMemo(
    () => buildMatrixTree(currentUser, visibleTreePeople),
    [currentUser, visibleTreePeople],
  );
  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.numberActiveTouches === 1
        && (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4),
      onPanResponderGrant: () => {
        panStart.current = { ...panPosition.current };
        setDragging(true);
      },
      onPanResponderMove: (_event, gesture) => {
        if (gesture.numberActiveTouches !== 1) {
          return;
        }

        const nextPosition = {
          x: panStart.current.x + gesture.dx,
          y: panStart.current.y + gesture.dy,
        };
        panPosition.current = nextPosition;
        pan.setValue(nextPosition);
      },
      onPanResponderRelease: () => {
        setDragging(false);
      },
      onPanResponderTerminate: () => {
        setDragging(false);
      },
      onPanResponderTerminationRequest: () => true,
    }),
    [pan],
  );

  function resetViewport() {
    panPosition.current = { x: 0, y: 0 };
    panStart.current = { x: 0, y: 0 };
    pan.setValue({ x: 0, y: 0 });
    setZoom(1);
  }

  function changeZoom(amount) {
    setZoom((currentZoom) => Math.max(minZoom, Math.min(maxZoom, currentZoom + amount)));
  }

  function changeDepth(depth) {
    setTreeDepth(depth);
    resetViewport();
  }

  return (
    <View style={styles.surface}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>MAPA DA SUA REDE</Text>
          <Text style={styles.title}>Conexoes em tempo real</Text>
          <Text style={styles.subtitle}>Toque em uma bolinha para entender a ligacao.</Text>
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

      <View style={styles.depthControl}>
        <Text style={styles.depthLabel}>Visualizar</Text>
        {[4, 8, 20].map((depth) => {
          const active = treeDepth === depth;
          return (
            <Pressable
              key={depth}
              accessibilityRole="button"
              onPress={() => changeDepth(depth)}
              style={[styles.depthOption, active && styles.depthOptionActive]}
            >
              <Text style={[styles.depthOptionText, active && styles.depthOptionTextActive]}>
                {depth === 20 ? "Todos" : `${depth} niveis`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        {...panResponder.panHandlers}
        style={[styles.treeViewport, dragging && styles.treeViewportDragging]}
      >
        <View style={styles.viewportToolbar}>
          <View style={styles.viewportHint}>
            <Ionicons color={colors.primaryDark} name="hand-left-outline" size={15} />
            <Text style={styles.viewportHintText}>Arraste para explorar</Text>
          </View>
          <View style={styles.zoomControls}>
            <Pressable
              accessibilityLabel="Diminuir zoom da matriz"
              disabled={zoom <= minZoom}
              onPress={() => changeZoom(-zoomStep)}
              style={[styles.zoomButton, zoom <= minZoom && styles.zoomButtonDisabled]}
            >
              <Ionicons color={colors.primaryDark} name="remove" size={18} />
            </Pressable>
            <Text style={styles.zoomValue}>{Math.round(zoom * 100)}%</Text>
            <Pressable
              accessibilityLabel="Aumentar zoom da matriz"
              disabled={zoom >= maxZoom}
              onPress={() => changeZoom(zoomStep)}
              style={[styles.zoomButton, zoom >= maxZoom && styles.zoomButtonDisabled]}
            >
              <Ionicons color={colors.primaryDark} name="add" size={18} />
            </Pressable>
            <Pressable
              accessibilityLabel="Centralizar matriz"
              onPress={resetViewport}
              style={styles.zoomResetButton}
            >
              <Ionicons color={colors.primaryDark} name="scan-outline" size={16} />
            </Pressable>
          </View>
        </View>
        <View style={styles.treeClip}>
          <Animated.View
            style={[
              styles.treeCanvas,
              { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }] },
            ]}
          >
            <MatrixTreeNode
              node={tree}
              onSelectPerson={onSelectPerson}
              root
              selectedId={selectedPerson?.id}
            />
          </Animated.View>
        </View>
      </View>

      {people.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><Ionicons color={colors.primaryDark} name="git-network-outline" size={22} /></View>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>Sua matriz esta pronta</Text>
            <Text style={styles.emptyText}>Convide as primeiras pessoas para ocupar os dois lados.</Text>
          </View>
        </View>
      ) : null}

      {selectedPerson ? <SelectedMember person={selectedPerson} /> : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => setDetailsVisible((visible) => !visible)}
        style={styles.detailsButton}
      >
        <View style={styles.detailsButtonIcon}>
          <Ionicons color={colors.primaryDark} name="analytics-outline" size={18} />
        </View>
        <View style={styles.detailsButtonCopy}>
          <Text style={styles.detailsButtonTitle}>Distribuicao por nivel</Text>
          <Text style={styles.detailsButtonText}>Veja os 20 niveis da matriz</Text>
        </View>
        <Ionicons color={colors.primaryDark} name={detailsVisible ? "chevron-up" : "chevron-down"} size={20} />
      </Pressable>

      {detailsVisible ? <LevelsTable levels={levels} /> : null}
    </View>
  );
}

function Legend({ color, icon, label }) {
  return (
    <View style={styles.legendItem}>
      {icon ? (
        <Ionicons color="#64748B" name={icon} size={12} />
      ) : (
        <View style={[styles.legendDot, { backgroundColor: color }]} />
      )}
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function MatrixTreeNode({ node, onSelectPerson, root = false, selectedId }) {
  const hasChildren = node.children.length > 0;

  return (
    <View style={styles.nodeColumn}>
      <Pressable
        accessibilityHint={root ? "Sua posicao na matriz" : "Abre os dados desta pessoa"}
        accessibilityRole="button"
        disabled={root}
        onPress={() => onSelectPerson(node.person)}
        style={styles.nodePressable}
      >
        <MatrixBubble person={node.person} root={root} selected={selectedId === node.person.id} />
      </Pressable>

      {hasChildren ? (
        <>
          <View style={styles.downLine} />
          <View style={styles.childrenRow}>
            {node.children.map((child, index) => (
              <View key={child.person.id} style={styles.childColumn}>
                <View
                  style={[
                    styles.branchLine,
                    index === 0 ? styles.branchLineLeft : styles.branchLineRight,
                  ]}
                />
                <MatrixTreeNode
                  node={child}
                  onSelectPerson={onSelectPerson}
                  selectedId={selectedId}
                />
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function MatrixBubble({ person, root, selected }) {
  const direct = isDirectConnection(person) || root;
  const blocked = !person.qualified;

  return (
    <View style={styles.bubbleWrap}>
      <View
        style={[
          styles.bubbleHalo,
          root && styles.bubbleHaloRoot,
          selected && styles.bubbleHaloSelected,
          direct ? styles.bubbleHaloDirect : styles.bubbleHaloNetwork,
        ]}
      >
        <View style={[styles.bubble, root && styles.bubbleRoot, !person.active && styles.bubbleInactive]}>
          <Text style={[styles.bubbleInitials, root && styles.bubbleInitialsRoot]}>
            {personInitials(person.name)}
          </Text>
        </View>
        {!root ? (
          <View style={[styles.bubbleStatus, blocked ? styles.bubbleStatusLocked : styles.bubbleStatusReady]}>
            <Ionicons color={colors.card} name={blocked ? "lock-closed" : "checkmark"} size={11} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.bubbleName, root && styles.bubbleNameRoot]}>
        {root ? "Voce" : person.name}
      </Text>
      <Text style={[styles.bubbleConnection, direct ? styles.bubbleConnectionDirect : styles.bubbleConnectionNetwork]}>
        {root ? "Sua posicao" : connectionLabel(person)}
      </Text>
    </View>
  );
}

function SelectedMember({ person }) {
  const direct = isDirectConnection(person);

  return (
    <View style={styles.selectedMember}>
      <View style={[styles.selectedMemberIcon, direct ? styles.selectedMemberIconDirect : styles.selectedMemberIconNetwork]}>
        <Ionicons color={direct ? colors.primaryDark : colors.info} name={direct ? "link-outline" : "git-network-outline"} size={19} />
      </View>
      <View style={styles.selectedMemberCopy}>
        <Text style={styles.selectedMemberName}>{person.name}</Text>
        <Text style={styles.selectedMemberText}>
          {connectionLabel(person)} - nivel {person.level} - {person.qualified ? "apto a ganhos" : "ganho bloqueado"}
        </Text>
      </View>
      <Ionicons color={colors.primaryDark} name="arrow-down" size={18} />
    </View>
  );
}

function LevelsTable({ levels }) {
  return (
    <View style={styles.levelTable}>
      <View style={styles.levelHeader}>
        <Text style={[styles.levelHeaderText, styles.levelNumberColumn]}>Nivel</Text>
        <Text style={styles.levelHeaderText}>Esquerda</Text>
        <Text style={styles.levelHeaderText}>Direita</Text>
        <Text style={styles.levelHeaderText}>Total</Text>
      </View>
      {levels.map((level) => (
        <View key={level.level} style={styles.levelRow}>
          <Text style={[styles.levelNumber, styles.levelNumberColumn]}>{level.level}</Text>
          <Text style={styles.levelValue}>{level.left}</Text>
          <Text style={styles.levelValue}>{level.right}</Text>
          <Text style={styles.levelTotal}>{level.total}</Text>
        </View>
      ))}
    </View>
  );
}

function buildMatrixTree(currentUser, people) {
  const childrenByParent = new Map();

  people.forEach((person) => {
    const children = childrenByParent.get(person.parentId) ?? [];
    children.push(person);
    childrenByParent.set(person.parentId, children);
  });

  childrenByParent.forEach((children) => {
    children.sort((first, second) => {
      if (first.position !== second.position) {
        return (first.position ?? 0) - (second.position ?? 0);
      }

      return first.name.localeCompare(second.name);
    });
  });

  function createNode(person) {
    return {
      children: (childrenByParent.get(person.id) ?? []).map(createNode),
      person,
    };
  }

  return createNode({ ...currentUser, placementType: "RAIZ" });
}

const styles = StyleSheet.create({
  branchLine: { backgroundColor: colors.primaryLight, height: 2, position: "absolute", top: 0 },
  branchLineLeft: { left: 0, right: "50%" },
  branchLineRight: { left: "50%", right: 0 },
  bubble: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 52, justifyContent: "center", width: 52 },
  bubbleConnection: { fontFamily: fonts.bold, fontSize: 9, fontWeight: "700", textAlign: "center" },
  bubbleConnectionDirect: { color: colors.primaryDark },
  bubbleConnectionNetwork: { color: colors.info },
  bubbleHalo: { alignItems: "center", borderRadius: radius.round, borderWidth: 2, height: 64, justifyContent: "center", position: "relative", width: 64 },
  bubbleHaloDirect: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight },
  bubbleHaloNetwork: { backgroundColor: colors.infoSoft, borderColor: "#BFDBFE" },
  bubbleHaloRoot: { borderColor: "#8AE6B0", height: 76, width: 76 },
  bubbleHaloSelected: { borderColor: colors.primary, borderWidth: 3 },
  bubbleInactive: { backgroundColor: colors.cardMuted },
  bubbleInitials: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
  bubbleInitialsRoot: { color: colors.card },
  bubbleName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700", maxWidth: 86, textAlign: "center" },
  bubbleNameRoot: { fontSize: typography.caption },
  bubbleRoot: { backgroundColor: colors.primaryDark, height: 62, width: 62 },
  bubbleStatus: { alignItems: "center", borderColor: colors.card, borderRadius: radius.round, borderWidth: 2, bottom: -2, height: 20, justifyContent: "center", position: "absolute", right: -3, width: 20 },
  bubbleStatusLocked: { backgroundColor: "#64748B" },
  bubbleStatusReady: { backgroundColor: colors.primary },
  bubbleWrap: { alignItems: "center", gap: 4, minWidth: 94 },
  childColumn: { alignItems: "center", minWidth: 110, paddingTop: spacing.lg },
  childrenRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "center", paddingTop: 1 },
  detailsButton: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md },
  detailsButtonCopy: { flex: 1, gap: 2 },
  detailsButtonIcon: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  detailsButtonText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  detailsButtonTitle: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  downLine: { backgroundColor: colors.primaryLight, height: 22, marginTop: spacing.xs, width: 2 },
  depthControl: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.lg, flexDirection: "row", gap: spacing.xs, padding: spacing.xs },
  depthLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10, marginHorizontal: spacing.xs },
  depthOption: { alignItems: "center", borderRadius: 10, justifyContent: "center", minHeight: 32, paddingHorizontal: spacing.sm },
  depthOptionActive: { backgroundColor: colors.card, ...shadowSoft },
  depthOptionText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  depthOptionTextActive: { color: colors.primaryDark },
  emptyCopy: { flex: 1, gap: 2 },
  emptyIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  emptyState: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: radius.lg, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  eyebrow: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  header: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  headerCopy: { flex: 1, gap: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  legendDot: { borderRadius: radius.round, height: 8, width: 8 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 5 },
  legendText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 10 },
  levelHeader: { backgroundColor: colors.backgroundSoft, flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  levelHeaderText: { color: colors.textMuted, flex: 1, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700", textAlign: "center", textTransform: "uppercase" },
  levelNumber: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700", textAlign: "center" },
  levelNumberColumn: { flex: 0.7 },
  levelRow: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", minHeight: 38, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  levelTable: { borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  levelTotal: { color: colors.primaryDark, flex: 1, fontFamily: fonts.extraBold, fontSize: typography.caption, fontWeight: "800", textAlign: "center" },
  levelValue: { color: colors.textPrimary, flex: 1, fontFamily: fonts.semiBold, fontSize: typography.caption, fontWeight: "600", textAlign: "center" },
  nodeColumn: { alignItems: "center", minWidth: 110 },
  nodePressable: { borderRadius: radius.round },
  selectedMember: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.lg, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  selectedMemberCopy: { flex: 1, gap: 2, minWidth: 0 },
  selectedMemberIcon: { alignItems: "center", borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  selectedMemberIconDirect: { backgroundColor: colors.primarySoft },
  selectedMemberIconNetwork: { backgroundColor: colors.infoSoft },
  selectedMemberName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  selectedMemberText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  surface: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.lg, padding: spacing.md },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  totalBubble: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 62, justifyContent: "center", width: 62 },
  totalLabel: { color: "#D1FAE5", fontFamily: fonts.medium, fontSize: 9 },
  totalValue: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  treeCanvas: { alignItems: "center", minWidth: 320, paddingBottom: spacing.md, paddingHorizontal: spacing.md },
  treeClip: { minHeight: 176, overflow: "hidden", paddingBottom: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  treeViewport: {
    backgroundColor: "#F7F9F8",
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    ...Platform.select({ web: { cursor: "grab", touchAction: "none", userSelect: "none" } }),
  },
  treeViewportDragging: Platform.select({ web: { cursor: "grabbing" } }),
  viewportHint: { alignItems: "center", flexDirection: "row", gap: 5 },
  viewportHintText: { color: colors.primaryDark, fontFamily: fonts.medium, fontSize: 10 },
  viewportToolbar: { alignItems: "center", backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", minHeight: 44, paddingHorizontal: spacing.sm },
  zoomButton: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, height: 28, justifyContent: "center", width: 28 },
  zoomButtonDisabled: { opacity: 0.4 },
  zoomControls: { alignItems: "center", flexDirection: "row", gap: 3 },
  zoomResetButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 28, justifyContent: "center", marginLeft: spacing.xs, width: 28 },
  zoomValue: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, minWidth: 34, textAlign: "center" },
});
