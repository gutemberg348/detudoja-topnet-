import { createNavigationContainerRef, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { CartScreen } from "../app/CartScreen";
import { CheckoutPaymentScreen } from "../app/CheckoutPaymentScreen";
import { CheckoutScreen } from "../app/CheckoutScreen";
import { CustomerOrderDetailsScreen } from "../app/CustomerOrderDetailsScreen";
import { CustomerOrdersScreen } from "../app/CustomerOrdersScreen";
import { ChargePaymentScreen } from "../app/ChargePaymentScreen";
import { ChargeQrScreen } from "../app/ChargeQrScreen";
import { ChargeScanScreen } from "../app/ChargeScanScreen";
import { GeneratedChargesHistoryScreen } from "../app/GeneratedChargesHistoryScreen";
import { ResetPasswordScreen } from "../app/ResetPasswordScreen";
import { GatewayPixPaymentScreen } from "../app/GatewayPixPaymentScreen";
import { KycVerificationScreen } from "../app/KycVerificationScreen";
import { OnlineOrderSuccessScreen } from "../app/OnlineOrderSuccessScreen";
import { PersonalChatsInboxScreen } from "../app/PersonalChatsInboxScreen";
import { PersonalConversationScreen } from "../app/PersonalConversationScreen";
import { FriendQrScanScreen } from "../app/FriendQrScanScreen";
import { ProductDetailsScreen } from "../app/ProductDetailsScreen";
import { SplashScreen } from "../app/SplashScreen";
import { StoreDetailsScreen } from "../app/StoreDetailsScreen";
import { StoreConversationScreen } from "../app/StoreConversationScreen";
import { StoreCourierRequestScreen } from "../app/StoreCourierRequestScreen";
import { StoreCourierTeamScreen } from "../app/StoreCourierTeamScreen";
import { StoreChatsInboxScreen } from "../app/StoreChatsInboxScreen";
import { StoreStaffQrScanScreen } from "../app/StoreStaffQrScanScreen";
import { StoreTeamScreen } from "../app/StoreTeamScreen";
import { ServiceProvidersScreen } from "../app/ServiceProvidersScreen";
import { ServiceConversationScreen } from "../app/ServiceConversationScreen";
import { ServiceDeskScreen } from "../app/ServiceDeskScreen";
import { ServiceInboxScreen } from "../app/ServiceInboxScreen";
import { SupportScreen } from "../app/SupportScreen";
import { WalletScreen } from "../app/WalletScreen";
import { WalletDepositScreen } from "../app/WalletDepositScreen";
import { WithdrawalScreen } from "../app/WithdrawalScreen";
import { BackHeader } from "../components/BackHeader";
import { useAuthStore } from "../stores/useAuthStore";
import { colors } from "../utils/theme";
import { AuthNavigator } from "./AuthNavigator";
import { MainTabs } from "./MainTabs";

const Stack = createNativeStackNavigator();
export const navigationRef = createNavigationContainerRef();

function backHeaderOptions(title) {
  return ({ navigation }) => ({
    headerBackVisible: false,
    headerLeft: () => (
      <BackHeader
        compact
        onPress={navigation.goBack}
        showTitle={false}
        title="Voltar"
      />
    ),
    headerTitle: title,
    headerTitleAlign: "center",
  });
}

const navigationTheme = {
  colors: {
    background: colors.background,
    border: colors.border,
    card: colors.card,
    notification: colors.danger,
    primary: colors.primary,
    text: colors.textPrimary,
  },
  dark: false,
  fonts: {
    bold: { fontFamily: "System", fontWeight: "700" },
    heavy: { fontFamily: "System", fontWeight: "800" },
    medium: { fontFamily: "System", fontWeight: "600" },
    regular: { fontFamily: "System", fontWeight: "400" },
  },
};

const linking = {
  config: {
    screens: {
      Register: "cadastro/loja/:storeSlug",
      InviteRegister: "cadastro/convite/:registrationCode",
      ResetPassword: "redefinir-senha",
      PersonalChatsInbox: "amigos",
      StoreStaffQrScan: "funcionario/aceitar",
    },
  },
  prefixes: ["detudoja://"],
};

function Routes() {
  const { isRestoring, session } = useAuthStore();

  if (isRestoring) {
    return <SplashScreen />;
  }

  if (!session) {
    return <AuthNavigator />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: "minimal",
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen
        component={MainTabs}
        name="Main"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        component={ResetPasswordScreen}
        name="ResetPassword"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        component={ServiceConversationScreen}
        name="ServiceConversation"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        component={PersonalChatsInboxScreen}
        name="PersonalChatsInbox"
        options={backHeaderOptions("Conversas")}
      />
      <Stack.Screen
        component={PersonalConversationScreen}
        name="PersonalConversation"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        component={FriendQrScanScreen}
        name="FriendQrScan"
        options={backHeaderOptions("Adicionar contato")}
      />
      <Stack.Screen
        component={ServiceProvidersScreen}
        name="ServiceProviders"
        options={backHeaderOptions("Prestadores")}
      />
      <Stack.Screen
        component={ServiceDeskScreen}
        name="ServiceDesk"
        options={backHeaderOptions("Servicos")}
      />
      <Stack.Screen
        component={ServiceInboxScreen}
        name="ServiceInbox"
        options={backHeaderOptions("Atendimentos")}
      />
      <Stack.Screen
        component={StoreDetailsScreen}
        name="StoreDetails"
        options={backHeaderOptions("Loja")}
      />
      <Stack.Screen
        component={StoreConversationScreen}
        name="StoreConversation"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        component={StoreCourierRequestScreen}
        name="StoreCourierRequest"
        options={backHeaderOptions("Solicitar entrega")}
      />
      <Stack.Screen
        component={StoreCourierTeamScreen}
        name="StoreCourierTeam"
        options={backHeaderOptions("Entregadores")}
      />
      <Stack.Screen
        component={StoreChatsInboxScreen}
        name="StoreChatsInbox"
        options={backHeaderOptions("Conversas")}
      />
      <Stack.Screen
        component={StoreTeamScreen}
        name="StoreTeam"
        options={backHeaderOptions("Equipe da loja")}
      />
      <Stack.Screen
        component={StoreStaffQrScanScreen}
        name="StoreStaffQrScan"
        options={backHeaderOptions("Convite de trabalho")}
      />
      <Stack.Screen
        component={ProductDetailsScreen}
        name="ProductDetails"
        options={backHeaderOptions("Produto")}
      />
      <Stack.Screen
        component={CartScreen}
        name="Cart"
        options={backHeaderOptions("Carrinho")}
      />
      <Stack.Screen
        component={CheckoutScreen}
        name="Checkout"
        options={backHeaderOptions("Finalizar pedido")}
      />
      <Stack.Screen
        component={CheckoutPaymentScreen}
        name="CheckoutPayment"
        options={backHeaderOptions("Pagamento")}
      />
      <Stack.Screen
        component={GatewayPixPaymentScreen}
        name="GatewayPixPayment"
        options={backHeaderOptions("Pagamento Pix")}
      />
      <Stack.Screen
        component={OnlineOrderSuccessScreen}
        name="OnlineOrderSuccess"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        component={CustomerOrdersScreen}
        name="CustomerOrders"
        options={backHeaderOptions("Meus pedidos")}
      />
      <Stack.Screen
        component={CustomerOrderDetailsScreen}
        name="CustomerOrderDetails"
        options={backHeaderOptions("Pedido")}
      />
      <Stack.Screen
        component={WalletScreen}
        name="Carteira"
        options={backHeaderOptions("Carteira")}
      />
      <Stack.Screen
        component={WalletDepositScreen}
        name="WalletDeposit"
        options={backHeaderOptions("Adicionar saldo")}
      />
      <Stack.Screen
        component={WithdrawalScreen}
        name="Withdrawal"
        options={backHeaderOptions("Sacar")}
      />
      <Stack.Screen
        component={SupportScreen}
        name="Suporte"
        options={backHeaderOptions("Suporte")}
      />
      <Stack.Screen
        component={KycVerificationScreen}
        name="KycVerification"
        options={backHeaderOptions("Verificar identidade")}
      />
      <Stack.Screen
        component={ChargeScanScreen}
        name="ChargeScan"
        options={backHeaderOptions("Ler cobranca")}
      />
      <Stack.Screen
        component={ChargePaymentScreen}
        name="ChargePayment"
        options={backHeaderOptions("Pagar")}
      />
      <Stack.Screen
        component={ChargeQrScreen}
        name="ChargeQr"
        options={backHeaderOptions("Receber")}
      />
      <Stack.Screen
        component={GeneratedChargesHistoryScreen}
        name="GeneratedChargesHistory"
        options={backHeaderOptions("Cobrancas")}
      />
    </Stack.Navigator>
  );
}

export function AppNavigator({ onRouteChange }) {
  const syncCurrentRoute = () => {
    onRouteChange?.(navigationRef.getCurrentRoute()?.name ?? "");
  };

  return (
    <NavigationContainer
      linking={linking}
      onReady={syncCurrentRoute}
      onStateChange={syncCurrentRoute}
      ref={navigationRef}
      theme={navigationTheme}
    >
      <Routes />
    </NavigationContainer>
  );
}
