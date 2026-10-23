import * as Location from "expo-location";

import type { AttendancePositionInput } from "../types/api";

export async function getCurrentAttendancePosition(): Promise<AttendancePositionInput> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error("Turn on device location services before punching attendance.");
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Precise location permission is required to punch attendance.");
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Highest,
    mayShowUserSettingsDialog: true,
  });

  if (position.coords.accuracy === null) {
    throw new Error("Your device could not determine GPS accuracy. Try again outdoors.");
  }

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: Math.max(0, position.coords.accuracy),
  };
}

export function calculateDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
