import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { usePushNotifications } from "./PushNotificationsProvider";
import { colors, fonts, spacing } from "../utils/theme";

const messages = {
  ready: ["Notificações ativadas", "Seu aparelho está cadastrado para receber mensagens e chamados com o app fora da tela. Envie um teste para conferir."],
  quiet: ["Confira o som dos avisos", "As notificações estão permitidas, mas alguns avisos podem chegar sem som ou sem destaque. Confira os ajustes do celular."],
  denied: ["Ative as notificações", "Permita os avisos para receber mensagens e novos chamados ao sair do app."],
  error: ["Precisamos conferir seus avisos", "Não conseguimos preparar as notificações agora. Confira sua conexão e tente novamente."],
  "server-disabled": ["Avisos em preparação", "O envio de notificações precisa ser ativado pela equipe. Sua disponibilidade continua funcionando."],
  configuration: ["Avisos precisam de ajuste", "A equipe precisa conferir a configuração das notificações deste app. Entre em contato pelo suporte."],
  web: ["Avisos no navegador", "Sua disponibilidade continua ativa ao sair. Nesta versão, os avisos chegam enquanto a página está aberta. Notificações com o app fechado estão disponíveis no aplicativo instalado."],
  "expo-go": ["Use o aplicativo instalado", "Para testar notificações com o app fechado, use a versão instalada do Brasil Cashback."],
  simulator: ["Teste no seu celular", "As notificações precisam de um aparelho físico para serem verificadas."],
  idle: ["Notificações", "Preparando os avisos deste aparelho."],
  registering: ["Conferindo notificações…", "Estamos verificando as permissões e o cadastro deste aparelho."],
};

export function NotificationReadinessCard() {
  const push = usePushNotifications();
  if (!push) return null;
  const [title, message] = messages[push.status] ?? messages.error;
  const canTest = Boolean(push.token) && ["ready", "quiet", "configuration"].includes(push.status);
  const canActivate = ["denied", "quiet", "error"].includes(push.status);
  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Ionicons name={push.status === "ready" ? "notifications" : "notifications-outline"} size={22} color={colors.primaryDark} />
        <Text style={styles.title}>{title}</Text>
        {push.status === "registering" ? <ActivityIndicator color={colors.primaryDark} /> : null}
      </View>
      <Text style={styles.copy}>{message}</Text>
      {canTest || canActivate ? <View style={styles.actions}>
        {canActivate ? <Pressable accessibilityRole="button" onPress={push.activate} style={styles.button}><Text style={styles.buttonText}>{push.status === "error" ? "Tentar novamente" : push.status === "quiet" || !push.canAskAgain ? "Abrir ajustes" : "Ativar avisos"}</Text></Pressable> : null}
        {canTest ? <Pressable accessibilityRole="button" disabled={push.testing} onPress={push.test} style={styles.button}><Text style={styles.buttonText}>{push.testing ? "Solicitando…" : "Enviar teste"}</Text></Pressable> : null}
      </View> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: spacing.md, gap: 8 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, color: colors.textPrimary, fontFamily: fonts.semiBold, fontSize: 15 },
  copy: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primaryLight },
  buttonText: { color: colors.primaryDark, fontFamily: fonts.semiBold, fontSize: 13 },
});
