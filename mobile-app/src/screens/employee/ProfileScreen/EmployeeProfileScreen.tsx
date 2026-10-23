import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { ApiError, getCurrentUser } from "../../../services/api";
import type { AuthenticatedUser } from "../../../types/api";

function formatStatus(status: string | undefined) {
  if (!status) return "Loading";
  return status
    .toLowerCase()
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export default function EmployeeProfileScreen() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadProfile = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);

    try {
      setUser(await getCurrentUser());
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to load your profile.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const profile = user?.employeeProfile;
  const initials =
    user?.fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "WW";
  const details = [
    { label: "Work email", value: user?.email },
    { label: "Phone number", value: profile?.phone },
    { label: "Designation", value: profile?.designation },
    { label: "Department", value: profile?.department },
  ];

  return (
    <ScrollView
      className="flex-1 bg-[#f6f8f4]"
      contentContainerClassName="px-5 pb-8 pt-4"
      refreshControl={
        <RefreshControl
          colors={["#007943"]}
          refreshing={isRefreshing}
          tintColor="#007943"
          onRefresh={() => void loadProfile(true)}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-sm font-semibold text-wind-700">EMPLOYEE PROFILE</Text>
      <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">Your workspace identity</Text>
      <Text className="mt-2 text-sm leading-5 text-slate-500">
        Employment details maintained by your administrator.
      </Text>

      <View className="mt-6 overflow-hidden rounded-[30px] bg-wind-900 p-6">
        <View className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-wind-800" />
        <View className="h-20 w-20 items-center justify-center rounded-[26px] border-4 border-wind-800 bg-white">
          <Text className="text-2xl font-bold text-wind-800">{initials}</Text>
        </View>
        <Text className="mt-5 text-2xl font-bold text-white">
          {user?.fullName ?? "Loading your profile..."}
        </Text>
        <Text className="mt-1 text-sm text-emerald-100">{profile?.designation ?? "Employee"}</Text>

        <View className="mt-6 flex-row items-center">
          <View className="rounded-full bg-white px-3 py-1.5">
            <Text className="text-[10px] font-bold text-wind-800">
              {formatStatus(profile?.status).toUpperCase()}
            </Text>
          </View>
          <Text className="ml-3 text-xs font-semibold text-emerald-100">
            ID {profile?.employeeId ?? user?.username ?? "--"}
          </Text>
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
        <Text className="text-xl font-bold text-slate-950">Work information</Text>
        <Text className="mt-1 text-xs text-slate-500">Synced from your employee record</Text>
      </View>

      <View className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
        {details.map((detail, index) => (
          <View
            key={detail.label}
            className={`flex-row items-center px-5 py-5 ${index > 0 ? "border-t border-slate-100" : ""}`}
          >
            <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-wind-50">
              <View className="h-3 w-3 rounded-full bg-wind-700" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-xs font-medium text-slate-500">{detail.label}</Text>
              <Text className="mt-1 text-sm font-bold text-slate-950">
                {detail.value || "Not provided"}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View className="mb-4 mt-8">
        <Text className="text-xl font-bold text-slate-950">Attendance assignment</Text>
        <Text className="mt-1 text-xs text-slate-500">Where your attendance can be recorded</Text>
      </View>

      <View className="rounded-[24px] border border-slate-200 bg-white p-5">
        <View className="flex-row items-center">
          <View className="h-12 w-12 items-center justify-center rounded-[18px] bg-wind-50">
            <View className="h-4 w-4 items-center justify-center rounded-full border-2 border-wind-700">
              <View className="h-1.5 w-1.5 rounded-full bg-wind-700" />
            </View>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-base font-bold text-slate-950">
              {profile?.attendanceLocation?.name ?? "No location assigned"}
            </Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              {profile?.attendanceLocation
                ? `${profile.attendanceLocation.geofenceRadiusMeters} meter secure attendance radius`
                : "Contact your administrator before your first punch."}
            </Text>
          </View>
        </View>
        {profile?.attendanceLocation ? (
          <View className="mt-5 flex-row border-t border-slate-100 pt-4">
            <View className="flex-1">
              <Text className="text-[10px] font-semibold text-slate-400">LATITUDE</Text>
              <Text className="mt-1 text-xs font-bold text-slate-700">
                {profile.attendanceLocation.latitude.toFixed(6)}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-[10px] font-semibold text-slate-400">LONGITUDE</Text>
              <Text className="mt-1 text-xs font-bold text-slate-700">
                {profile.attendanceLocation.longitude.toFixed(6)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
