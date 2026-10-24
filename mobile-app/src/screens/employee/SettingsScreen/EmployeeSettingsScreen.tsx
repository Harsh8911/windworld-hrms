import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import ConfirmDialog from "../../../components/ConfirmDialog/ConfirmDialog";
import { ApiError, getCurrentUser } from "../../../services/api";
import type { AuthenticatedUser } from "../../../types/api";

type EmployeeSettingsScreenProps = {
  onLogout: () => void;
};

export default function EmployeeSettingsScreen({
  onLogout,
}: EmployeeSettingsScreenProps) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLogoutDialogVisible, setIsLogoutDialogVisible] = useState(false);

  const loadAccount = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);

    try {
      setUser(await getCurrentUser());
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof ApiError ? requestError.message : "Unable to load account settings.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  return (
    <ScrollView
      className="flex-1 bg-[#f6f8f4]"
      contentContainerClassName="px-5 pb-8 pt-4"
      refreshControl={
        <RefreshControl
          colors={["#007943"]}
          refreshing={isRefreshing}
          tintColor="#007943"
          onRefresh={() => void loadAccount(true)}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-sm font-semibold text-wind-700">ACCOUNT & APP</Text>
      <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">Settings</Text>
      <Text className="mt-1 text-sm text-slate-500">Your session, attendance rules, and support details.</Text>

      <View className="mt-6 flex-row items-center rounded-[26px] bg-wind-900 p-5">
        <View className="h-14 w-14 items-center justify-center rounded-[20px] bg-white">
          <Text className="text-lg font-bold text-wind-800">
            {user?.fullName
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("") || "WW"}
          </Text>
        </View>
        <View className="ml-4 flex-1">
          <Text className="text-lg font-bold text-white">{user?.fullName ?? "Loading account..."}</Text>
          <Text className="mt-1 text-xs text-emerald-100">{user?.email ?? "Retrieving secure profile"}</Text>
        </View>
        <View className="h-3 w-3 rounded-full bg-emerald-300" />
      </View>

      {error ? (
        <View className="mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-4">
          <Text accessibilityLiveRegion="polite" className="text-sm font-semibold leading-5 text-red-700">
            {error}
          </Text>
        </View>
      ) : null}

      <View className="mb-4 mt-8">
        <Text className="text-xl font-bold text-slate-950">Account security</Text>
        <Text className="mt-1 text-xs text-slate-500">Details for your current authenticated session</Text>
      </View>

      <View className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
        <View className="flex-row items-center px-5 py-5">
          <View className="h-11 w-11 items-center justify-center rounded-[15px] bg-wind-50">
            <View className="h-4 w-3 rounded-sm border-2 border-wind-700" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-slate-950">Signed-in account</Text>
            <Text className="mt-1 text-xs text-slate-500">{user?.email ?? "Loading..."}</Text>
          </View>
          <View className="rounded-full bg-emerald-50 px-3 py-1.5">
            <Text className="text-[10px] font-bold text-emerald-700">SECURE</Text>
          </View>
        </View>
        <View className="flex-row items-center border-t border-slate-100 px-5 py-5">
          <View className="h-11 w-11 items-center justify-center rounded-[15px] bg-wind-50">
            <View className="h-4 w-4 rounded-full border-2 border-wind-700" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-slate-950">Access level</Text>
            <Text className="mt-1 text-xs text-slate-500">Employee workspace</Text>
          </View>
          <Text className="text-xs font-bold text-wind-700">{user?.role ?? "--"}</Text>
        </View>
      </View>

      <View className="mb-4 mt-8">
        <Text className="text-xl font-bold text-slate-950">Attendance policy</Text>
        <Text className="mt-1 text-xs text-slate-500">Rules applied automatically by Windworld</Text>
      </View>

      <View className="rounded-[24px] border border-slate-200 bg-white p-5">
        <View className="flex-row items-start">
          <View className="mt-1 h-2.5 w-2.5 rounded-full bg-wind-700" />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-slate-950">GPS-verified attendance</Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              Punch actions are accepted only inside your administrator-assigned geofence.
            </Text>
          </View>
        </View>
        <View className="my-4 h-px bg-slate-100" />
        <View className="flex-row items-start">
          <View className="mt-1 h-2.5 w-2.5 rounded-full bg-wind-700" />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-slate-950">Automatic checkout</Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              Active sessions close at 6:00 PM or after the eight-hour work limit.
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-8 rounded-[24px] border border-wind-100 bg-wind-50 p-5">
        <Text className="text-sm font-bold text-wind-900">Need help?</Text>
        <Text className="mt-2 text-xs leading-5 text-slate-600">
          Contact your Windworld administrator for profile, password, shift, or location changes.
        </Text>
      </View>

      <Pressable
        accessibilityHint="Ends the current secure session"
        accessibilityRole="button"
        className="mt-6 min-h-14 items-center justify-center rounded-[18px] border border-red-200 bg-white active:bg-red-50"
        onPress={() => setIsLogoutDialogVisible(true)}
      >
        <Text className="font-bold text-red-700">Log out</Text>
      </Pressable>
      <Text className="mt-4 text-center text-[11px] text-slate-400">Windworld Employee · Secure attendance workspace</Text>

      <ConfirmDialog
        confirmLabel="Log out"
        message="You will need your employee email and password to sign in again."
        onCancel={() => setIsLogoutDialogVisible(false)}
        onConfirm={() => {
          setIsLogoutDialogVisible(false);
          onLogout();
        }}
        title="Log out of Windworld?"
        variant="danger"
        visible={isLogoutDialogVisible}
      />
    </ScrollView>
  );
}
