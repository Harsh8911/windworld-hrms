import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import FormField from "../../../components/FormField/FormField";
import ConfirmDialog from "../../../components/ConfirmDialog/ConfirmDialog";
import {
  ApiError,
  createAttendanceLocation,
  deleteAttendanceLocation,
  getAttendanceLocations,
  setAttendanceLocationArchived,
  updateAttendanceLocation,
} from "../../../services/api";
import type { AttendanceLocation } from "../../../types/api";

type PendingAction = { location: AttendanceLocation; action: "archive" | "restore" | "delete" };

export default function AdminAttendanceLocationsScreen() {
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [locationName, setLocationName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [wifiIp, setWifiIp] = useState("");
  const [radius, setRadius] = useState("500");
  const [isPrimary, setIsPrimary] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [editingLocation, setEditingLocation] = useState<AttendanceLocation | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [busyLocationId, setBusyLocationId] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const loadLocations = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const response = await getAttendanceLocations(true);
      setLocations(response.locations);
    } catch (requestError) {
      setMessage(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to load attendance locations.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  const clearMessage = () => setMessage("");

  const resetForm = () => {
    setEditingLocation(null);
    setLocationName("");
    setLatitude("");
    setLongitude("");
    setWifiIp("");
    setRadius("500");
    setIsPrimary(false);
  };

  const closeForm = () => {
    if (isSubmitting) return;
    resetForm();
    setIsFormVisible(false);
  };

  const beginCreate = () => {
    resetForm();
    setMessage("");
    setIsFormVisible(true);
  };

  const beginEdit = (location: AttendanceLocation) => {
    setEditingLocation(location);
    setLocationName(location.name);
    setLatitude(String(location.latitude));
    setLongitude(String(location.longitude));
    setWifiIp(location.wifiIp ?? "");
    setRadius(String(location.geofenceRadiusMeters));
    setIsPrimary(location.isPrimary);
    setMessage("");
    setIsFormVisible(true);
  };

  const useCurrentGps = async () => {
    setIsLocating(true);
    setMessage("");

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setMessage("Turn on device location services before fetching GPS coordinates.");
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setMessage("Location permission is required to fetch GPS coordinates.");
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      setLatitude(currentPosition.coords.latitude.toFixed(6));
      setLongitude(currentPosition.coords.longitude.toFixed(6));
    } catch {
      setMessage("Unable to read the current GPS position. Enter coordinates manually.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleSave = async () => {
    const latitudeNumber = Number(latitude);
    const longitudeNumber = Number(longitude);
    const radiusNumber = Number(radius);

    if (!locationName.trim() || !latitude.trim() || !longitude.trim() || !radius.trim()) {
      setMessage("Enter the location name, coordinates, and geofence radius.");
      return;
    }
    if (!Number.isFinite(latitudeNumber) || latitudeNumber < -90 || latitudeNumber > 90) {
      setMessage("Enter a valid latitude between -90 and 90.");
      return;
    }
    if (!Number.isFinite(longitudeNumber) || longitudeNumber < -180 || longitudeNumber > 180) {
      setMessage("Enter a valid longitude between -180 and 180.");
      return;
    }
    if (!Number.isFinite(radiusNumber) || radiusNumber <= 0) {
      setMessage("Enter a geofence radius greater than zero.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    try {
      const input = {
        name: locationName.trim(),
        latitude: latitudeNumber,
        longitude: longitudeNumber,
        wifiIp: wifiIp.trim() || undefined,
        geofenceRadiusMeters: radiusNumber,
        isPrimary,
      };
      const { location } = editingLocation
        ? await updateAttendanceLocation(editingLocation.id, input)
        : await createAttendanceLocation(input);
      setLocations((current) => [location, ...current.filter((item) => item.id !== location.id)]);
      setMessage(`Attendance location ${editingLocation ? "updated" : "created"} successfully.`);
      resetForm();
      setIsFormVisible(false);
      await loadLocations();
    } catch (requestError) {
      setMessage(
        requestError instanceof ApiError
          ? requestError.message
          : `Unable to ${editingLocation ? "update" : "create"} the attendance location.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const runPendingAction = async () => {
    if (!pendingAction) return;
    setBusyLocationId(pendingAction.location.id);
    setMessage("");
    try {
      if (pendingAction.action === "delete") {
        await deleteAttendanceLocation(pendingAction.location.id);
      } else {
        await setAttendanceLocationArchived(
          pendingAction.location.id,
          pendingAction.action === "archive",
        );
      }
      setPendingAction(null);
      setMessage(`Location ${pendingAction.action === "delete" ? "deleted" : pendingAction.action === "archive" ? "archived" : "restored"} successfully.`);
      if (editingLocation?.id === pendingAction.location.id) resetForm();
      await loadLocations();
    } catch (requestError) {
      setPendingAction(null);
      setMessage(requestError instanceof ApiError ? requestError.message : "Unable to update the location.");
    } finally {
      setBusyLocationId(null);
    }
  };

  const hasError = Boolean(message) && !message.endsWith("successfully.");
  const activeLocations = locations.filter((location) => location.isActive !== false);
  const archivedLocations = locations.filter((location) => location.isActive === false);
  const displayedLocations = showArchived ? archivedLocations : activeLocations;
  const primaryLocation = activeLocations.find((location) => location.isPrimary);

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
          onRefresh={() => void loadLocations(true)}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-semibold text-wind-700">ATTENDANCE INFRASTRUCTURE</Text>
          <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">{showArchived ? "Archived locations" : "Work locations"}</Text>
          <Text className="mt-2 text-sm leading-5 text-slate-500">
            {showArchived ? "Restore or permanently remove archived boundaries." : "Trusted GPS boundaries for secure employee attendance."}
          </Text>
        </View>
      </View>

      <View className="mt-6 overflow-hidden rounded-[28px] bg-wind-900 p-5">
        <View className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-wind-800" />
        <Text className="text-xs font-semibold text-emerald-100">LOCATION NETWORK</Text>
        <View className="mt-5 flex-row">
          <View className="flex-1">
            <Text className="text-[34px] font-bold text-white">{activeLocations.length}</Text>
            <Text className="mt-1 text-xs text-emerald-100">Active locations</Text>
          </View>
          <View className="w-px bg-wind-700" />
          <View className="flex-1 pl-6">
            <Text className="text-lg font-bold text-white">
              {primaryLocation?.name ?? "Not set"}
            </Text>
            <Text className="mt-1 text-xs text-emerald-100">Primary location</Text>
          </View>
        </View>
      </View>

      {message ? (
        <View className={`mt-4 rounded-[20px] border px-4 py-4 ${hasError ? "border-red-200 bg-red-50" : "border-wind-200 bg-wind-50"}`}>
          <Text accessibilityLiveRegion="polite" className={`text-sm font-semibold leading-5 ${hasError ? "text-red-700" : "text-wind-700"}`}>
            {message}
          </Text>
        </View>
      ) : null}

      <Modal animationType="fade" onRequestClose={closeForm} transparent visible={isFormVisible}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
          <Pressable accessibilityElementsHidden className="absolute inset-0" importantForAccessibility="no-hide-descendants" onPress={closeForm} style={{ backgroundColor: "rgba(2, 6, 23, 0.6)" }} />
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-10" keyboardShouldPersistTaps="handled">
            <View className="w-full max-w-lg self-center rounded-[28px] bg-[#f6f8f4] p-4">
              <View className="flex-row items-center justify-between px-1 pb-2">
                <View>
                  <Text className="text-xl font-bold text-slate-950">{editingLocation ? "Edit location" : "Add location"}</Text>
                  <Text className="mt-1 text-xs text-slate-500">Configure the attendance boundary</Text>
                </View>
                <Pressable accessibilityLabel="Close location form" accessibilityRole="button" className="h-11 w-11 items-center justify-center rounded-[14px] bg-white" disabled={isSubmitting} onPress={closeForm}>
                  <Ionicons color="#475569" name="close" size={24} />
                </Pressable>
              </View>
              {message && hasError ? (
                <View className="mt-3 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3">
                  <Text accessibilityLiveRegion="polite" className="text-sm font-semibold leading-5 text-red-700">{message}</Text>
                </View>
              ) : null}
      <View className="mt-3 rounded-[26px] border border-slate-200 bg-white p-5">
        <FormField
          autoCapitalize="words"
          editable={!isSubmitting}
          label="Location name *"
          onChangeText={(value) => {
            setLocationName(value);
            clearMessage();
          }}
          placeholder="e.g. Headquarters Office"
          value={locationName}
        />

        <View className="mb-5 rounded-[22px] border border-wind-100 bg-wind-50 p-4">
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="font-bold text-wind-900">GPS coordinates</Text>
              <Text className="mt-1 text-xs text-slate-500">Use this device or enter them manually</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: isLocating, disabled: isSubmitting || isLocating }}
              className="min-h-12 items-center justify-center rounded-[15px] border border-wind-200 bg-white px-3 active:bg-wind-50"
              disabled={isSubmitting || isLocating}
              onPress={() => void useCurrentGps()}
            >
              <Text className="text-xs font-bold text-wind-700">
                {isLocating ? "Locating..." : "Use current GPS"}
              </Text>
            </Pressable>
          </View>
          <FormField
            editable={!isSubmitting}
            keyboardType="decimal-pad"
            label="Latitude *"
            onChangeText={(value) => {
              setLatitude(value);
              clearMessage();
            }}
            placeholder="e.g. 19.094833"
            value={latitude}
          />
          <FormField
            editable={!isSubmitting}
            keyboardType="decimal-pad"
            label="Longitude *"
            onChangeText={(value) => {
              setLongitude(value);
              clearMessage();
            }}
            placeholder="e.g. 74.748011"
            value={longitude}
          />
          <Text className="-mt-2 text-xs leading-5 text-slate-500">
            Copy coordinates from a map link or use the device's current position.
          </Text>
        </View>

        <FormField
          autoCapitalize="none"
          editable={!isSubmitting}
          keyboardType="numbers-and-punctuation"
          label="Wi-Fi IP address"
          onChangeText={(value) => {
            setWifiIp(value);
            clearMessage();
          }}
          placeholder="e.g. 203.0.113.10"
          value={wifiIp}
        />
        <FormField
          editable={!isSubmitting}
          helperText="A 500 meter radius works well for large office or site campuses."
          keyboardType="number-pad"
          label="Geofence radius (meters) *"
          onChangeText={(value) => {
            setRadius(value);
            clearMessage();
          }}
          placeholder="500"
          value={radius}
        />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isPrimary }}
          className="min-h-16 flex-row items-center rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4 active:bg-slate-100"
          disabled={isSubmitting}
          onPress={() => setIsPrimary((current) => !current)}
        >
          <View className={`h-6 w-6 items-center justify-center rounded-md border-2 ${isPrimary ? "border-wind-700 bg-wind-700" : "border-slate-300 bg-white"}`}>
            {isPrimary ? <View className="h-2.5 w-2.5 rounded-sm bg-white" /> : null}
          </View>
          <View className="ml-3 flex-1">
            <Text className="font-bold text-slate-950">Primary attendance location</Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              Assign this location to new employees by default.
            </Text>
          </View>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
        className={`mt-5 min-h-14 items-center justify-center rounded-[18px] active:bg-wind-800 ${isSubmitting ? "bg-wind-500" : "bg-wind-700"}`}
        disabled={isSubmitting}
        onPress={() => void handleSave()}
      >
        <Text className="text-base font-bold text-white">
          {isSubmitting ? "Saving location..." : editingLocation ? "Save changes" : "Create location"}
        </Text>
      </Pressable>
      {editingLocation ? (
        <Pressable
          accessibilityRole="button"
          className="mt-3 min-h-12 items-center justify-center rounded-[18px] border border-slate-300 bg-white"
          disabled={isSubmitting}
          onPress={closeForm}
        >
          <Text className="text-sm font-bold text-slate-700">Cancel editing</Text>
        </Pressable>
      ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <View className="mb-3 mt-8 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-xl font-bold text-slate-950">{showArchived ? "Archived boundaries" : "Saved boundaries"}</Text>
          <Text className="mt-1 text-xs text-slate-500">{displayedLocations.length} {showArchived ? "archived" : "active"} locations</Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable accessibilityLabel={showArchived ? "Show active locations" : "Show archived locations"} accessibilityRole="button" className={`h-11 flex-row items-center justify-center rounded-[14px] border px-3 ${showArchived ? "border-wind-700 bg-wind-50" : "border-slate-200 bg-white"}`} onPress={() => setShowArchived((current) => !current)}>
            <Ionicons color={showArchived ? "#047857" : "#64748b"} name={showArchived ? "arrow-back-outline" : "archive-outline"} size={19} />
            <Text className={`ml-2 text-xs font-bold ${showArchived ? "text-wind-700" : "text-slate-600"}`}>{showArchived ? "Active" : "Archived"}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Add attendance location" accessibilityRole="button" className="h-11 w-11 items-center justify-center rounded-[14px] bg-wind-700 active:bg-wind-800" onPress={beginCreate}>
            <Ionicons color="#ffffff" name="add" size={23} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View className="items-center rounded-[24px] border border-slate-200 bg-white px-5 py-8">
          <Text className="text-sm font-semibold text-slate-500">Loading locations...</Text>
        </View>
      ) : null}

      {!isLoading && displayedLocations.length === 0 ? (
        <View className="items-center rounded-[24px] border border-slate-200 bg-white px-6 py-10">
          <View className="h-12 w-12 items-center justify-center rounded-[18px] bg-wind-50">
            <View className="h-4 w-4 rounded-full border-2 border-wind-700" />
          </View>
          <Text className="mt-4 text-base font-bold text-slate-950">{showArchived ? "No archived locations" : "No boundaries yet"}</Text>
          <Text className="mt-1 text-center text-xs leading-5 text-slate-500">
            {showArchived ? "Archived attendance locations will appear here." : "Use the add button above to create your first attendance location."}
          </Text>
        </View>
      ) : null}

      {displayedLocations.map((location) => (
        <View key={location.id} className={`mb-3 rounded-[24px] border p-4 ${location.isActive === false ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white"}`}>
          <View className="flex-row items-center">
            <View className="h-11 w-11 items-center justify-center rounded-[16px] bg-wind-50">
              <View className="h-4 w-4 items-center justify-center rounded-full border-2 border-wind-700">
                <View className="h-1.5 w-1.5 rounded-full bg-wind-700" />
              </View>
            </View>
            <View className="ml-3 flex-1 pr-2">
              <Text className="text-base font-bold text-slate-950">{location.name}</Text>
              <Text className="mt-1 text-xs text-slate-500">
                {location.geofenceRadiusMeters} m secure radius
              </Text>
            </View>
            {location.isPrimary ? (
              <View className="rounded-full bg-wind-50 px-3 py-1.5">
                <Text className="text-[10px] font-bold text-wind-700">PRIMARY</Text>
              </View>
            ) : null}
            {location.isActive === false ? (
              <View className="rounded-full bg-slate-100 px-3 py-1.5">
                <Text className="text-[10px] font-bold text-slate-600">ARCHIVED</Text>
              </View>
            ) : null}
          </View>
          <View className="mt-4 rounded-[16px] bg-slate-50 px-3 py-3">
            <Text className="text-xs font-semibold text-slate-700">
              {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </Text>
            <Text className="mt-1 text-[11px] text-slate-500">
              {location.wifiIp ? `Wi-Fi IP ${location.wifiIp}` : "No Wi-Fi IP restriction"}
            </Text>
          </View>
          <View className="mt-3 flex-row justify-end gap-2">
            {location.isActive !== false ? (
              <Pressable accessibilityLabel={`Edit ${location.name}`} accessibilityRole="button" className="h-11 w-11 items-center justify-center rounded-[14px] border border-wind-100 bg-wind-50" disabled={busyLocationId === location.id} onPress={() => beginEdit(location)}>
                <Ionicons color="#047857" name="create-outline" size={21} />
              </Pressable>
            ) : null}
            <Pressable accessibilityHint={location.isActive === false ? "Unarchives this attendance location" : "Moves this attendance location to the archive"} accessibilityLabel={`${location.isActive === false ? "Unarchive" : "Archive"} ${location.name}`} accessibilityRole="button" className="h-11 w-11 items-center justify-center rounded-[14px] border border-amber-100 bg-amber-50" disabled={busyLocationId === location.id} onPress={() => setPendingAction({ location, action: location.isActive === false ? "restore" : "archive" })}>
              <Ionicons color="#b45309" name={location.isActive === false ? "arrow-undo-outline" : "archive-outline"} size={21} />
            </Pressable>
            <Pressable accessibilityHint={location.isActive === false ? "Permanently deletes this archived location when no attendance history uses it" : "Permanently deletes this location when no attendance history uses it"} accessibilityLabel={`Delete ${location.name}`} accessibilityRole="button" className="h-11 w-11 items-center justify-center rounded-[14px] border border-red-100 bg-red-50" disabled={busyLocationId === location.id} onPress={() => setPendingAction({ location, action: "delete" })}>
              <Ionicons color="#b91c1c" name="trash-outline" size={21} />
            </Pressable>
          </View>
        </View>
      ))}
      <ConfirmDialog
        confirmLabel={pendingAction?.action === "delete" ? "Delete permanently" : pendingAction?.action === "archive" ? "Archive" : "Restore"}
        isBusy={busyLocationId === pendingAction?.location.id}
        message={pendingAction ? pendingAction.action === "delete" ? `${pendingAction.location.name} will be permanently deleted if it has no attendance history.` : pendingAction.action === "archive" ? `${pendingAction.location.name} will no longer be available for attendance. Historical records will be preserved.` : `${pendingAction.location.name} will become available for attendance again.` : ""}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void runPendingAction()}
        title={pendingAction?.action === "delete" ? "Delete attendance location?" : pendingAction?.action === "archive" ? "Archive attendance location?" : "Restore attendance location?"}
        variant={pendingAction?.action === "delete" ? "danger" : pendingAction?.action === "archive" ? "warning" : "default"}
        visible={pendingAction !== null}
      />
    </ScrollView>
  );
}
