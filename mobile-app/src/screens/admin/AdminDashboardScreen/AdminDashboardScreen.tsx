import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AdminBottomNavigation from "../../../components/AdminBottomNavigation/AdminBottomNavigation";
import type { RootStackParamList } from "../../../navigation/types";
import { endSession } from "../../../services/authSession";
import type { AdminTab } from "../../../types/admin";
import AdminAddEmployeeScreen from "../AddEmployeeScreen/AdminAddEmployeeScreen";
import AdminAttendanceLogsScreen from "../AttendanceLogsScreen/AdminAttendanceLogsScreen";
import AdminAttendanceLocationsScreen from "../AttendanceLocationsScreen/AdminAttendanceLocationsScreen";
import AdminEmployeesScreen from "../EmployeesScreen/AdminEmployeesScreen";
import AdminEditEmployeeScreen from "../EditEmployeeScreen/AdminEditEmployeeScreen";
import AdminSettingsScreen from "../SettingsScreen/AdminSettingsScreen";
import type { Employee } from "../../../types/api";

type AdminDashboardScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "AdminDashboard"
>;

export default function AdminDashboardScreen({
  navigation,
}: AdminDashboardScreenProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("employees");
  const [employeeRevision, setEmployeeRevision] = useState(0);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const renderScreen = () => {
    if (editingEmployee) {
      return (
        <AdminEditEmployeeScreen
          employee={editingEmployee}
          onCancel={() => setEditingEmployee(null)}
          onSaved={() => {
            setEditingEmployee(null);
            setEmployeeRevision((value) => value + 1);
          }}
        />
      );
    }

    if (activeTab === "addEmployee") {
      return (
        <AdminAddEmployeeScreen
          onCreated={() => {
            setEmployeeRevision((value) => value + 1);
            setActiveTab("employees");
          }}
        />
      );
    }

    if (activeTab === "locations") {
      return <AdminAttendanceLocationsScreen />;
    }

    if (activeTab === "attendance") {
      return <AdminAttendanceLogsScreen />;
    }

    if (activeTab === "settings") {
      return (
        <AdminSettingsScreen
          onLogout={() => {
            void endSession().finally(() => navigation.replace("Login"));
          }}
        />
      );
    }

    return (
      <AdminEmployeesScreen
        onAddEmployee={() => setActiveTab("addEmployee")}
        onEditEmployee={setEditingEmployee}
        revision={employeeRevision}
      />
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f6f8f4]" edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <View className="flex-1">{renderScreen()}</View>
      <AdminBottomNavigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          setEditingEmployee(null);
          setActiveTab(tab);
        }}
      />
    </SafeAreaView>
  );
}
