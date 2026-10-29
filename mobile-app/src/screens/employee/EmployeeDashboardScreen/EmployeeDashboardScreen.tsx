import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import EmployeeBottomNavigation from "../../../components/EmployeeBottomNavigation/EmployeeBottomNavigation";
import type { RootStackParamList } from "../../../navigation/types";
import { endSession } from "../../../services/authSession";
import { getEmployeeNotifications } from "../../../services/api";
import type { EmployeeTab } from "../../../types/employee";
import AttendanceScreen from "../AttendanceScreen/AttendanceScreen";
import EmployeeHomeScreen from "../HomeScreen/EmployeeHomeScreen";
import EmployeeProfileScreen from "../ProfileScreen/EmployeeProfileScreen";
import EmployeeNotificationsScreen from "../NotificationsScreen/EmployeeNotificationsScreen";
import EmployeeSettingsScreen from "../SettingsScreen/EmployeeSettingsScreen";

type EmployeeDashboardScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "EmployeeDashboard"
>;

export default function EmployeeDashboardScreen({
  navigation,
}: EmployeeDashboardScreenProps) {
  const [activeTab, setActiveTab] = useState<EmployeeTab>("home");
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  useEffect(() => {
    getEmployeeNotifications()
      .then((response) => setUnreadNotificationCount(response.unreadCount))
      .catch(() => undefined);
  }, []);

  const renderScreen = () => {
    if (activeTab === "home") {
      return <EmployeeHomeScreen onOpenAttendance={() => setActiveTab("attendance")} />;
    }

    if (activeTab === "profile") {
      return <EmployeeProfileScreen />;
    }

    if (activeTab === "notifications") {
      return <EmployeeNotificationsScreen onUnreadCountChange={setUnreadNotificationCount} />;
    }

    if (activeTab === "settings") {
      return (
        <EmployeeSettingsScreen
          onLogout={() => {
            void endSession().finally(() => navigation.replace("Login"));
          }}
        />
      );
    }

    return <AttendanceScreen />;
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f6f8f4]" edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <View className="flex-1">{renderScreen()}</View>
      <EmployeeBottomNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        unreadNotificationCount={unreadNotificationCount}
      />
    </SafeAreaView>
  );
}
