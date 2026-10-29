import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import GeofenceMap from "../../../components/GeofenceMap/GeofenceMap";
import {
  ApiError,
  getAttendanceOverview,
  getCurrentUser,
} from "../../../services/api";
import type {
  AttendanceOverview,
  AttendanceSession,
  AuthenticatedUser,
} from "../../../types/api";
import type { AttendancePeriod } from "../../../types/employee";

type DisplayRecord = {
  id: string;
  label: string;
  detail: string;
  hours: string;
  status: string;
};

type LoadMode = "initial" | "refresh" | "silent";

const periodLabels: Array<{ key: AttendancePeriod; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}m`;
}

function formatTime(value: string | null, timezone: string) {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

function formatAttendanceDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sessionStatus(session: AttendanceSession) {
  if (session.status === "IN_PROGRESS") return "On shift";
  if (session.punchOutReason === "AUTO_SHIFT_END") return "Auto checkout";
  if (session.punchOutReason === "AUTO_MAX_DURATION") return "8h limit";
  if (session.punchOutReason === "MISSED_CHECKOUT") return "Not checked out";
  return session.isLate ? "Late arrival" : "Present";
}

function getWeekStart(date: string) {
  const value = new Date(`${date}T00:00:00`);
  const day = value.getDay();
  value.setDate(value.getDate() - (day === 0 ? 6 : day - 1));
  return value.toISOString().slice(0, 10);
}

function buildRecords(
  sessions: AttendanceSession[],
  period: AttendancePeriod,
  timezone: string,
): DisplayRecord[] {
  if (period === "daily") {
    return sessions.map((session) => ({
      id: session.id,
      label: formatAttendanceDate(session.attendanceDate),
      detail: `${formatTime(session.punchInAt, timezone)} - ${formatTime(session.punchOutAt, timezone)}`,
      hours: formatMinutes(session.durationMinutes),
      status: sessionStatus(session),
    }));
  }

  const groups = new Map<
    string,
    { minutes: number; days: number; lateDays: number; latestDate: string }
  >();

  for (const session of sessions) {
    const key =
      period === "weekly" ? getWeekStart(session.attendanceDate) : session.attendanceDate.slice(0, 7);
    const current = groups.get(key) ?? {
      minutes: 0,
      days: 0,
      lateDays: 0,
      latestDate: session.attendanceDate,
    };
    current.minutes += session.durationMinutes;
    current.days += 1;
    current.lateDays += session.isLate ? 1 : 0;
    current.latestDate =
      current.latestDate > session.attendanceDate ? current.latestDate : session.attendanceDate;
    groups.set(key, current);
  }

  return [...groups.entries()].map(([key, group]) => ({
    id: `${period}-${key}`,
    label:
      period === "weekly"
        ? `Week of ${formatAttendanceDate(key)}`
        : new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          }),
    detail: `${group.days} present day${group.days === 1 ? "" : "s"}${
      group.lateDays ? ` · ${group.lateDays} late` : ""
    }`,
    hours: formatMinutes(group.minutes),
    status: "Recorded",
  }));
}

export default function AttendanceScreen() {
  const [period, setPeriod] = useState<AttendancePeriod>("daily");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [overview, setOverview] = useState<AttendanceOverview | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadAttendance = useCallback(async (mode: LoadMode = "initial") => {
    if (mode === "initial") setIsLoading(true);
    if (mode === "refresh") setIsRefreshing(true);

    try {
      const [currentUser, attendanceOverview] = await Promise.all([
        getCurrentUser(),
        getAttendanceOverview(),
      ]);
      setUser(currentUser);
      setOverview(attendanceOverview);
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to load attendance data.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAttendance("initial");
    const refreshTimer = setInterval(() => void loadAttendance("silent"), 60_000);
    return () => clearInterval(refreshTimer);
  }, [loadAttendance]);

  const overviewLocations = overview?.availableLocations ?? [];
  const assignedLocations = overviewLocations.length
    ? overviewLocations
    : user?.employeeProfile?.attendanceLocations ?? [];
  const assignedLocation = assignedLocations[0];
  const todaySession = overview?.todaySession;
  const timezone = overview?.shift.timezone ?? "Asia/Kolkata";
  const records = useMemo(
    () => buildRecords(overview?.sessions ?? [], period, timezone),
    [overview, period, timezone],
  );
  const currentDate = useMemo(
    () =>
      new Date().toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [],
  );

  const isOnShift = todaySession?.status === "IN_PROGRESS";
  const isCompleted = todaySession?.status === "COMPLETED";

  return (
    <ScrollView
      className="flex-1 bg-[#f6f8f4]"
      contentContainerClassName="px-5 pb-8 pt-4"
      refreshControl={
        <RefreshControl
          colors={["#007943"]}
          refreshing={isRefreshing}
          tintColor="#007943"
          onRefresh={() => void loadAttendance("refresh")}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-semibold text-wind-700">{currentDate}</Text>
          <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">Attendance</Text>
          <Text className="mt-1 text-sm text-slate-500">Secure, location-verified check-in.</Text>
        </View>
        <View className="rounded-[16px] border border-slate-200 bg-white px-3 py-2.5">
          <Text className="text-[11px] font-bold text-wind-800">
            {user?.employeeProfile?.employeeId ?? user?.username ?? "--"}
          </Text>
        </View>
      </View>

      <View className="mt-6 rounded-[28px] bg-wind-900 p-5">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs font-semibold text-emerald-100">CURRENT STATUS</Text>
            <Text className="mt-2 text-2xl font-bold text-white">
              {isOnShift ? "You are on shift" : isCompleted ? "Shift completed" : "Ready to start"}
            </Text>
          </View>
          <View className={`h-12 w-12 items-center justify-center rounded-[18px] ${isOnShift ? "bg-emerald-400" : "bg-wind-800"}`}>
            <View className={`h-4 w-4 rounded-full ${isOnShift ? "bg-white" : "bg-slate-300"}`} />
          </View>
        </View>

        <View className="mt-5 flex-row rounded-[20px] bg-wind-800 p-4">
          <View className="flex-1">
            <Text className="text-xs text-emerald-100">Punch in</Text>
            <Text className="mt-1 text-lg font-bold text-white">
              {formatTime(todaySession?.punchInAt ?? null, timezone)}
            </Text>
          </View>
          <View className="w-px bg-wind-700" />
          <View className="flex-1 pl-4">
            <Text className="text-xs text-emerald-100">Punch out</Text>
            <Text className="mt-1 text-lg font-bold text-white">
              {formatTime(todaySession?.punchOutAt ?? null, timezone)}
            </Text>
          </View>
          <View className="w-px bg-wind-700" />
          <View className="flex-1 pl-4">
            <Text className="text-xs text-emerald-100">Total</Text>
            <Text className="mt-1 text-lg font-bold text-white">
              {todaySession ? formatMinutes(todaySession.durationMinutes) : "0h 00m"}
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-4 flex-row items-center rounded-[20px] border border-slate-200 bg-white px-4 py-4">
        <View className="h-11 w-11 items-center justify-center rounded-[15px] bg-wind-50">
          <View className="h-4 w-4 items-center justify-center rounded-full border-2 border-wind-700">
            <View className="h-1.5 w-1.5 rounded-full bg-wind-700" />
          </View>
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-sm font-bold text-slate-950">
            {overview?.shift.name ?? "Loading shift"}
          </Text>
          <Text className="mt-1 text-xs text-slate-500">
            {overview
              ? `${overview.shift.startTime} - ${overview.shift.endTime} · ${overview.shift.timezone}`
              : "Retrieving schedule"}
          </Text>
        </View>
      </View>

      <View className="mb-4 mt-8 flex-row items-end justify-between">
        <View>
          <Text className="text-xl font-bold text-slate-950">
            {overview?.employeeRole === "MANAGER" ? "Punch location policy" : "Verify location"}
          </Text>
          <Text className="mt-1 text-xs text-slate-500">
            {overview?.employeeRole === "MANAGER"
              ? "Your GPS coordinates are captured wherever you punch"
              : "You must be inside the green boundary"}
          </Text>
        </View>
        {overview?.employeeRole !== "MANAGER" ? (
          <View className="rounded-full bg-wind-50 px-3 py-1.5">
            <Text className="text-[10px] font-bold text-wind-700">ASSIGNED AREAS</Text>
          </View>
        ) : null}
      </View>

      {overview?.employeeRole === "MANAGER" ? (
        <View className="h-48 items-center justify-center rounded-[28px] border border-wind-100 bg-wind-50 px-6">
          <View className="h-12 w-12 items-center justify-center rounded-[18px] bg-white">
            <View className="h-4 w-4 items-center justify-center rounded-full border-2 border-wind-700">
              <View className="h-1.5 w-1.5 rounded-full bg-wind-700" />
            </View>
          </View>
          <Text className="mt-4 text-center text-sm font-bold text-wind-900">
            Coordinate-only attendance enabled
          </Text>
          <Text className="mt-2 text-center text-xs leading-5 text-slate-600">
            No administrator-created location is needed. Location permission is still required.
          </Text>
        </View>
      ) : (
        <GeofenceMap
          latitude={assignedLocation?.latitude}
          locationName={assignedLocation?.name ?? "No location assigned"}
          longitude={assignedLocation?.longitude}
          radiusMeters={assignedLocation?.geofenceRadiusMeters ?? 0}
        />
      )}

      <View className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4">
        <View className="flex-row items-center">
          <View className={`h-3 w-3 rounded-full ${assignedLocation ? "bg-emerald-500" : "bg-red-500"}`} />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-slate-950">
              {overview?.employeeRole === "MANAGER"
                ? "Punch from any GPS location"
                : assignedLocations.length
                ? `${assignedLocations.length} location${assignedLocations.length === 1 ? "" : "s"} available`
                : "Location not assigned"}
            </Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              {overview?.employeeRole === "MANAGER"
                ? "Home, client sites, and field locations are allowed; coordinates are retained for audit."
                : assignedLocation
                ? `${assignedLocations.map((location) => location.name).join(", ")} · Punch controls are available on Home.`
                : "Contact your administrator to configure attendance."}
            </Text>
          </View>
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
        <Text className="text-xl font-bold text-slate-950">Attendance history</Text>
        <Text className="mt-1 text-xs text-slate-500">Every entry below is recorded in the database.</Text>
      </View>

      <View className="mb-4 flex-row rounded-[20px] border border-slate-200 bg-white p-1.5">
        {periodLabels.map((item) => {
          const isActive = period === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={`min-h-12 flex-1 items-center justify-center rounded-[15px] ${
                isActive ? "bg-wind-900" : "bg-white active:bg-slate-50"
              }`}
              onPress={() => setPeriod(item.key)}
            >
              <Text className={`text-xs font-bold ${isActive ? "text-white" : "text-slate-500"}`}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
        {records.length === 0 ? (
          <View className="items-center px-5 py-10">
            <View className="h-12 w-12 items-center justify-center rounded-[18px] bg-slate-100">
              <View className="h-4 w-4 rounded-full border-2 border-slate-400" />
            </View>
            <Text className="mt-4 text-sm font-bold text-slate-700">
              {isLoading ? "Loading attendance" : "No attendance yet"}
            </Text>
            <Text className="mt-1 text-center text-xs leading-5 text-slate-500">
              {isLoading ? "Fetching your secure records..." : "Your first completed shift will appear here."}
            </Text>
          </View>
        ) : null}
        {records.map((record, index) => (
          <View
            key={record.id}
            className={`flex-row items-center px-4 py-4 ${index > 0 ? "border-t border-slate-100" : ""}`}
          >
            <View className="h-11 w-11 items-center justify-center rounded-[16px] bg-wind-50">
              <View className="h-3 w-3 rounded-full bg-wind-700" />
            </View>
            <View className="ml-3 flex-1 pr-2">
              <Text className="text-sm font-bold text-slate-950">{record.label}</Text>
              <Text className="mt-1 text-xs text-slate-500">{record.detail}</Text>
            </View>
            <View className="items-end">
              <Text className="text-sm font-bold text-slate-950">{record.hours}</Text>
              <Text className="mt-1 text-[10px] font-bold text-wind-700">{record.status}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
