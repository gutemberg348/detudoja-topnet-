import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ForgotPasswordScreen } from "../app/ForgotPasswordScreen";
import { LoginScreen } from "../app/LoginScreen";
import { OnboardingScreen } from "../app/OnboardingScreen";
import { RegisterScreen } from "../app/RegisterScreen";
import { ResetPasswordScreen } from "../app/ResetPasswordScreen";
import { colors } from "../utils/theme";

const Stack = createNativeStackNavigator();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Onboarding"
      screenOptions={{
        animation: "slide_from_right",
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: "minimal",
        headerShown: false,
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
        headerTitle: "",
      }}
    >
      <Stack.Screen
        component={OnboardingScreen}
        name="Onboarding"
        options={{ headerShown: false }}
      />
      <Stack.Screen component={LoginScreen} name="Login" />
      <Stack.Screen component={RegisterScreen} name="Register" />
      <Stack.Screen component={ForgotPasswordScreen} name="ForgotPassword" />
      <Stack.Screen component={ResetPasswordScreen} name="ResetPassword" />
    </Stack.Navigator>
  );
}
