import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, View } from "react-native";

import ConfirmDialog from "../../../components/ConfirmDialog/ConfirmDialog";
import FormField from "../../../components/FormField/FormField";
import {
  ApiError,
  getAdminSettings,
  getAttendanceLocations,
  getCurrentUser,
  getEmployees,
  updateAdminShift,
} from "../../../services/api";
import type { AdminShiftSettings, AuthenticatedUser } from "../../../types/api";

type AdminSettingsScreenProps = {
  onLogout: () => void;
};

type WorkspaceSummary = {
  employees: number;
  activeEmployees: number;
  locations: number;
};

const emptySummary: WorkspaceSummary = { employees: 0, activeEmployees: 0, locations: 0 };

type ShiftDraft = {
  name: string;
  startTime: string;
  endTime: string;
  maxDurationMinutes: string;
  timezone: string;
  autoCheckoutEnabled: boolean;
  autoCheckoutDelayMinutes: string;
};

const emptyShiftDraft: ShiftDraft = {
  name: "",
  startTime: "",
  endTime: "",
  maxDurationMinutes: "",
  timezone: "",
  autoCheckoutEnabled: true,
  autoCheckoutDelayMinutes: "30",
};

function createShiftDraft(shift: AdminShiftSettings): ShiftDraft {
  const calculatedMinutes = calculateShiftMinutes(shift.startTime, shift.endTime);
  return {
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    maxDurationMinutes: String(calculatedMinutes ?? shift.maxDurationMinutes),
    timezone: shift.timezone,
    autoCheckoutEnabled: shift.autoCheckoutEnabled,
    autoCheckoutDelayMinutes: String(shift.autoCheckoutDelayMinutes),
  };
}

