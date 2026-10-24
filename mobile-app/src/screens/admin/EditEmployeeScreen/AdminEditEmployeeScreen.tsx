import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import FormField from "../../../components/FormField/FormField";
import {
  ApiError,
  getAttendanceLocations,
  updateEmployee,
} from "../../../services/api";
import type {
  AttendanceLocation,
  Employee,
  EmployeeRole,
} from "../../../types/api";

type Props = {
  employee: Employee;
  onCancel: () => void;
  onSaved: () => void;
};

export default function AdminEditEmployeeScreen({ employee, onCancel, onSaved }: Props) {
  const [fullName, setFullName] = useState(employee.fullName);
  const [email, setEmail] = useState(employee.email);
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [designation, setDesignation] = useState(employee.designation ?? "");
  const [department, setDepartment] = useState(employee.department ?? "");
  const [employeeRole, setEmployeeRole] = useState<EmployeeRole>(employee.employeeRole);
  const [locationIds, setLocationIds] = useState(
    employee.attendanceLocations.map((location) => location.id),
  );
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    getAttendanceLocations()
      .then((response) => {
        if (mounted) setLocations(response.locations);
      })
      .catch((requestError) => {
        if (mounted) {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : "Unable to load attendance locations.",
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    if (!fullName.trim() || !email.trim() || !designation.trim() || !department.trim()) {
      setError("Name, email, designation, and department are required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid work email address.");
      return;
    }
    if (phone && !/^\d{10}$/.test(phone)) {
      setError("Phone number must contain exactly 10 digits.");
      return;
    }
    if (employeeRole === "EMPLOYEE" && locationIds.length === 0) {
      setError("Assign at least one attendance location to an employee.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await updateEmployee(employee.id, {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone || null,
        designation: designation.trim(),
        department: department.trim(),
        employeeRole,
        attendanceLocationIds: locationIds,
      });
      onSaved();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to update the employee profile.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-[#f6f8f4]"
      contentContainerClassName="px-5 pb-8 pt-4"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-sm font-semibold text-wind-700">PROFILE MANAGEMENT</Text>
      <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">Edit employee</Text>
      <Text className="mt-2 text-sm text-slate-500">{employee.employeeId}</Text>

      {error ? (
        <View className="mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-4">
          <Text className="text-sm font-semibold text-red-700">{error}</Text>
        </View>
      ) : null}

      <View className="mt-5 rounded-[26px] border border-slate-200 bg-white p-5">
        <FormField
          editable={!isSaving}
          label="Full name *"
          onChangeText={setFullName}
          value={fullName}
        />
        <FormField
          autoCapitalize="none"
          editable={!isSaving}
          keyboardType="email-address"
          label="Work email *"
          onChangeText={setEmail}
          value={email}
        />
        <FormField
          editable={!isSaving}
          helperText="Enter exactly 10 digits without +91."
          keyboardType="phone-pad"
          label="Phone number"
          maxLength={10}
          onChangeText={(value) => setPhone(value.replace(/\D/g, "").slice(0, 10))}
          value={phone}
        />
        <FormField
          editable={!isSaving}
          label="Designation *"
          onChangeText={setDesignation}
          value={designation}
        />
        <FormField
          editable={!isSaving}
          label="Department *"
          onChangeText={setDepartment}
          value={department}
        />
      </View>

      <View className="mt-4 rounded-[26px] border border-slate-200 bg-white p-5">
        <Text className="mb-3 text-sm font-semibold text-slate-700">Employee role *</Text>
        <View className="flex-row gap-3">
          {(["EMPLOYEE", "MANAGER"] as EmployeeRole[]).map((role) => {
            const selected = employeeRole === role;
            return (
              <Pressable
                key={role}
                className={`min-h-14 flex-1 items-center justify-center rounded-2xl border ${
                  selected ? "border-wind-700 bg-wind-50" : "border-slate-200 bg-slate-50"
                }`}
                disabled={isSaving}
                onPress={() => setEmployeeRole(role)}
              >
                <Text className={`text-sm font-bold ${selected ? "text-wind-800" : "text-slate-600"}`}>
                  {role === "MANAGER" ? "Manager" : "Employee"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-3 mt-6 text-sm font-semibold text-slate-700">
          Attendance locations {employeeRole === "EMPLOYEE" ? "*" : "(optional)"}
        </Text>
        <View className="overflow-hidden rounded-2xl border border-slate-200">
          {locations.map((location, index) => {
            const selected = locationIds.includes(location.id);
            return (
              <Pressable
                key={location.id}
                className={`min-h-12 flex-row items-center justify-between bg-white px-4 ${
                  index > 0 ? "border-t border-slate-100" : ""
                }`}
                disabled={isSaving}
                onPress={() =>
                  setLocationIds((current) =>
                    current.includes(location.id)
                      ? current.filter((id) => id !== location.id)
                      : [...current, location.id],
                  )
                }
              >
                <Text className={`text-sm font-semibold ${selected ? "text-wind-700" : "text-slate-700"}`}>
                  {location.name}
                </Text>
                <View className={`h-5 w-5 rounded-md border ${selected ? "border-wind-700 bg-wind-700" : "border-slate-300"}`} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="mt-5 flex-row gap-3">
        <Pressable
          className="min-h-14 flex-1 items-center justify-center rounded-[18px] border border-slate-300 bg-white"
          disabled={isSaving}
          onPress={onCancel}
        >
          <Text className="font-bold text-slate-700">Cancel</Text>
        </Pressable>
        <Pressable
          className={`min-h-14 flex-1 items-center justify-center rounded-[18px] ${isSaving ? "bg-wind-600" : "bg-wind-700"}`}
          disabled={isSaving}
          onPress={() => void handleSave()}
        >
          <Text className="font-bold text-white">{isSaving ? "Saving..." : "Save changes"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
