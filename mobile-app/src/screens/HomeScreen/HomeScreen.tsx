import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppCard from "../../components/AppCard";
import { getHealthStatus } from "../../services/api";
import type { HealthStatus } from "../../types/api";

export default function HomeScreen() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getHealthStatus()
      .then((result) => {
        if (isMounted) {
          setHealth(result);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Backend unavailable");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-wind-50">
      <StatusBar style="dark" />
      <View className="flex-1 justify-center px-6">
        <Text className="mb-2 text-xs font-bold tracking-[2px] text-cyan-400">
          WINDWORLD
        </Text>
        <Text className="text-3xl font-bold text-slate-50">
          Mobile app is ready
        </Text>
        <Text className="mt-3 text-base leading-6 text-slate-400">
          React Native, Expo, TypeScript, and Tailwind CSS are configured.
        </Text>
        <AppCard
          label="Backend status"
          value={health?.status === "ok" ? "Connected" : error ?? "Checking..."}
          tone={health?.status === "ok" ? "success" : error ? "error" : "neutral"}
        />
      </View>
    </SafeAreaView>
  );
}
