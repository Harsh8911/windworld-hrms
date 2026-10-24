import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import FormField from "../../../components/FormField/FormField";
import { ApiError, getCurrentUser, updateOwnProfile } from "../../../services/api";
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
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftFullName, setDraftFullName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");

  const loadProfile = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);

    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      if (!isEditing) {
        setDraftFullName(currentUser.fullName);
        setDraftPhone(currentUser.employeeProfile?.phone ?? "");
      }
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
  }, [isEditing]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const profile = user?.employeeProfile;
  const attendanceLocations = profile?.attendanceLocations ?? [];
  const initials =
    user?.fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "WW";
  const details = [
    {
      label: "Role",
      value: profile
        ? profile.employeeRole === "MANAGER"
          ? "Manager"
          : "Employee"
        : undefined,
    },
    { label: "Work email", value: user?.email },
    { label: "Phone number", value: profile?.phone },
    { label: "Designation", value: profile?.designation },
    { label: "Department", value: profile?.department },
  ];

  const saveProfile = async () => {
    if (draftFullName.trim().length < 2) {
      setError("Full name must contain at least 2 characters.");
      return;
    }
    if (draftPhone && !/^\d{10}$/.test(draftPhone)) {
      setError("Phone number must contain exactly 10 digits.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const response = await updateOwnProfile({
        fullName: draftFullName.trim(),
        phone: draftPhone || null,
      });
      setUser(response.user);
      setDraftFullName(response.user.fullName);
      setDraftPhone(response.user.employeeProfile?.phone ?? "");
      setIsEditing(false);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to update your profile.",
      );
    } finally {
      setIsSaving(false);
    }
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

      <View className="mb-4 mt-8 flex-row items-end justify-between">
        <View>
          <Text className="text-xl font-bold text-slate-950">Work information</Text>
          <Text className="mt-1 text-xs text-slate-500">Synced from your employee record</Text>
        </View>
        {!isEditing ? (
          <Pressable
            accessibilityHint="Allows you to update your name and phone number"
            accessibilityLabel="Edit profile"
            accessibilityRole="button"
            className="h-11 w-11 items-center justify-center rounded-[14px] border border-wind-100 bg-wind-50 active:bg-wind-100"
            onPress={() => {
              setDraftFullName(user?.fullName ?? "");
              setDraftPhone(profile?.phone ?? "");
              setIsEditing(true);
              setError("");
            }}
          >
            <Ionicons color="#047857" name="create-outline" size={22} />
          </Pressable>
        ) : null}
      </View>

      {isEditing ? (
        <View className="rounded-[24px] border border-slate-200 bg-white p-5">
          <FormField
            editable={!isSaving}
            label="Full name *"
            onChangeText={setDraftFullName}
            value={draftFullName}
          />
          <FormField
            editable={!isSaving}
            helperText="Enter exactly 10 digits without +91."
            keyboardType="phone-pad"
            label="Phone number"
            maxLength={10}
            onChangeText={(value) => setDraftPhone(value.replace(/\D/g, "").slice(0, 10))}
            value={draftPhone}
          />
          <View className="flex-row gap-3">
            <Pressable
              className="min-h-12 flex-1 items-center justify-center rounded-[15px] border border-slate-300"
              disabled={isSaving}
              onPress={() => {
                setIsEditing(false);
                setError("");
              }}
            >
              <Text className="text-xs font-bold text-slate-700">Cancel</Text>
            </Pressable>
            <Pressable
              className={`min-h-12 flex-1 items-center justify-center rounded-[15px] ${isSaving ? "bg-wind-600" : "bg-wind-700"}`}
              disabled={isSaving}
              onPress={() => void saveProfile()}
            >
              <Text className="text-xs font-bold text-white">
                {isSaving ? "Saving..." : "Save profile"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
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
      )}

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
              {profile?.employeeRole === "MANAGER"
                ? "Unrestricted manager access"
                : attendanceLocations.length
                  ? `${attendanceLocations.length} assigned location${attendanceLocations.length === 1 ? "" : "s"}`
                  : "No location assigned"}
            </Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              {profile?.employeeRole === "MANAGER"
                ? "You may punch outside configured geofences."
                : attendanceLocations.length
                ? "GPS verifies that you are inside one of these geofences."
                : "Contact your administrator before your first punch."}
            </Text>
          </View>
        </View>
        {attendanceLocations.map((location) => (
          <View
            key={location.id}
            className="mt-4 flex-row items-center border-t border-slate-100 pt-4"
          >
            <View className="h-2.5 w-2.5 rounded-full bg-wind-600" />
            <Text className="ml-3 flex-1 text-sm font-bold text-slate-700">{location.name}</Text>
            <Text className="text-xs font-semibold text-slate-500">
              {location.geofenceRadiusMeters} m
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
