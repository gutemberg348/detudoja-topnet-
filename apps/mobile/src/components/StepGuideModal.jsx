import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton } from "./AppButton";
import {
  colors,
  fonts,
  radius,
  shadow,
  spacing,
  typography,
} from "../utils/theme";

export function StepGuideModal({
  headerIcon = "school-outline",
  headerKicker,
  headerSubtitle,
  headerTitle,
  initialKey,
  onClose,
  onRunAction,
  open,
  sections,
}) {
  const [activeKey, setActiveKey] = useState(initialKey ?? sections[0]?.key);

  useEffect(() => {
    if (open) setActiveKey(initialKey ?? sections[0]?.key);
  }, [initialKey, open, sections]);

  const activeIndex = Math.max(
    0,
    sections.findIndex((section) => section.key === activeKey),
  );
  const section = sections[activeIndex];

  if (!section) return null;

  function goToSection(index) {
    const target = sections[index];
    if (target) setActiveKey(target.key);
  }

  function runAction() {
    const action = section.action;
    onClose();
    setTimeout(() => onRunAction?.(action), 180);
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons color={colors.card} name={headerIcon} size={22} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>{headerKicker}</Text>
              <Text style={styles.title}>{headerTitle}</Text>
              <Text style={styles.headerText}>{headerSubtitle}</Text>
            </View>
            <Pressable
              accessibilityLabel={`Fechar ${headerKicker}`}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Ionicons color={colors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            <ScrollView
              contentContainerStyle={styles.tabs}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {sections.map((item) => {
                const active = item.key === section.key;

                return (
                  <Pressable
                    accessibilityRole="tab"
                    key={item.key}
                    onPress={() => setActiveKey(item.key)}
                    style={[styles.tab, active && styles.tabActive]}
                  >
                    <Ionicons
                      color={active ? colors.card : colors.primaryDark}
                      name={item.icon}
                      size={16}
                    />
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sectionHeader}>
              <View style={styles.progressRow}>
                <Text style={styles.progressText}>
                  Etapa {activeIndex + 1} de {sections.length}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressValue,
                      { width: `${((activeIndex + 1) / sections.length) * 100}%` },
                    ]}
                  />
                </View>
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
            </View>

            {section.highlights?.length ? (
              <View style={styles.highlights}>
                {section.highlights.map((highlight) => (
                  <View key={highlight.title} style={styles.highlight}>
                    <View style={styles.highlightIcon}>
                      <Ionicons color={colors.primaryDark} name={highlight.icon} size={19} />
                    </View>
                    <Text style={styles.highlightTitle}>{highlight.title}</Text>
                    <Text style={styles.highlightText}>{highlight.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {section.notice ? (
              <View style={styles.notice}>
                <View style={styles.noticeIcon}>
                  <Ionicons color="#9A5A00" name={section.notice.icon ?? "alert-circle-outline"} size={20} />
                </View>
                <View style={styles.noticeCopy}>
                  <Text style={styles.noticeTitle}>{section.notice.title}</Text>
                  <Text style={styles.noticeText}>{section.notice.text}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.steps}>
              {section.steps.map((step, index) => (
                <View key={step.title} style={styles.step}>
                  <View style={styles.stepRail}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{index + 1}</Text>
                    </View>
                    {index < section.steps.length - 1 ? <View style={styles.stepLine} /> : null}
                  </View>
                  <View style={styles.stepCopy}>
                    <View style={styles.stepTitleRow}>
                      <Ionicons color={colors.primaryDark} name={step.icon} size={17} />
                      <Text style={styles.stepTitle}>{step.title}</Text>
                    </View>
                    <Text style={styles.stepText}>{step.text}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.tip}>
              <Ionicons color={colors.primaryDark} name="bulb-outline" size={20} />
              <Text style={styles.tipText}>{section.tip}</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {section.action ? (
              <AppButton
                icon={section.actionIcon}
                onPress={runAction}
                style={styles.footerAction}
                title={section.actionLabel}
              />
            ) : null}

            <View style={styles.footerNavigation}>
              <Pressable
                accessibilityLabel="Voltar uma etapa do guia"
                disabled={activeIndex === 0}
                onPress={() => goToSection(activeIndex - 1)}
                style={({ pressed }) => [
                  styles.navigationButton,
                  activeIndex === 0 && styles.navigationButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons color={colors.primaryDark} name="arrow-back" size={17} />
                <Text style={styles.navigationText}>Anterior</Text>
              </Pressable>

              <Text style={styles.navigationCount}>{activeIndex + 1}/{sections.length}</Text>

              <Pressable
                accessibilityLabel={activeIndex === sections.length - 1 ? "Concluir guia" : "Avancar uma etapa do guia"}
                onPress={() => {
                  if (activeIndex === sections.length - 1) {
                    onClose();
                    return;
                  }
                  goToSection(activeIndex + 1);
                }}
                style={({ pressed }) => [styles.navigationButton, styles.navigationButtonPrimary, pressed && styles.pressed]}
              >
                <Text style={[styles.navigationText, styles.navigationTextPrimary]}>
                  {activeIndex === sections.length - 1 ? "Concluir" : "Proximo"}
                </Text>
                <Ionicons
                  color={colors.card}
                  name={activeIndex === sections.length - 1 ? "checkmark" : "arrow-forward"}
                  size={17}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: "center", backgroundColor: "rgba(15, 23, 42, 0.48)", flex: 1, justifyContent: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.lg },
  closeButton: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.round, height: 36, justifyContent: "center", width: 36 },
  footer: { backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm, padding: spacing.md },
  footerAction: { width: "100%" },
  footerNavigation: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  header: { alignItems: "center", backgroundColor: "#FAFCFB", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.lg, height: 40, justifyContent: "center", width: 40 },
  headerText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  highlight: { alignItems: "center", backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flex: 1, gap: spacing.xs, minWidth: 82, padding: spacing.sm },
  highlightIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  highlights: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  highlightText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 9, lineHeight: 13, textAlign: "center" },
  highlightTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700", textAlign: "center" },
  kicker: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  modal: { backgroundColor: colors.card, borderRadius: 16, maxHeight: "92%", maxWidth: 520, overflow: "hidden", width: "100%", ...shadow },
  navigationButton: { alignItems: "center", borderRadius: radius.round, flexDirection: "row", gap: spacing.xs, minHeight: 38, paddingHorizontal: spacing.md },
  navigationButtonDisabled: { opacity: 0.3 },
  navigationButtonPrimary: { backgroundColor: colors.primaryDark },
  navigationCount: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: typography.caption },
  navigationText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  navigationTextPrimary: { color: colors.card },
  notice: { alignItems: "flex-start", backgroundColor: "#FFF8E8", borderColor: "#F2D392", borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  noticeCopy: { flex: 1, gap: 3 },
  noticeIcon: { alignItems: "center", backgroundColor: "#FFF0C7", borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  noticeText: { color: "#72521F", fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18 },
  noticeTitle: { color: "#6B4700", fontFamily: fonts.extraBold, fontSize: typography.small, fontWeight: "800" },
  pressed: { opacity: 0.78 },
  progressRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  progressText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  progressTrack: { backgroundColor: colors.cardMuted, borderRadius: radius.round, flex: 1, height: 5, overflow: "hidden" },
  progressValue: { backgroundColor: colors.primary, borderRadius: radius.round, height: "100%" },
  scroll: { flexShrink: 1 },
  scrollContent: { gap: spacing.lg, padding: spacing.md },
  sectionHeader: { gap: spacing.sm },
  sectionSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20 },
  sectionTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  step: { flexDirection: "row", gap: spacing.md },
  stepCopy: { flex: 1, gap: spacing.xs, paddingBottom: spacing.md },
  stepLine: { backgroundColor: colors.primaryLight, flex: 1, marginTop: spacing.xs, width: 2 },
  stepNumber: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, height: 30, justifyContent: "center", width: 30 },
  stepNumberText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.caption, fontWeight: "800" },
  stepRail: { alignItems: "center", width: 30 },
  steps: { gap: 0 },
  stepText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18 },
  stepTitle: { color: colors.textPrimary, flex: 1, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  stepTitleRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  tab: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: spacing.xs, minHeight: 34, paddingHorizontal: spacing.sm },
  tabActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  tabs: { gap: spacing.sm, paddingRight: spacing.lg },
  tabText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  tabTextActive: { color: colors.card },
  tip: { alignItems: "flex-start", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  tipText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption, lineHeight: 18 },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
});
