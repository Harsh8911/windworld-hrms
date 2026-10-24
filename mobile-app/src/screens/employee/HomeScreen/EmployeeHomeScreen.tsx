import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import GeofenceMap from "../../../components/GeofenceMap/GeofenceMap";
import {
  ApiError,
  getAttendanceOverview,
  getCurrentUser,
  punchIn,
  punchOut,
} from "../../../services/api";
import {
  calculateDistanceMeters,
  getCurrentAttendancePosition,
} from "../../../services/deviceLocation";
import type {
  AttendanceLocation,
  AttendanceOverview,
  AttendancePositionInput,
  AuthenticatedUser,
} from "../../../types/api";

type EmployeeHomeScreenProps = {
  onOpenAttendance: () => void;
};

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function formatTime(value: string | null | undefined, timezone: string) {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

function findRecognizedLocation(
  locations: AttendanceLocation[],
  position: AttendancePositionInput,
) {
  const candidates = locations
    .map((location) => ({
      location,
      distance: calculateDistanceMeters(
        location.latitude,
        location.longitude,
        position.latitude,
        position.longitude,
      ),
    }))
    .sort((left, right) => left.distance - right.distance);
  return candidates.find(
    ({ location, distance }) =>
      distance + position.accuracyMeters <= location.geofenceRadiusMeters,
  )?.location;
}

export default function EmployeeHomeScreen({
  onOpenAttendance,
}: EmployeeHomeScreenProps) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [attendance, setAttendance] = useState<AttendanceOverview | null>(null);
  const [userPosition, setUserPosition] = useState<AttendancePositionInput | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPunching, setIsPunching] = useState(false);

  const loadDashboard = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);

    try {
      const [currentUser, overview] = await Promise.all([
        getCurrentUser(),
        getAttendanceOverview(),
      ]);
      const profileLocations = currentUser.employeeProfile?.attendanceLocations ?? [];
      const resolvedLocations = overview.availableLocations.length
        ? overview.availableLocations
        : profileLocations;
      const resolvedOverview = {
        ...overview,
        employeeRole:
          overview.employeeRole ?? currentUser.employeeProfile?.employeeRole ?? "EMPLOYEE",
        availableLocations: resolvedLocations,
      };
      setUser(currentUser);
      setAttendance(resolvedOverview);
      setError("");

      if (!resolvedOverview.todaySession || resolvedOverview.todaySession.status === "IN_PROGRESS") {
        try {
          const position = await getCurrentAttendancePosition();
          const recognizedLocation = findRecognizedLocation(
            resolvedOverview.availableLocations,
            position,
          );
          setUserPosition(position);
          if (recognizedLocation) {
            setSelectedLocationId(recognizedLocation.id);
          } else {
            setSelectedLocationId("");
            if (resolvedOverview.employeeRole !== "MANAGER") {
              setError(
                "Sorry, location is not recognized. Please select the location manually from the dropdown.",
              );
            }
          }
        } catch (locationError) {
          setError(
            locationError instanceof Error
              ? locationError.message
              : "Unable to identify your current location.",
          );
        }
      }
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to load your attendance overview.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const availableLocations = attendance?.availableLocations ?? [];
  const selectedLocation = availableLocations.find(
    (location) => location.id === selectedLocationId,
  );
  const session = attendance?.todaySession;
  const isWorking = session?.status === "IN_PROGRESS";
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [],
  );
  const initials =
    user?.fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "WW";
  const shiftTimezone = attendance?.shift.timezone ?? "Asia/Kolkata";
  const isCompleted = session?.status === "COMPLETED";
  const isManager = attendance?.employeeRole === "MANAGER";
  const hasPunchLocation = isManager || Boolean(selectedLocation);
  const canPunchIn = !session && hasPunchLocation && !isPunching;
  const canPunchOut = Boolean(isWorking) && hasPunchLocation && !isPunching;

  const getValidatedPosition = async () => {
    const position = await getCurrentAttendancePosition();
    setUserPosition(position);

    if (isManager) return position;

    if (!selectedLocation) {
      throw new Error(
        availableLocations.length
          ? "Sorry, location is not recognized. Please select the location manually from the dropdown."
          : "Ask your administrator to assign an attendance location first.",
      );
    }

    const distance = calculateDistanceMeters(
      selectedLocation.latitude,
      selectedLocation.longitude,
      position.latitude,
      position.longitude,
    );

    if (
      distance + position.accuracyMeters > selectedLocation.geofenceRadiusMeters
    ) {
      throw new Error(
        `You are outside the ${selectedLocation.geofenceRadiusMeters}-meter ${selectedLocation.name} geofence.`,
      );
    }

    return position;
  };

  const handlePunch = async (action: "in" | "out") => {
    setIsPunching(true);
    setError("");

    try {
      const position = await getValidatedPosition();
      const attendanceLocationId = isManager ? undefined : selectedLocationId;
      if (action === "in") await punchIn(position, attendanceLocationId);
      else await punchOut(position, attendanceLocationId);
      await loadDashboard();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError || requestError instanceof Error
          ? requestError.message
          : "Unable to record attendance.",
      );
    } finally {
      setIsPunching(false);
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
          onRefresh={() => void loadDashboard(true)}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <Text className="text-sm font-semibold text-wind-700">{todayLabel}</Text>
          <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">
            Hello, {user?.fullName?.split(" ")[0] ?? "there"}
          </Text>
          <Text className="mt-1 text-sm text-slate-500">Here is your workday at a glance.</Text>
        </View>
        <View className="h-14 w-14 items-center justify-center rounded-[20px] border border-wind-100 bg-white">
          <Text className="text-base font-bold text-wind-700">{initials}</Text>
        </View>
      </View>

      {error ? (
        <View className="mt-5 rounded-[20px] border border-red-200 bg-red-50 px-4 py-4">
          <Text accessibilityLiveRegion="polite" className="text-sm font-semibold leading-5 text-red-700">
            {error}
          </Text>
        </View>
      ) : null}

      {isManager && !isCompleted ? (
        <View className="mt-4 rounded-[22px] border border-wind-100 bg-wind-50 p-4">
          <Text className="text-xs font-bold text-wind-700">MANAGER GPS PUNCH</Text>
          <Text className="mt-2 text-sm font-bold text-slate-950">
            No saved attendance location is required
          </Text>
          <Text className="mt-1 text-xs leading-5 text-slate-600">
            Your current latitude, longitude, and GPS accuracy will be captured when you punch.
          </Text>
          {userPosition ? (
            <Text className="mt-3 text-[11px] font-semibold text-wind-800">
              {userPosition.latitude.toFixed(6)}, {userPosition.longitude.toFixed(6)} · ±
              {Math.round(userPosition.accuracyMeters)} m
            </Text>
          ) : null}
        </View>
      ) : availableLocations.length > 0 && !isCompleted ? (
        <View className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
          <Text className="mb-2 text-xs font-bold text-slate-500">
            {attendance?.employeeRole === "MANAGER" ? "PUNCH LOCATION" : "ASSIGNED LOCATION"}
          </Text>
          <Pressable
            accessibilityLabel="Select punch location"
            accessibilityRole="button"
            accessibilityState={{ expanded: isLocationDropdownOpen }}
            className="min-h-14 flex-row items-center justify-between rounded-2xl bg-slate-50 px-4"
            onPress={() => setIsLocationDropdownOpen((current) => !current)}
          >
            <Text className={`flex-1 text-sm font-bold ${selectedLocation ? "text-slate-950" : "text-slate-500"}`}>
              {selectedLocation?.name ?? "Select location manually"}
            </Text>
            <View className="ml-3 h-3 w-3 rotate-45 border-b-2 border-r-2 border-wind-700" />
          </Pressable>
          {isLocationDropdownOpen ? (
            <View className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
              {availableLocations.map((location, index) => {
                const isSelected = location.id === selectedLocationId;
                return (
                  <Pressable
                    key={location.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    className={`min-h-12 flex-row items-center justify-between bg-white px-4 active:bg-slate-50 ${
                      index > 0 ? "border-t border-slate-100" : ""
                    }`}
                    onPress={() => {
                      setSelectedLocationId(location.id);
                      setIsLocationDropdownOpen(false);
                      setError("");
                    }}
                  >
                    <Text className={`text-sm font-semibold ${isSelected ? "text-wind-700" : "text-slate-700"}`}>
                      {location.name}
                    </Text>
                    {isSelected ? <View className="h-3 w-3 rounded-full bg-wind-700" /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      <View className="mt-6 overflow-hidden rounded-[30px] bg-wind-900 p-6">
        <View className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-wind-800" />
        <View className="absolute -bottom-14 right-14 h-28 w-28 rounded-full border border-wind-700" />
        <View className="flex-row items-center justify-between">
          <View className="rounded-full bg-white px-3 py-1.5">
            <Text className="text-[11px] font-bold text-wind-800">
              {isWorking ? "ON SHIFT" : session ? "SHIFT COMPLETE" : "READY FOR WORK"}
            </Text>
          </View>
          <Pressable
            accessibilityHint="Opens attendance and GPS punch controls"
            accessibilityLabel={isWorking ? "Manage active shift" : "Open attendance"}
            accessibilityRole="button"
            className="h-12 w-12 items-center justify-center rounded-[18px] border border-wind-700 bg-wind-800 active:bg-wind-700"
            hitSlop={4}
            onPress={onOpenAttendance}
          >
            <View className="h-5 w-5 items-center justify-center">
              <View className="h-3.5 w-3.5 rotate-45 border-r-2 border-t-2 border-white" />
            </View>
          </Pressable>
        </View>

        <Text className="mt-7 text-sm font-medium text-emerald-100">Today's schedule</Text>
        <Text className="mt-1 text-[32px] font-bold text-white">
          {attendance ? `${attendance.shift.startTime} - ${attendance.shift.endTime}` : "Loading..."}
        </Text>
        <Text className="mt-2 text-sm leading-5 text-emerald-100">
          {attendance?.shift.name ?? "Retrieving your assigned shift"}
        </Text>

        <View className="mt-6 flex-row rounded-[20px] bg-wind-800 p-4">
          <View className="flex-1">
            <Text className="text-xs text-emerald-100">Started</Text>
            <Text className="mt-1 text-lg font-bold text-white">
              {formatTime(session?.punchInAt, shiftTimezone)}
            </Text>
          </View>
          <View className="w-px bg-wind-700" />
          <View className="flex-1 pl-5">
            <Text className="text-xs text-emerald-100">Finished</Text>
            <Text className="mt-1 text-lg font-bold text-white">
              {formatTime(session?.punchOutAt, shiftTimezone)}
            </Text>
          </View>
        </View>

        <View className="mt-4 flex-row gap-3">
          <Pressable
            accessibilityHint="Verifies GPS and records your punch in"
            accessibilityRole="button"
            accessibilityState={{ busy: isPunching, disabled: !canPunchIn }}
            className={`min-h-14 flex-1 items-center justify-center rounded-[18px] ${
              canPunchIn ? "bg-white active:bg-wind-50" : "bg-wind-800"
            }`}
            disabled={!canPunchIn}
            onPress={() => void handlePunch("in")}
          >
            <Text className={`font-bold ${canPunchIn ? "text-wind-900" : "text-emerald-100"}`}>
              {isPunching && !session ? "Checking GPS..." : "Punch in"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityHint="Verifies GPS and records your punch out"
            accessibilityRole="button"
            accessibilityState={{ busy: isPunching, disabled: !canPunchOut }}
            className={`min-h-14 flex-1 items-center justify-center rounded-[18px] border ${
              canPunchOut
                ? "border-white bg-white active:bg-wind-50"
                : "border-wind-700 bg-wind-800"
            }`}
            disabled={!canPunchOut}
            onPress={() => void handlePunch("out")}
          >
            <Text className={`font-bold ${canPunchOut ? "text-wind-900" : "text-emerald-100"}`}>
              {isPunching && session ? "Checking GPS..." : isCompleted ? "Shift complete" : "Punch out"}
            </Text>
          </Pressable>
        </View>

      </View>

      <View className="mt-6 flex-row gap-3">
        <View className="flex-1 rounded-[24px] border border-slate-200 bg-white p-5">
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-wind-50">
            <View className="h-3 w-3 rounded-full bg-wind-700" />
          </View>
          <Text className="mt-5 text-[28px] font-bold text-slate-950">
            {attendance?.currentMonth.daysPresent ?? "--"}
          </Text>
          <Text className="mt-1 text-xs leading-5 text-slate-500">Days present this month</Text>
        </View>
        <View className="flex-1 rounded-[24px] border border-slate-200 bg-white p-5">
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
            <View className="h-3 w-3 rounded-sm bg-amber-500" />
          </View>
          <Text className="mt-5 text-[28px] font-bold text-slate-950">
            {attendance ? formatMinutes(attendance.currentMonth.workedMinutes) : "--"}
          </Text>
          <Text className="mt-1 text-xs leading-5 text-slate-500">Hours recorded this month</Text>
        </View>
      </View>

      <View className="mb-4 mt-8 flex-row items-end justify-between">
        <View>
          <Text className="text-xl font-bold text-slate-950">Work location</Text>
          <Text className="mt-1 text-xs text-slate-500">
            {isManager ? "Coordinates captured directly from GPS" : "Your selected attendance boundary"}
          </Text>
        </View>
        {selectedLocation ? (
          <View className="rounded-full border border-wind-100 bg-wind-50 px-3 py-1.5">
            <Text className="text-[10px] font-bold text-wind-700">
              {selectedLocation.geofenceRadiusMeters} M RADIUS
            </Text>
          </View>
        ) : null}
      </View>

      <GeofenceMap
        coordinateOnly={isManager}
        locationName={isManager ? "Current GPS location" : selectedLocation?.name ?? "No location selected"}
        latitude={isManager ? userPosition?.latitude : selectedLocation?.latitude}
        longitude={isManager ? userPosition?.longitude : selectedLocation?.longitude}
        radiusMeters={isManager ? 0 : selectedLocation?.geofenceRadiusMeters ?? 0}
        userPosition={userPosition}
      />

      {selectedLocation || (isManager && userPosition) ? (
        <View className="mt-3 flex-row items-center rounded-[20px] border border-slate-200 bg-white px-4 py-4">
          <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-wind-50">
            <View className="h-3 w-3 rounded-full border-2 border-wind-700" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-slate-950">
              {isManager ? "Current GPS location" : selectedLocation?.name}
            </Text>
            <Text className="mt-1 text-xs text-slate-500">
              {isManager
                ? `${userPosition?.latitude.toFixed(6)}, ${userPosition?.longitude.toFixed(6)} · GPS coordinates are recorded for audit`
                : "GPS verification is required to punch"}
            </Text>
          </View>
          <View className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </View>
      ) : null}
    </ScrollView>
  );
}
