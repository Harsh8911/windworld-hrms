import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import FormField from "../../../components/FormField/FormField";
import PasswordVisibilityButton from "../../../components/PasswordVisibilityButton/PasswordVisibilityButton";
import {
  ApiError,
  createEmployee,
  getAttendanceLocations,
  getNextEmployeeId,
} from "../../../services/api";
import type { AttendanceLocation } from "../../../types/api";

type EmployeeForm = {
  fullName: string;
  employeeId: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  password: string;
};

type Props = { onCreated?: () => void };

const initialForm: EmployeeForm = {
  fullName: "",
  employeeId: "",
  email: "",
  phone: "",
  designation: "",
  department: "",
  password: "",
};

export default function AdminAddEmployeeScreen({ onCreated }: Props) {
  const [form, setForm] = useState(initialForm);
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [locationId, setLocationId] = useState("");
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingEmployeeId, setIsGeneratingEmployeeId] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.allSettled([getAttendanceLocations(), getNextEmployeeId()])
      .then(([locationsResult, employeeIdResult]) => {
        if (!isMounted) return;

        if (locationsResult.status === "fulfilled") {
          const nextLocations = locationsResult.value.locations;
          setLocations(nextLocations);
          setLocationId(
            (nextLocations.find((item) => item.isPrimary) ?? nextLocations[0])?.id ?? "",
          );
        }

        if (employeeIdResult.status === "fulfilled") {
          setForm((current) => ({
            ...current,
            employeeId: employeeIdResult.value.employeeId,
          }));
        }

        const failedRequest = [locationsResult, employeeIdResult].find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (failedRequest) {
          setError(
            failedRequest.reason instanceof ApiError
              ? failedRequest.reason.message
              : "Unable to prepare part of the employee form.",
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsGeneratingEmployeeId(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateField = (field: keyof EmployeeForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const handleSubmit = async () => {
    const requiredValues = [
      form.fullName,
      form.employeeId,
      form.email,
      form.designation,
      form.department,
      form.password,
    ];
    if (requiredValues.some((value) => !value.trim())) {
      setError(
        "Full name, employee ID, email, designation, department, and password are required.",
      );
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setError("Enter a valid work email address.");
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(form.employeeId.trim())) {
      setError("Employee ID may contain letters, numbers, hyphens, and underscores.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    if (form.password.length > 72) {
      setError("Password must not exceed 72 characters.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await createEmployee({
        fullName: form.fullName.trim(),
        employeeId: form.employeeId.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        designation: form.designation.trim(),
        department: form.department.trim(),
        password: form.password,
        attendanceLocationId: locationId || undefined,
      });
      setForm(initialForm);
      setShowPassword(false);
      onCreated?.();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to create the employee right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedLocation = locations.find((item) => item.id === locationId);

  return (
    <ScrollView
      className="flex-1 bg-[#f6f8f4]"
      contentContainerClassName="px-5 pb-8 pt-4"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-sm font-semibold text-wind-700">EMPLOYEE ONBOARDING</Text>
      <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">Create a team profile</Text>
      <Text className="mt-2 text-sm leading-5 text-slate-500">
        Set up secure login access, work details, and an attendance boundary.
      </Text>

      <View className="mt-6 overflow-hidden rounded-[26px] bg-wind-900 p-5">
        <View className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-wind-800" />
        <Text className="text-xs font-semibold text-emerald-100">NEXT EMPLOYEE ID</Text>
        <Text className="mt-2 text-[30px] font-bold text-white">
          {isGeneratingEmployeeId ? "Generating..." : form.employeeId || "Custom ID"}
        </Text>
        <Text className="mt-2 max-w-[85%] text-xs leading-5 text-emerald-100">
          Generated from the database sequence and editable before creation.
        </Text>
      </View>

      {error ? (
        <View className="mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-4">
          <Text accessibilityLiveRegion="polite" className="text-sm font-semibold leading-5 text-red-700">
            {error}
          </Text>
        </View>
      ) : null}

      <View className="mt-5 rounded-[26px] border border-slate-200 bg-white p-5">
        <View className="mb-5 flex-row items-center">
          <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-wind-700">
            <Text className="text-sm font-bold text-white">01</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-lg font-bold text-slate-950">Identity and access</Text>
            <Text className="mt-1 text-xs text-slate-500">Details used for employee login</Text>
          </View>
        </View>
        <FormField
          autoCapitalize="words"
          editable={!isSubmitting}
          label="Full name *"
          onChangeText={(value) => updateField("fullName", value)}
          placeholder="e.g. Ananya Deshmukh"
          value={form.fullName}
        />
        <FormField
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!isSubmitting && !isGeneratingEmployeeId}
          helperText="Generated automatically, but customizable before saving."
          label="Employee ID *"
          onChangeText={(value) => updateField("employeeId", value)}
          placeholder={isGeneratingEmployeeId ? "Generating employee ID..." : "e.g. WW-001"}
          value={form.employeeId}
        />
        <FormField
          autoCapitalize="none"
          editable={!isSubmitting}
          keyboardType="email-address"
          label="Work email *"
          onChangeText={(value) => updateField("email", value)}
          placeholder="name@windworld.com"
          value={form.email}
        />
        <FormField
          editable={!isSubmitting}
          keyboardType="phone-pad"
          label="Phone number"
          onChangeText={(value) => updateField("phone", value)}
          placeholder="+91 98765 43210"
          value={form.phone}
        />
      </View>

      <View className="mt-4 rounded-[26px] border border-slate-200 bg-white p-5">
        <View className="mb-5 flex-row items-center">
          <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-wind-50">
            <Text className="text-sm font-bold text-wind-700">02</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-lg font-bold text-slate-950">Role and security</Text>
            <Text className="mt-1 text-xs text-slate-500">Work assignment and initial password</Text>
          </View>
        </View>
        <FormField
          autoCapitalize="words"
          editable={!isSubmitting}
          label="Designation *"
          onChangeText={(value) => updateField("designation", value)}
          placeholder="e.g. Site Engineer"
          value={form.designation}
        />
        <FormField
          autoCapitalize="words"
          editable={!isSubmitting}
          label="Department *"
          onChangeText={(value) => updateField("department", value)}
          placeholder="e.g. Operations"
          value={form.department}
        />
        <FormField
          autoCapitalize="none"
          autoComplete="new-password"
          editable={!isSubmitting}
          helperText="Use at least 8 characters. The employee can sign in with this password."
          label="Password *"
          onChangeText={(value) => updateField("password", value)}
          placeholder="Create a login password"
          rightAccessory={
            <PasswordVisibilityButton
              onPress={() => setShowPassword((current) => !current)}
              visible={showPassword}
            />
          }
          secureTextEntry={!showPassword}
          textContentType="newPassword"
          value={form.password}
        />
      </View>

      <View className="mt-4 rounded-[26px] border border-slate-200 bg-white p-5">
        <View className="mb-5 flex-row items-center">
          <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-wind-50">
            <Text className="text-sm font-bold text-wind-700">03</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-lg font-bold text-slate-950">Attendance assignment</Text>
            <Text className="mt-1 text-xs text-slate-500">Select the secure punch boundary</Text>
          </View>
        </View>

        <Text className="mb-3 text-sm font-semibold text-slate-700">Attendance location</Text>
        <Pressable
          accessibilityLabel="Select attendance location"
          accessibilityRole="button"
          accessibilityState={{ expanded: isLocationDropdownOpen }}
          className={`min-h-14 flex-row items-center justify-between rounded-2xl border bg-slate-50 px-4 active:bg-slate-100 ${
            isLocationDropdownOpen ? "border-wind-700" : "border-slate-200"
          }`}
          disabled={locations.length === 0 || isSubmitting}
          onPress={() => setIsLocationDropdownOpen((current) => !current)}
        >
          <Text className={`flex-1 text-base font-semibold ${selectedLocation ? "text-slate-950" : "text-slate-400"}`}>
            {selectedLocation?.name ?? "No attendance locations available"}
          </Text>
          <View className="ml-3 h-3 w-3 rotate-45 border-b-2 border-r-2 border-wind-700" />
        </Pressable>

        {isLocationDropdownOpen ? (
          <View className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {locations.map((item, index) => {
              const isSelected = locationId === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className={`min-h-12 flex-row items-center justify-between px-4 active:bg-slate-50 ${
                    index > 0 ? "border-t border-slate-100" : ""
                  }`}
                  onPress={() => {
                    setLocationId(item.id);
                    setIsLocationDropdownOpen(false);
                  }}
                >
                  <Text className={`text-sm font-semibold ${isSelected ? "text-wind-700" : "text-slate-700"}`}>
                    {item.name}
                  </Text>
                  {isSelected ? <View className="h-3 w-3 rounded-full bg-wind-700" /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {selectedLocation ? (
          <View className="mt-4 flex-row items-center rounded-[16px] bg-wind-50 px-3 py-3">
            <View className="h-2.5 w-2.5 rounded-full bg-wind-700" />
            <Text className="ml-2 flex-1 text-xs font-semibold text-wind-900">
              {selectedLocation.geofenceRadiusMeters} m geofence · {selectedLocation.isPrimary ? "Primary location" : "Active location"}
            </Text>
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
        className={`mt-5 min-h-14 items-center justify-center rounded-[18px] active:bg-wind-800 ${
          isSubmitting ? "bg-wind-500" : "bg-wind-700"
        }`}
        disabled={isSubmitting}
        onPress={() => void handleSubmit()}
      >
        <Text className="text-base font-bold text-white">
          {isSubmitting ? "Creating employee..." : "Create employee"}
        </Text>
      </Pressable>
      <Text className="mt-3 text-center text-[11px] leading-4 text-slate-400">
        Passwords are securely hashed before the employee record is stored.
      </Text>
    </ScrollView>
  );
}
