import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";

import { ApiError, getAdminAttendanceLogs } from "../../../services/api";
import type { AdminAttendancePeriod } from "../../../types/admin";
import type { AdminAttendanceLog, AdminAttendanceLogsResponse } from "../../../types/api";

const periods: Array<{ key: AdminAttendancePeriod; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining.toString().padStart(2, "0")}m`;
}

function formatDate(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  });
}

function formatTime(value: string | null, timezone: string) {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

function formatRange(report: AdminAttendanceLogsResponse | null) {
  if (!report) return "Loading report period...";
  if (report.period === "daily") {
    return formatDate(report.range.startDate, { weekday: "long", month: "long" });
  }
  if (report.period === "monthly") {
    return formatDate(report.range.startDate, { day: undefined, month: "long" });
  }
  return `${formatDate(report.range.startDate)} - ${formatDate(report.range.endDate)}`;
}

function checkoutLabel(reason: AdminAttendanceLog["punchOutReason"]) {
  if (reason === "AUTO_SHIFT_END") return "Auto at shift end";
  if (reason === "AUTO_MAX_DURATION") return "Auto at 8h limit";
  if (reason === "MANUAL") return "Manual checkout";
  return "Currently working";
}

function AttendanceLogCard({ log }: { log: AdminAttendanceLog }) {
  const isWorking = log.status === "IN_PROGRESS";

  return (
    <View className="mb-3 rounded-[24px] border border-slate-200 bg-white p-4">
      <View className="flex-row items-center">
        <View className="h-12 w-12 items-center justify-center rounded-[17px] bg-wind-50">
          <Text className="text-sm font-bold text-wind-700">{initials(log.employee.fullName)}</Text>
        </View>
        <View className="ml-3 flex-1 pr-2">
          <Text className="text-base font-bold text-slate-950">{log.employee.fullName}</Text>
          <Text className="mt-1 text-xs text-slate-500">
            {log.employee.employeeId} · {log.employee.designation ?? "No designation"}
          </Text>
        </View>
        <View className={`rounded-full px-3 py-1.5 ${isWorking ? "bg-amber-50" : "bg-wind-50"}`}>
          <Text className={`text-[10px] font-bold ${isWorking ? "text-amber-700" : "text-wind-700"}`}>
            {isWorking ? "ON SHIFT" : "COMPLETED"}
          </Text>
        </View>
      </View>

      <View className="my-4 h-px bg-slate-100" />

      <View className="flex-row">
        <View className="flex-1">
          <Text className="text-[10px] font-semibold text-slate-400">CHECK IN</Text>
          <Text className="mt-1 text-base font-bold text-slate-950">
            {formatTime(log.punchInAt, log.shift.timezone)}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-[10px] font-semibold text-slate-400">CHECK OUT</Text>
          <Text className="mt-1 text-base font-bold text-slate-950">
            {formatTime(log.punchOutAt, log.shift.timezone)}
          </Text>
        </View>
        <View className="flex-1 items-end">
          <Text className="text-[10px] font-semibold text-slate-400">WORKED</Text>
          <Text className="mt-1 text-base font-bold text-wind-800">
            {formatMinutes(log.durationMinutes)}
          </Text>
        </View>
      </View>

      <View className="mt-4 rounded-[16px] bg-slate-50 px-3 py-3">
        <View className="flex-row items-center">
          <View className="h-2.5 w-2.5 rounded-full bg-wind-600" />
          <Text className="ml-2 flex-1 text-xs font-semibold text-slate-700">{log.location.name}</Text>
          <Text className="text-xs text-slate-500">{formatDate(log.attendanceDate)}</Text>
        </View>
        <Text className="mt-2 text-[11px] leading-4 text-slate-500">
          {log.shift.name} · {log.employee.department ?? "No department"} · {checkoutLabel(log.punchOutReason)}
        </Text>
        <Text className="mt-1 text-[11px] leading-4 text-slate-400">
          Check-in GPS: {Math.round(log.punchIn.distanceMeters)} m from center · ±{Math.round(log.punchIn.accuracyMeters)} m accuracy
        </Text>
      </View>

      {log.isLate ? (
        <View className="mt-3 self-start rounded-full bg-red-50 px-3 py-1.5">
          <Text className="text-[10px] font-bold text-red-700">LATE ARRIVAL</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function AdminAttendanceLogsScreen() {
  const [period, setPeriod] = useState<AdminAttendancePeriod>("daily");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<AdminAttendanceLogsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadReport = useCallback(async (selectedPeriod: AdminAttendancePeriod, refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    else {
      setIsLoading(true);
      setReport(null);
    }
    setError("");

    try {
      setReport(await getAdminAttendanceLogs(selectedPeriod));
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to load the attendance report.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadReport(period);
  }, [loadReport, period]);

  const visibleLogs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return report?.logs ?? [];
    return (report?.logs ?? []).filter((log) =>
      [
        log.employee.fullName,
        log.employee.employeeId,
        log.employee.department,
        log.location.name,
      ].some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [query, report]);

  const header = (
    <View>
      <Text className="text-sm font-semibold text-wind-700">WORKFORCE INSIGHTS</Text>
      <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">Attendance reports</Text>
      <Text className="mt-2 text-sm leading-5 text-slate-500">
        Real check-in and checkout records from your workforce.
      </Text>

      <View className="mt-6 flex-row rounded-[20px] border border-slate-200 bg-white p-1.5">
        {periods.map((item) => {
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

      <View className="mt-4 overflow-hidden rounded-[28px] bg-wind-900 p-5">
        <View className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-wind-800" />
        <Text className="text-xs font-semibold text-emerald-100">{formatRange(report)}</Text>
        <View className="mt-5 flex-row">
          <View className="flex-1">
            <Text className="text-[28px] font-bold text-white">
              {report?.summary.totalRecords ?? "--"}
            </Text>
            <Text className="mt-1 text-xs text-emerald-100">Attendance records</Text>
          </View>
          <View className="w-px bg-wind-700" />
          <View className="flex-1 pl-5">
            <Text className="text-[28px] font-bold text-white">
              {report ? formatMinutes(report.summary.totalMinutes) : "--"}
            </Text>
            <Text className="mt-1 text-xs text-emerald-100">Total work time</Text>
          </View>
        </View>
        <View className="mt-5 flex-row rounded-[18px] bg-wind-800 px-4 py-3">
          <Text className="flex-1 text-xs font-semibold text-emerald-100">
            {report?.summary.uniqueEmployees ?? 0} employees
          </Text>
          <Text className="text-xs font-semibold text-emerald-100">
            {report?.summary.inProgress ?? 0} currently working
          </Text>
        </View>
      </View>

      <View className="mt-5 min-h-14 flex-row items-center rounded-[18px] border border-slate-200 bg-white px-4">
        <View className="mr-3 h-4 w-4 rounded-full border-2 border-slate-400" />
        <TextInput
          accessibilityLabel="Search attendance reports"
          className="min-h-14 flex-1 text-base text-slate-950 outline-none"
          onChangeText={setQuery}
          placeholder="Search employee, ID, team, or location"
          placeholderTextColor="#94a3b8"
          value={query}
        />
      </View>

      <View className="mb-3 mt-7 flex-row items-end justify-between">
        <View>
          <Text className="text-xl font-bold text-slate-950">Employee logs</Text>
          <Text className="mt-1 text-xs text-slate-500">{visibleLogs.length} records shown</Text>
        </View>
        {report && report.summary.lateRecords > 0 ? (
          <View className="rounded-full bg-red-50 px-3 py-1.5">
            <Text className="text-[10px] font-bold text-red-700">
              {report.summary.lateRecords} LATE
            </Text>
          </View>
        ) : null}
      </View>

      {error ? (
        <View className="mb-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-4">
          <Text accessibilityLiveRegion="polite" className="text-sm font-semibold leading-5 text-red-700">
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="mt-3 min-h-12 items-center justify-center rounded-[15px] bg-red-700"
            onPress={() => void loadReport(period)}
          >
            <Text className="text-xs font-bold text-white">Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      className="flex-1 bg-[#f6f8f4]"
      contentContainerClassName="px-5 pb-8 pt-4"
      data={visibleLogs}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        !error ? (
          <View className="items-center rounded-[24px] border border-slate-200 bg-white px-6 py-10">
            <View className="h-12 w-12 items-center justify-center rounded-[18px] bg-wind-50">
              <View className="h-4 w-4 rounded-full border-2 border-wind-700" />
            </View>
            <Text className="mt-4 text-base font-bold text-slate-950">
              {isLoading ? "Loading attendance" : "No records found"}
            </Text>
            <Text className="mt-1 text-center text-xs leading-5 text-slate-500">
              {isLoading
                ? "Reading employee sessions from the database..."
                : query
                  ? "Try another employee, ID, team, or location."
                  : `No ${period} attendance has been recorded yet.`}
            </Text>
          </View>
        ) : null
      }
      ListHeaderComponent={header}
      onRefresh={() => void loadReport(period, true)}
      refreshing={isRefreshing}
      renderItem={({ item }) => <AttendanceLogCard log={item} />}
      showsVerticalScrollIndicator={false}
    />
  );
}
