import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import BrandLogo from "../../components/BrandLogo/BrandLogo";
import { SPLASH_DURATION_MS } from "../../constants/config";
import type { RootStackParamList } from "../../navigation/types";
import { restoreSession } from "../../services/authSession";

type SplashScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "Splash"
>;

export default function SplashScreen({ navigation }: SplashScreenProps) {
  useEffect(() => {
    let isMounted = true;

    async function prepareApp() {
      const [role] = await Promise.all([
        restoreSession(),
        new Promise((resolve) => setTimeout(resolve, SPLASH_DURATION_MS)),
      ]);

      if (isMounted) {
        navigation.replace(
          role === "ADMIN"
            ? "AdminDashboard"
            : role === "EMPLOYEE"
              ? "EmployeeDashboard"
              : "Login",
        );
      }
    }

    void prepareApp();

    return () => {
      isMounted = false;
    };
  }, [navigation]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar style="dark" />
      <View className="flex-1 items-center justify-center px-6">
        <BrandLogo className="h-52 w-full max-w-sm" />
      </View>
      <View className="h-1.5 w-full bg-wind-500" />
    </SafeAreaView>
  );
}
