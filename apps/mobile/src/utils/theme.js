import { Platform } from "react-native";

export const colors = {
  accent: "#A3E635",
  background: "#F7F9F8",
  backgroundSoft: "#F1F6F3",
  border: "#E2E8E4",
  borderStrong: "#CDD8D1",
  card: "#FFFFFF",
  cardMuted: "#F3F6F4",
  danger: "#EF4444",
  dangerSoft: "#FEF2F2",
  info: "#2563EB",
  infoSoft: "#EFF6FF",
  primary: "#16A34A",
  primaryDark: "#07805C",
  primaryLight: "#DCFCE7",
  primarySoft: "#ECFDF5",
  success: "#22C55E",
  textMuted: "#78867D",
  textPrimary: "#142019",
  textSecondary: "#5E6D64",
  textWeak: "#78867D",
  warning: "#F59E0B",
  warningSoft: "#FFF7ED",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  round: 999,
};

export const shadow = Platform.select({
  android: {
    elevation: 1,
  },
  default: {
    shadowColor: "#14251C",
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  web: {
    boxShadow: "0 6px 18px rgba(20, 37, 28, 0.05)",
  },
});

export const shadowSoft = Platform.select({
  android: {
    elevation: 1,
  },
  default: {
    shadowColor: "#153B28",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
  },
  web: {
    boxShadow: "0 3px 10px rgba(21, 59, 40, 0.04)",
  },
});

export const layout = {
  contentMaxWidth: 560,
  pageGutter: spacing.lg,
  sectionGap: spacing.xl,
};

export const typography = {
  body: 15,
  caption: 12,
  h1: 28,
  h2: 21,
  h3: 17,
  label: 14,
  small: 13,
};

export const fonts = {
  bold: "Inter_700Bold",
  extraBold: "Inter_800ExtraBold",
  medium: "Inter_500Medium",
  regular: "Inter_400Regular",
  semiBold: "Inter_600SemiBold",
};
