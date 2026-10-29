import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";

import ConfirmDialog from "../../../components/ConfirmDialog/ConfirmDialog";
import ResetCredentialsDialog from "../../../components/ResetCredentialsDialog/ResetCredentialsDialog";
import {
  ApiError,
  deleteEmployee,
  getEmployees,
  resetEmployeeCredentials,
  setEmployeeArchived,
} from "../../../services/api";
import type { Employee, EmployeesResponse } from "../../../types/api";

type Props = {
  revision?: number;
  onAddEmployee: () => void;
  onEditEmployee: (employee: Employee) => void;
};

type PendingEmployeeAction = {
  employee: Employee;
  action: "archive" | "restore" | "delete";
};

const emptyData: EmployeesResponse = { employees: [], summary: { total: 0, active: 0 } };

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function statusLabel(status: string) {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function EmployeeCard({
  employee,
  isBusy,
  onArchive,
  onDelete,
  onEdit,
  onResetCredentials,
}: {
  employee: Employee;
  isBusy: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onResetCredentials: () => void;
}) {
  const isActive = employee.isActive && employee.status.toUpperCase() === "ACTIVE";

  return (
    <View className="mb-3 rounded-[24px] border border-slate-200 bg-white p-4">
      <View className="flex-row items-center">
        <View className="h-12 w-12 items-center justify-center rounded-[17px] bg-wind-50">
          <Text className="text-sm font-bold text-wind-700">{initials(employee.fullName)}</Text>
        </View>
        <View className="ml-3 flex-1 pr-2">
          <Text className="text-base font-bold text-slate-950">{employee.fullName}</Text>
          <Text className="mt-1 text-xs text-slate-500">
            {employee.employeeId} · {employee.designation ?? "No designation"} · {employee.employeeRole === "MANAGER" ? "Manager" : "Employee"}
          </Text>
        </View>
        <View className={`rounded-full px-3 py-1.5 ${isActive ? "bg-wind-50" : "bg-slate-100"}`}>
          <Text className={`text-[10px] font-bold ${isActive ? "text-wind-700" : "text-slate-600"}`}>
            {statusLabel(employee.status).toUpperCase()}
          </Text>
        </View>
      </View>

      <View className="mt-4 flex-row items-center rounded-[16px] bg-slate-50 px-3 py-3">
        <View className="h-2.5 w-2.5 rounded-full bg-wind-600" />
        <View className="ml-2 flex-1">
          <Text className="text-xs font-semibold text-slate-700">
            {employee.department ?? "Department not assigned"}
          </Text>
          <Text className="mt-1 text-[11px] text-slate-500">
            {employee.employeeRole === "MANAGER"
              ? "All active attendance locations"
              : employee.attendanceLocations.length
                ? employee.attendanceLocations.map((location) => location.name).join(", ")
                : "Attendance location not assigned"}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row justify-end gap-2">
        {isActive ? <Pressable
          accessibilityHint="Sets a new password and signs out existing sessions"
          accessibilityLabel={`Reset credentials for ${employee.fullName}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy }}
          className="h-11 w-11 items-center justify-center rounded-[14px] border border-sky-100 bg-sky-50 active:bg-sky-100"
          disabled={isBusy}
          onPress={onResetCredentials}
        >
          <Ionicons color="#0369a1" name="key-outline" size={21} />
        </Pressable> : null}
        {isActive ? <Pressable
          accessibilityHint="Opens this employee's profile for editing"
          accessibilityLabel={`Edit ${employee.fullName}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy }}
          className="h-11 w-11 items-center justify-center rounded-[14px] border border-wind-100 bg-wind-50 active:bg-wind-100"
          disabled={isBusy}
          onPress={onEdit}
        >
          <Ionicons color="#047857" name="create-outline" size={22} />
        </Pressable> : null}
        <Pressable
          accessibilityHint={
            isActive
              ? "Disables login while keeping attendance history"
              : "Unarchives this employee and allows login again"
          }
          accessibilityLabel={`${isActive ? "Archive" : "Restore"} ${employee.fullName}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy }}
          className="h-11 w-11 items-center justify-center rounded-[14px] border border-amber-100 bg-amber-50 active:bg-amber-100"
          disabled={isBusy}
          onPress={onArchive}
        >
          {isBusy ? (
            <ActivityIndicator color="#b45309" size="small" />
          ) : (
            <Ionicons
              color="#b45309"
              name={isActive ? "archive-outline" : "arrow-undo-outline"}
              size={21}
            />
          )}
        </Pressable>
        <Pressable
          accessibilityHint={isActive ? "Permanently deletes this employee and their attendance records" : "Permanently deletes this archived employee and their attendance records"}
          accessibilityLabel={`Delete ${employee.fullName}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy }}
          className="h-11 w-11 items-center justify-center rounded-[14px] border border-red-100 bg-red-50 active:bg-red-100"
          disabled={isBusy}
          onPress={onDelete}
        >
          <Ionicons color="#b91c1c" name="trash-outline" size={21} />
        </Pressable>
      </View>
    </View>
  );
}

