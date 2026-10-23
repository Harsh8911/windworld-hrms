import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import FormField from "../../../components/FormField/FormField";
import {
  ApiError,
  createAttendanceLocation,
  getAttendanceLocations,
} from "../../../services/api";
import type { AttendanceLocation } from "../../../types/api";

const successMessage = "Attendance location created successfully.";

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

  const loadLocations = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const response = await getAttendanceLocations();
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
      const { location } = await createAttendanceLocation({
        name: locationName.trim(),
        latitude: latitudeNumber,
        longitude: longitudeNumber,
        wifiIp: wifiIp.trim() || undefined,
        geofenceRadiusMeters: radiusNumber,
        isPrimary,
      });
      setLocations((current) => [location, ...current.filter((item) => item.id !== location.id)]);
      setLocationName("");
      setLatitude("");
      setLongitude("");
      setWifiIp("");
      setRadius("500");
      setIsPrimary(false);
      setMessage(successMessage);
      await loadLocations();
    } catch (requestError) {
      setMessage(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to create the attendance location.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasError = Boolean(message) && message !== successMessage;
  const primaryLocation = locations.find((location) => location.isPrimary);

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
      <Text className="text-sm font-semibold text-wind-700">ATTENDANCE INFRASTRUCTURE</Text>
      <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">Work locations</Text>
      <Text className="mt-2 text-sm leading-5 text-slate-500">
        Create trusted GPS boundaries for secure employee attendance.
      </Text>

      <View className="mt-6 overflow-hidden rounded-[28px] bg-wind-900 p-5">
        <View className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-wind-800" />
        <Text className="text-xs font-semibold text-emerald-100">LOCATION NETWORK</Text>
        <View className="mt-5 flex-row">
          <View className="flex-1">
            <Text className="text-[34px] font-bold text-white">{locations.length}</Text>
            <Text className="mt-1 text-xs text-emerald-100">Saved locations</Text>
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

      <View className="mt-5 rounded-[26px] border border-slate-200 bg-white p-5">
        <View className="flex-row items-center">
          <View className="h-11 w-11 items-center justify-center rounded-[16px] bg-wind-50">
            <View className="h-5 w-5 items-center justify-center rounded-full border-2 border-wind-700">
              <View className="h-2 w-2 rounded-full bg-wind-700" />
            </View>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-lg font-bold text-slate-950">Add a location</Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500">
              Employees can punch only inside this boundary.
            </Text>
          </View>
        </View>

        <View className="my-5 h-px bg-slate-100" />
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
          {isSubmitting ? "Creating location..." : "Create location"}
        </Text>
      </Pressable>

      <View className="mb-3 mt-8">
        <Text className="text-xl font-bold text-slate-950">Saved boundaries</Text>
        <Text className="mt-1 text-xs text-slate-500">{locations.length} locations configured</Text>
      </View>

      {isLoading ? (
        <View className="items-center rounded-[24px] border border-slate-200 bg-white px-5 py-8">
          <Text className="text-sm font-semibold text-slate-500">Loading locations...</Text>
        </View>
      ) : null}

      {!isLoading && locations.length === 0 ? (
        <View className="items-center rounded-[24px] border border-slate-200 bg-white px-6 py-10">
          <View className="h-12 w-12 items-center justify-center rounded-[18px] bg-wind-50">
            <View className="h-4 w-4 rounded-full border-2 border-wind-700" />
          </View>
          <Text className="mt-4 text-base font-bold text-slate-950">No boundaries yet</Text>
          <Text className="mt-1 text-center text-xs leading-5 text-slate-500">
            Complete the form above to create your first attendance location.
          </Text>
        </View>
      ) : null}

      {locations.map((location) => (
        <View key={location.id} className="mb-3 rounded-[24px] border border-slate-200 bg-white p-4">
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
          </View>
          <View className="mt-4 rounded-[16px] bg-slate-50 px-3 py-3">
            <Text className="text-xs font-semibold text-slate-700">
              {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </Text>
            <Text className="mt-1 text-[11px] text-slate-500">
              {location.wifiIp ? `Wi-Fi IP ${location.wifiIp}` : "No Wi-Fi IP restriction"}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
