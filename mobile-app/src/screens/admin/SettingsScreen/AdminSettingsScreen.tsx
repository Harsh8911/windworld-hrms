import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import {
  ApiError,
  getAttendanceLocations,
  getCurrentUser,
  getEmployees,
} from "../../../services/api";
import type { AuthenticatedUser } from "../../../types/api";

type AdminSettingsScreenProps = {
  onLogout: () => void;
};

type WorkspaceSummary = {
  employees: number;
  activeEmployees: number;
  locations: number;
};

const emptySummary: WorkspaceSummary = { employees: 0, activeEmployees: 0, locations: 0 };

export default function AdminSettingsScreen({ onLogout }: AdminSettingsScreenProps) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [summary, setSummary] = useState(emptySummary);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadWorkspace = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    setError("");

    try {
      const [currentUser, employees, locations] = await Promise.all([
        getCurrentUser(),
        getEmployees(),
        getAttendanceLocations(),
      ]);
      setUser(currentUser);
      setSummary({
        employees: employees.summary.total,
        activeEmployees: employees.summary.active,
        locations: locations.locations.length,
      });
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to load administrator settings.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const initials =
    user?.fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "HR";

  const confirmLogout = () => {
    Alert.alert(
      "Log out of administrator workspace?",
      "You will need the administrator email and password to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: onLogout },
      ],
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-[#f6f8f4]"
      contentContainerClassName="px-5 pb-8 pt-4"
      refreshControl={
        <RefreshControl
          colors={["#007943"]}
          refreshing={isRefreshing}
          tintColor="#007943"
          onRefresh={() => void loadWorkspace(true)}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-sm font-semibold text-wind-700">ADMIN WORKSPACE</Text>
      <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">Settings and security</Text>
      <Text className="mt-2 text-sm leading-5 text-slate-500">
        Your administrator identity and current attendance configuration.
      </Text>

      <View className="mt-6 overflow-hidden rounded-[28px] bg-wind-900 p-5">
        <View className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-wind-800" />
        <View className="flex-row items-center">
          <View className="h-16 w-16 items-center justify-center rounded-[22px] bg-white">
            <Text className="text-xl font-bold text-wind-800">{initials}</Text>
          </View>
          <View className="ml-4 flex-1">
            <Text className="text-xl font-bold text-white">{user?.fullName ?? "Administrator"}</Text>
            <Text className="mt-1 text-xs text-emerald-100">{user?.email ?? "Loading secure account..."}</Text>
          </View>
          <View className="h-3 w-3 rounded-full bg-emerald-300" />
        </View>
        <View className="mt-5 flex-row rounded-[18px] bg-wind-800 px-4 py-3">
          <Text className="flex-1 text-xs font-semibold text-emerald-100">ADMINISTRATOR</Text>
          <Text className="text-xs font-semibold text-emerald-100">SECURE SESSION</Text>
        </View>
      </View>

      {error ? (
        <View className="mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-4">
          <Text accessibilityLiveRegion="polite" className="text-sm font-semibold leading-5 text-red-700">
            {error}
          </Text>
        </View>
      ) : null}

      <View className="mb-4 mt-8">
        <Text className="text-xl font-bold text-slate-950">Workspace overview</Text>
        <Text className="mt-1 text-xs text-slate-500">Live configuration from the database</Text>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-[22px] border border-slate-200 bg-white p-4">
          <Text className="text-[26px] font-bold text-slate-950">{summary.employees}</Text>
          <Text className="mt-1 text-xs leading-5 text-slate-500">Employee profiles</Text>
        </View>
        <View className="flex-1 rounded-[22px] border border-slate-200 bg-white p-4">
          <Text className="text-[26px] font-bold text-slate-950">{summary.locations}</Text>
          <Text className="mt-1 text-xs leading-5 text-slate-500">Work locations</Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center rounded-[20px] border border-slate-200 bg-white px-4 py-4">
        <View className="h-11 w-11 items-center justify-center rounded-[15px] bg-wind-50">
          <View className="h-3 w-3 rounded-full bg-wind-700" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-sm font-bold text-slate-950">Active workforce</Text>
          <Text className="mt-1 text-xs text-slate-500">Profiles currently enabled for access</Text>
        </View>
        <Text className="text-base font-bold text-wind-700">{summary.activeEmployees}</Text>
      </View>

      <View className="mb-4 mt-8">
        <Text className="text-xl font-bold text-slate-950">Attendance controls</Text>
        <Text className="mt-1 text-xs text-slate-500">Policies enforced by the backend</Text>
      </View>

      <View className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
        <View className="flex-row items-start px-5 py-5">
          <View className="mt-1 h-2.5 w-2.5 rounded-full bg-wind-700" />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-slate-950">Role-protected administration</Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              Employee accounts cannot access workforce, location, or attendance report endpoints.
            </Text>
          </View>
        </View>
        <View className="flex-row items-start border-t border-slate-100 px-5 py-5">
          <View className="mt-1 h-2.5 w-2.5 rounded-full bg-wind-700" />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-slate-950">GPS geofence validation</Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              Check-in and checkout are accepted only inside the employee's assigned boundary.
            </Text>
          </View>
        </View>
        <View className="flex-row items-start border-t border-slate-100 px-5 py-5">
          <View className="mt-1 h-2.5 w-2.5 rounded-full bg-wind-700" />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-slate-950">General Shift automation</Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              Sessions close at 6:00 PM or when the eight-hour duration limit is reached.
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-8 rounded-[24px] border border-wind-100 bg-wind-50 p-5">
        <Text className="text-sm font-bold text-wind-900">Windworld administration</Text>
        <Text className="mt-2 text-xs leading-5 text-slate-600">
          Account, password, policy, or organization changes that are not available here should be handled through the backend administrator.
        </Text>
      </View>

      <Pressable
        accessibilityHint="Ends the current administrator session"
        accessibilityRole="button"
        className="mt-6 min-h-14 items-center justify-center rounded-[18px] border border-red-200 bg-white active:bg-red-50"
        onPress={confirmLogout}
      >
        <Text className="font-bold text-red-700">Log out</Text>
      </Pressable>
      <Text className="mt-4 text-center text-[11px] text-slate-400">
        Windworld Admin · Secure workforce operations
      </Text>
    </ScrollView>
  );
}