export default function AdminEmployeesScreen({
  revision = 0,
  onAddEmployee,
  onEditEmployee,
}: Props) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState(emptyData);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyEmployeeId, setBusyEmployeeId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingEmployeeAction | null>(null);
  const [credentialEmployee, setCredentialEmployee] = useState<Employee | null>(null);
  const [credentialError, setCredentialError] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const loadEmployees = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setError("");

    try {
      setData(await getEmployees());
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to load employees right now.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const archiveEmployee = (employee: Employee) => {
    setPendingAction({
      employee,
      action: employee.isActive ? "archive" : "restore",
    });
  };

  const confirmDeleteEmployee = (employee: Employee) => {
    setPendingAction({ employee, action: "delete" });
  };

  const runPendingAction = async () => {
    if (!pendingAction) return;

    const { action, employee } = pendingAction;
    setBusyEmployeeId(employee.id);
    setError("");

    try {
      if (action === "delete") {
        await deleteEmployee(employee.id);
      } else {
        await setEmployeeArchived(employee.id, action === "archive");
      }
      setPendingAction(null);
      await loadEmployees();
    } catch (requestError) {
      setPendingAction(null);
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : action === "delete"
            ? "Unable to delete the employee."
            : "Unable to update the employee status.",
      );
    } finally {
      setBusyEmployeeId(null);
    }
  };

  const resetCredentials = async (password: string) => {
    if (!credentialEmployee) return;
    setBusyEmployeeId(credentialEmployee.id);
    setCredentialError("");
    setNotice("");
    try {
      await resetEmployeeCredentials(credentialEmployee.id, password);
      setCredentialEmployee(null);
      setNotice(`Credentials reset successfully for ${credentialEmployee.fullName}.`);
    } catch (requestError) {
      setCredentialError(requestError instanceof ApiError ? requestError.message : "Unable to reset credentials.");
    } finally {
      setBusyEmployeeId(null);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees, revision]);

  const visibleEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const directory = data.employees.filter((employee) =>
      showArchived ? !employee.isActive : employee.isActive,
    );
    if (!normalizedQuery) return directory;
    return directory.filter((employee) =>
      [
        employee.fullName,
        employee.employeeId,
        employee.designation,
        employee.department,
        employee.employeeRole,
        ...employee.attendanceLocations.map((location) => location.name),
      ].some((value) => value?.toLowerCase().includes(normalizedQuery)),
    );
  }, [data.employees, query, showArchived]);

  const header = (
    <View>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-4">
          <Text className="text-sm font-semibold text-wind-700">PEOPLE OPERATIONS</Text>
          <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">{showArchived ? "Archived employees" : "Your workforce"}</Text>
          <Text className="mt-2 text-sm leading-5 text-slate-500">
            {showArchived ? "Restore archived profiles or remove them permanently." : "Employees, roles, and attendance assignments in one place."}
          </Text>
        </View>
        <View className="flex-row gap-2">
        <Pressable
          accessibilityLabel="Add employee"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-[17px] bg-wind-700 active:bg-wind-800"
          onPress={onAddEmployee}
        >
          <View className="absolute h-0.5 w-5 rounded-full bg-white" />
          <View className="absolute h-5 w-0.5 rounded-full bg-white" />
        </Pressable>
        </View>
      </View>

      <View className="mt-6 overflow-hidden rounded-[28px] bg-wind-900 p-5">
        <View className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-wind-800" />
        <Text className="text-xs font-semibold text-emerald-100">WORKFORCE OVERVIEW</Text>
        <View className="mt-5 flex-row">
          <View className="flex-1">
            <Text className="text-[34px] font-bold text-white">{data.summary.total}</Text>
            <Text className="mt-1 text-xs text-emerald-100">Total employees</Text>
          </View>
          <View className="w-px bg-wind-700" />
          <View className="flex-1 pl-6">
            <Text className="text-[34px] font-bold text-white">{data.summary.active}</Text>
            <Text className="mt-1 text-xs text-emerald-100">Active profiles</Text>
          </View>
        </View>
        <View className="mt-5 flex-row items-center rounded-[18px] bg-wind-800 px-4 py-3">
          <View className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          <Text className="ml-2 text-xs font-semibold text-emerald-100">
            {data.summary.total - data.summary.active} inactive or on leave
          </Text>
        </View>
      </View>

      {error ? (
        <View className="mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-4">
          <Text accessibilityLiveRegion="polite" className="text-sm font-semibold leading-5 text-red-700">
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="mt-3 min-h-12 items-center justify-center rounded-[15px] bg-red-700"
            onPress={() => void loadEmployees()}
          >
            <Text className="text-xs font-bold text-white">Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? (
        <View className="mt-4 rounded-[20px] border border-wind-200 bg-wind-50 px-4 py-4">
          <Text accessibilityLiveRegion="polite" className="text-sm font-semibold leading-5 text-wind-700">{notice}</Text>
        </View>
      ) : null}

      <View className="mt-5 min-h-14 flex-row items-center rounded-[18px] border border-slate-200 bg-white px-4">
        <View className="mr-3 h-4 w-4 rounded-full border-2 border-slate-400" />
        <TextInput
          accessibilityLabel="Search employees"
          className="min-h-14 flex-1 text-base text-slate-950 outline-none"
          onChangeText={setQuery}
          placeholder={showArchived ? "Search archived employees" : "Search name, ID, role, team, or location"}
          placeholderTextColor="#94a3b8"
          value={query}
        />
      </View>

      <View className="mb-3 mt-7 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-xl font-bold text-slate-950">{showArchived ? "Archive directory" : "Employee directory"}</Text>
          <Text className="mt-1 text-xs text-slate-500">{visibleEmployees.length} profiles shown</Text>
        </View>
        <Pressable
          accessibilityLabel={showArchived ? "Show active employees" : "Show archived employees"}
          accessibilityRole="button"
          className={`h-11 flex-row items-center justify-center rounded-[14px] border px-3 ${showArchived ? "border-wind-700 bg-wind-50" : "border-slate-200 bg-white"}`}
          onPress={() => { setShowArchived((current) => !current); setQuery(""); }}
        >
          <Ionicons color={showArchived ? "#047857" : "#64748b"} name={showArchived ? "arrow-back-outline" : "archive-outline"} size={19} />
          <Text className={`ml-2 text-xs font-bold ${showArchived ? "text-wind-700" : "text-slate-600"}`}>{showArchived ? "Active" : "Archived"}</Text>
        </Pressable>
      </View>
    </View>
  );

  const dialogTitle =
    pendingAction?.action === "delete"
      ? "Permanently delete employee?"
      : pendingAction?.action === "archive"
        ? "Archive employee?"
        : "Restore employee?";
  const dialogMessage = pendingAction
    ? pendingAction.action === "delete"
      ? `${pendingAction.employee.fullName} and their attendance records will be permanently deleted. This cannot be undone.`
      : pendingAction.action === "archive"
        ? `${pendingAction.employee.fullName} will be signed out and unable to log in. Attendance history will be preserved.`
        : `${pendingAction.employee.fullName} will be able to log in again.`
    : "";
  const dialogConfirmLabel =
    pendingAction?.action === "delete"
      ? "Delete permanently"
      : pendingAction?.action === "archive"
        ? "Archive"
        : "Restore";

  return (
    <>
      <FlatList
      className="flex-1 bg-[#f6f8f4]"
      contentContainerClassName="px-5 pb-8 pt-4"
      data={visibleEmployees}
      keyExtractor={(employee) => employee.id}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        error ? undefined : (
          <View className="items-center rounded-[24px] border border-slate-200 bg-white px-6 py-10">
            <View className="h-12 w-12 items-center justify-center rounded-[18px] bg-wind-50">
              <View className="h-4 w-4 rounded-full border-2 border-wind-700" />
            </View>
            <Text className="mt-4 text-base font-bold text-slate-950">
              {isLoading ? "Loading workforce" : query ? "No matching employees" : showArchived ? "No archived employees" : "Build your team"}
            </Text>
            <Text className="mt-1 text-center text-xs leading-5 text-slate-500">
              {isLoading
                ? "Reading employee profiles from the database..."
                : query
                  ? "Try a different name, ID, department, or location."
                  : showArchived
                    ? "Archived employee profiles will appear here."
                    : "Create the first employee profile to get started."}
            </Text>
            {!isLoading && !query && !showArchived ? (
              <Pressable
                accessibilityRole="button"
                className="mt-4 min-h-12 items-center justify-center rounded-[15px] bg-wind-700 px-5"
                onPress={onAddEmployee}
              >
                <Text className="text-xs font-bold text-white">Add employee</Text>
              </Pressable>
            ) : null}
          </View>
        )
      }
      ListHeaderComponent={header}
      onRefresh={() => void loadEmployees(true)}
      refreshing={isRefreshing}
      renderItem={({ item }) => (
        <EmployeeCard
          employee={item}
          isBusy={busyEmployeeId === item.id}
          onArchive={() => archiveEmployee(item)}
          onDelete={() => confirmDeleteEmployee(item)}
          onEdit={() => onEditEmployee(item)}
          onResetCredentials={() => { setCredentialError(""); setCredentialEmployee(item); }}
        />
      )}
        showsVerticalScrollIndicator={false}
      />
      <ConfirmDialog
        confirmLabel={dialogConfirmLabel}
        isBusy={busyEmployeeId === pendingAction?.employee.id}
        message={dialogMessage}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void runPendingAction()}
        title={dialogTitle}
        variant={pendingAction?.action === "restore" ? "default" : pendingAction?.action === "archive" ? "warning" : "danger"}
        visible={pendingAction !== null}
      />
      <ResetCredentialsDialog
        employeeName={credentialEmployee?.fullName ?? "this employee"}
        error={credentialError}
        isBusy={busyEmployeeId === credentialEmployee?.id}
        onCancel={() => { if (!busyEmployeeId) setCredentialEmployee(null); }}
        onSubmit={(password) => void resetCredentials(password)}
        visible={credentialEmployee !== null}
      />
    </>
  );
}