function timeInMinutes(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function calculateShiftMinutes(startTime: string, endTime: string) {
  const startMinutes = timeInMinutes(startTime);
  const endMinutes = timeInMinutes(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;
  return endMinutes - startMinutes;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export default function AdminSettingsScreen({ onLogout }: AdminSettingsScreenProps) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [summary, setSummary] = useState(emptySummary);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLogoutDialogVisible, setIsLogoutDialogVisible] = useState(false);
  const [shift, setShift] = useState<AdminShiftSettings | null>(null);
  const [shiftDraft, setShiftDraft] = useState(emptyShiftDraft);
  const [isEditingShift, setIsEditingShift] = useState(false);
  const [isSavingShift, setIsSavingShift] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const loadWorkspace = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    setError("");

    try {
      const [currentUser, employees, locations, settings] = await Promise.all([
        getCurrentUser(),
        getEmployees(),
        getAttendanceLocations(),
        getAdminSettings(),
      ]);
      setUser(currentUser);
      setSummary({
        employees: employees.summary.total,
        activeEmployees: employees.summary.active,
        locations: locations.locations.length,
      });
      setShift(settings.shift);
      setShiftDraft(createShiftDraft(settings.shift));
      setIsEditingShift(false);
      setSuccessMessage("");
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

  const saveShift = async () => {
    const name = shiftDraft.name.trim();
    const startMinutes = timeInMinutes(shiftDraft.startTime);
    const endMinutes = timeInMinutes(shiftDraft.endTime);
    const scheduledMinutes = calculateShiftMinutes(shiftDraft.startTime, shiftDraft.endTime);
    const maxDurationMinutes = Number(shiftDraft.maxDurationMinutes);
    const autoCheckoutDelayMinutes = Number(shiftDraft.autoCheckoutDelayMinutes);
    const timezone = shiftDraft.timezone.trim();

    if (name.length < 2) {
      setError("Shift name must contain at least 2 characters.");
      return;
    }
    if (startMinutes === null || endMinutes === null) {
      setError("Start and end times must use a valid 24-hour HH:mm format.");
      return;
    }
    if (scheduledMinutes === null) {
      setError("Shift end time must be later than its start time.");
      return;
    }
    if (!Number.isInteger(maxDurationMinutes) || maxDurationMinutes < 30 || maxDurationMinutes > 1440) {
      setError("Maximum duration must be a whole number between 30 and 1440 minutes.");
      return;
    }
    if (maxDurationMinutes > scheduledMinutes) {
      setError("Maximum duration cannot exceed the scheduled shift length.");
      return;
    }
    if (!timezone) {
      setError("Timezone is required.");
      return;
    }
    if (
      !Number.isInteger(autoCheckoutDelayMinutes) ||
      autoCheckoutDelayMinutes < 30 ||
      autoCheckoutDelayMinutes > 40
    ) {
      setError("Auto-checkout delay must be a whole number between 30 and 40 minutes.");
      return;
    }

    setIsSavingShift(true);
    setError("");
    setSuccessMessage("");
    try {
      const settings = await updateAdminShift({
        name,
        startTime: shiftDraft.startTime,
        endTime: shiftDraft.endTime,
        maxDurationMinutes,
        timezone,
        autoCheckoutEnabled: shiftDraft.autoCheckoutEnabled,
        autoCheckoutDelayMinutes,
      });
      setShift(settings.shift);
      setShiftDraft(createShiftDraft(settings.shift));
      setIsEditingShift(false);
      setSuccessMessage(
        shiftDraft.autoCheckoutEnabled
          ? `Attendance policy updated. Auto-checkout will run ${autoCheckoutDelayMinutes} minutes after shift end.`
          : "Attendance policy updated. Unclosed sessions will be marked not checked out at day end.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to update the attendance policy.",
      );
    } finally {
      setIsSavingShift(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-[#f6f8f4]"
      contentContainerClassName="px-5 pb-8 pt-4"
      keyboardShouldPersistTaps="handled"
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

      {successMessage ? (
        <View className="mt-4 rounded-[20px] border border-wind-200 bg-wind-50 px-4 py-4">
          <Text accessibilityLiveRegion="polite" className="text-sm font-semibold leading-5 text-wind-800">
            {successMessage}
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
              Employees use location-specific radius settings; managers record unrestricted GPS coordinates.
            </Text>
          </View>
        </View>
        <View className="flex-row items-start border-t border-slate-100 px-5 py-5">
          <View className="mt-1 h-2.5 w-2.5 rounded-full bg-wind-700" />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-slate-950">
              {shift?.name ?? "Loading shift policy"}
            </Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              {shift
                ? `${shift.startTime}–${shift.endTime} · ${formatDuration(shift.maxDurationMinutes)} scheduled · ${shift.timezone}`
                : "Retrieving the database-backed attendance schedule."}
            </Text>
            {shift ? (
              <Text className={`mt-1 text-xs font-semibold ${shift.autoCheckoutEnabled ? "text-wind-700" : "text-slate-400"}`}>
                {shift.autoCheckoutEnabled
                  ? `Auto-checkout ${shift.autoCheckoutDelayMinutes} minutes after shift end`
                  : "Manual checkout · missed checkouts close at day end"}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel="Customize shift policy"
            accessibilityRole="button"
            accessibilityState={{ disabled: !shift }}
            className="ml-3 h-11 w-11 items-center justify-center rounded-[14px] bg-wind-50 active:bg-wind-100"
            disabled={!shift}
            onPress={() => {
              if (shift) setShiftDraft(createShiftDraft(shift));
              setError("");
              setSuccessMessage("");
              setIsEditingShift(true);
            }}
          >
            <Ionicons color="#047857" name="options-outline" size={22} />
          </Pressable>
        </View>
      </View>

      {isEditingShift ? (
        <Modal
          animationType="fade"
          onRequestClose={() => {
            if (!isSavingShift) setIsEditingShift(false);
          }}
          transparent
          visible
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
            <Pressable
              accessibilityElementsHidden
              className="absolute inset-0"
              disabled={isSavingShift}
              importantForAccessibility="no-hide-descendants"
              onPress={() => setIsEditingShift(false)}
              style={{ backgroundColor: "rgba(2, 6, 23, 0.6)" }}
            />
            <ScrollView
              className="flex-1"
              contentContainerClassName="px-5 py-10"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
        <View accessibilityViewIsModal className="w-full max-w-lg self-center rounded-[28px] bg-[#f6f8f4] p-4">
          <View className="flex-row items-start justify-between px-1 pb-3">
            <View className="flex-1 pr-3">
              <Text className="text-xl font-bold text-slate-950">Customize attendance policy</Text>
              <Text className="mt-1 text-xs leading-5 text-slate-500">
                Configure the general shift schedule and checkout policy.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close shift settings"
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-[14px] bg-white"
              disabled={isSavingShift}
              onPress={() => setIsEditingShift(false)}
            >
              <Ionicons color="#475569" name="close" size={24} />
            </Pressable>
          </View>

          {error ? (
            <View className="mb-3 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3">
              <Text accessibilityLiveRegion="polite" className="text-sm font-semibold leading-5 text-red-700">{error}</Text>
            </View>
          ) : null}

          <View className="rounded-[24px] border border-slate-200 bg-white p-5">

          <FormField
            editable={!isSavingShift}
            label="Shift name"
            maxLength={80}
            onChangeText={(name) => setShiftDraft((current) => ({ ...current, name }))}
            placeholder="General Shift"
            value={shiftDraft.name}
          />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField
                autoCapitalize="none"
                editable={!isSavingShift}
                helperText="24-hour time"
                keyboardType="numbers-and-punctuation"
                label="Start time"
                maxLength={5}
                onChangeText={(startTime) =>
                  setShiftDraft((current) => {
                    const calculatedMinutes = calculateShiftMinutes(startTime, current.endTime);
                    return {
                      ...current,
                      startTime,
                      maxDurationMinutes:
                        calculatedMinutes === null ? "" : String(calculatedMinutes),
                    };
                  })
                }
                placeholder="10:00"
                value={shiftDraft.startTime}
              />
            </View>
            <View className="flex-1">
              <FormField
                autoCapitalize="none"
                editable={!isSavingShift}
                helperText="24-hour time"
                keyboardType="numbers-and-punctuation"
                label="End time"
                maxLength={5}
                onChangeText={(endTime) =>
                  setShiftDraft((current) => {
                    const calculatedMinutes = calculateShiftMinutes(current.startTime, endTime);
                    return {
                      ...current,
                      endTime,
                      maxDurationMinutes:
                        calculatedMinutes === null ? "" : String(calculatedMinutes),
                    };
                  })
                }
                placeholder="18:00"
                value={shiftDraft.endTime}
              />
            </View>
          </View>

          <FormField
            editable={false}
            helperText="Automatically calculated from the start and end times."
            label="Scheduled shift duration (minutes)"
            placeholder="480"
            value={shiftDraft.maxDurationMinutes}
          />

          <FormField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSavingShift}
            helperText="Use an IANA timezone, for example Asia/Kolkata."
            label="Timezone"
            maxLength={64}
            onChangeText={(timezone) =>
              setShiftDraft((current) => ({ ...current, timezone }))
            }
            placeholder="Asia/Kolkata"
            value={shiftDraft.timezone}
          />

          <View className="mb-5 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
            <View className="flex-row items-center">
              <View className="flex-1 pr-4">
                <Text className="text-sm font-bold text-slate-950">Automatic checkout</Text>
                <Text className="mt-1 text-xs leading-5 text-slate-500">
                  When enabled, open sessions close automatically after the scheduled shift end.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Enable automatic checkout"
                disabled={isSavingShift}
                onValueChange={(autoCheckoutEnabled) =>
                  setShiftDraft((current) => ({ ...current, autoCheckoutEnabled }))
                }
                thumbColor="#ffffff"
                trackColor={{ false: "#cbd5e1", true: "#047857" }}
                value={shiftDraft.autoCheckoutEnabled}
              />
            </View>

            {shiftDraft.autoCheckoutEnabled ? (
              <View className="mt-4 border-t border-slate-200 pt-4">
                <FormField
                  editable={!isSavingShift}
                  helperText="Choose a whole number from 30 to 40 minutes."
                  keyboardType="number-pad"
                  label="Checkout delay after shift end (minutes)"
                  maxLength={2}
                  onChangeText={(autoCheckoutDelayMinutes) =>
                    setShiftDraft((current) => ({ ...current, autoCheckoutDelayMinutes }))
                  }
                  placeholder="30"
                  value={shiftDraft.autoCheckoutDelayMinutes}
                />
              </View>
            ) : null}
          </View>

          <View className="rounded-[18px] bg-amber-50 px-4 py-3">
            <Text className="text-xs leading-5 text-amber-800">
              Changing the shift end or auto-checkout delay can close overdue active sessions during the next automatic attendance check.
            </Text>
          </View>

          <View className="mt-5 flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isSavingShift }}
              className="min-h-12 flex-1 items-center justify-center rounded-[16px] border border-slate-300 bg-white active:bg-slate-50"
              disabled={isSavingShift}
              onPress={() => {
                if (shift) setShiftDraft(createShiftDraft(shift));
                setError("");
                setIsEditingShift(false);
              }}
            >
              <Text className="text-sm font-bold text-slate-700">Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: isSavingShift, disabled: isSavingShift }}
              className="min-h-12 flex-1 items-center justify-center rounded-[16px] bg-wind-700 active:bg-wind-800"
              disabled={isSavingShift}
              onPress={() => void saveShift()}
            >
              {isSavingShift ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">Save policy</Text>
              )}
            </Pressable>
          </View>
          </View>
        </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}

      <Pressable
        accessibilityHint="Ends the current administrator session"
        accessibilityRole="button"
        className="mt-6 min-h-14 items-center justify-center rounded-[18px] border border-red-200 bg-white active:bg-red-50"
        onPress={() => setIsLogoutDialogVisible(true)}
      >
        <Text className="font-bold text-red-700">Log out</Text>
      </Pressable>
      <Text className="mt-4 text-center text-[11px] text-slate-400">
        Windworld Admin · Secure workforce operations
      </Text>

      <ConfirmDialog
        confirmLabel="Log out"
        message="You will need the administrator email and password to sign in again."
        onCancel={() => setIsLogoutDialogVisible(false)}
        onConfirm={() => {
          setIsLogoutDialogVisible(false);
          onLogout();
        }}
        title="Log out of administrator workspace?"
        variant="danger"
        visible={isLogoutDialogVisible}
      />
    </ScrollView>
  );
}
