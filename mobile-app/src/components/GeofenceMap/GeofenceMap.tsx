import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

type Coordinate = {
  latitude: number;
  longitude: number;
};

type GeofenceMapProps = {
  locationName: string;
  latitude?: number;
  longitude?: number;
  radiusMeters: number;
  userPosition?: Coordinate | null;
};

function createLeafletHtml(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  userPosition?: Coordinate | null,
) {
  const userLatitude = userPosition?.latitude ?? null;
  const userLongitude = userPosition?.longitude ?? null;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { height: 100%; width: 100%; margin: 0; background: #eaf4e6; }
      .leaflet-control-attribution { font-family: sans-serif; font-size: 9px; }
    </style>
    <script>
      function postToApp(type, detail) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, detail: detail || "" }));
      }

      window.onerror = function (message) {
        postToApp("error", String(message || "Unknown Leaflet runtime error"));
        return true;
      };
    </script>
  </head>
  <body>
    <div id="map" role="img" aria-label="Attendance geofence map"></div>
    <script>
      const leafletSources = [
        "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
        "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"
      ];

      function initializeMap() {
        try {
          if (!window.L) throw new Error("Leaflet loaded without exposing the map library");

          const assigned = [${latitude}, ${longitude}];
          const employee = ${userLatitude === null ? "null" : `[${userLatitude}, ${userLongitude}]`};
          const geofenceRadius = ${radiusMeters};
          const initialZoom = geofenceRadius <= 50
            ? 17
            : geofenceRadius <= 100
              ? 16
              : geofenceRadius <= 250
                ? 15
                : geofenceRadius <= 500
                  ? 14
                  : geofenceRadius <= 1000
                    ? 13
                    : 12;
          const map = L.map("map", {
            zoomControl: true,
            attributionControl: true,
            preferCanvas: true
          }).setView(assigned, initialZoom);
          const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }).addTo(map);

          tiles.on("tileerror", function () {
            postToApp("tile-error", "OpenStreetMap tiles could not be downloaded on this device");
          });

          const geofence = L.circle(assigned, {
            radius: geofenceRadius,
            color: "#059669",
            weight: 2,
            fillColor: "#10b981",
            fillOpacity: 0.16
          }).addTo(map);

          L.circleMarker(assigned, {
            radius: 9,
            color: "#ffffff",
            fillColor: "#047857",
            fillOpacity: 1,
            weight: 3
          }).addTo(map).bindTooltip("Assigned attendance location");

          if (employee) {
            L.circleMarker(employee, {
              radius: 8,
              color: "#ffffff",
              fillColor: "#2563eb",
              fillOpacity: 1,
              weight: 3
            }).addTo(map).bindTooltip("Your current GPS position");
          }

          map.whenReady(function () {
            window.setTimeout(function () {
              map.invalidateSize(false);
              postToApp("ready");
            }, 50);
          });
        } catch (error) {
          postToApp("error", error instanceof Error ? error.message : String(error));
        }
      }

      function loadLeaflet(index) {
        if (index >= leafletSources.length) {
          postToApp("error", "Leaflet library download failed from all configured CDNs");
          return;
        }

        const script = document.createElement("script");
        script.src = leafletSources[index];
        script.onload = initializeMap;
        script.onerror = function () { loadLeaflet(index + 1); };
        document.head.appendChild(script);
      }

      loadLeaflet(0);
    </script>
  </body>
</html>`;
}

export default function GeofenceMap({
  locationName,
  latitude,
  longitude,
  radiusMeters,
  userPosition,
}: GeofenceMapProps) {
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading");
  const [mapError, setMapError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const hasCoordinates =
    latitude !== undefined &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  const html = useMemo(
    () =>
      hasCoordinates
        ? createLeafletHtml(latitude, longitude, radiusMeters, userPosition)
        : "",
    [hasCoordinates, latitude, longitude, radiusMeters, userPosition],
  );

  useEffect(() => {
    if (html) {
      setMapState("loading");
      setMapError("");
    }
  }, [html]);

  if (!hasCoordinates) {
    return (
      <View className="h-48 items-center justify-center rounded-[28px] border border-wind-100 bg-wind-50 px-6">
        <Text className="text-center text-sm font-semibold text-wind-900">
          No attendance location assigned
        </Text>
        <Text className="mt-2 text-center text-xs leading-5 text-slate-500">
          Ask your administrator to assign a location before punching attendance.
        </Text>
      </View>
    );
  }

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type?: unknown;
        detail?: unknown;
      };
      if (message.type === "ready") {
        setMapState("ready");
        setMapError("");
        return;
      }
      if (message.type === "tile-error") {
        setMapError(
          typeof message.detail === "string"
            ? message.detail
            : "OpenStreetMap tiles could not be downloaded.",
        );
        setMapState("error");
        return;
      }
      setMapError(
        typeof message.detail === "string" ? message.detail : "Unknown map runtime error.",
      );
      setMapState("error");
    } catch {
      setMapError("The map returned an unreadable response.");
      setMapState("error");
    }
  };

  return (
    <View className="h-56 overflow-hidden rounded-[28px] border border-wind-100 bg-wind-50">
      <WebView
        accessibilityLabel={`Leaflet map for ${locationName}`}
        cacheEnabled
        domStorageEnabled
        javaScriptEnabled
        key={`${latitude}:${longitude}:${radiusMeters}:${userPosition?.latitude ?? "none"}:${userPosition?.longitude ?? "none"}:${reloadKey}`}
        mixedContentMode="never"
        onError={(event) => {
          setMapError(event.nativeEvent.description || "The device WebView could not load the map.");
          setMapState("error");
        }}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
        originWhitelist={["about:blank", "https://*"]}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        source={{ html }}
        style={styles.map}
        userAgent="WindworldMobile/0.1.0"
      />

      <View className="absolute left-4 top-4 max-w-[75%] rounded-2xl border border-slate-100 bg-white px-3 py-2">
        <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Assigned location
        </Text>
        <Text className="mt-0.5 text-sm font-bold text-wind-900">{locationName}</Text>
        <Text className="mt-0.5 text-[10px] font-semibold text-wind-700">
          {radiusMeters} m geofence
        </Text>
      </View>

      {mapState === "loading" ? (
        <View className="absolute inset-0 items-center justify-center bg-wind-50">
          <ActivityIndicator color="#047857" />
          <Text className="mt-2 text-xs font-semibold text-wind-900">Loading Leaflet map...</Text>
        </View>
      ) : null}

      {mapState === "error" ? (
        <View className="absolute inset-0 items-center justify-center bg-wind-50 px-6">
          <Text className="text-center text-sm font-bold text-wind-900">Map unavailable</Text>
          <Text className="mt-2 text-center text-xs leading-5 text-slate-500">
            {mapError || "The device could not load Leaflet or OpenStreetMap."}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="mt-4 min-h-12 items-center justify-center rounded-[16px] bg-wind-700 px-5 active:bg-wind-800"
            onPress={() => {
              setMapError("");
              setMapState("loading");
              setReloadKey((current) => current + 1);
            }}
          >
            <Text className="text-xs font-bold text-white">Retry map</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: "#eaf4e6",
    height: 224,
    width: "100%",
  },
});
