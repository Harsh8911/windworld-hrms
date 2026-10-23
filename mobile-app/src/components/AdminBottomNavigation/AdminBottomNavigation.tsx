import { Pressable, Text, View } from "react-native";

import type { AdminTab } from "../../types/admin";

type AdminBottomNavigationProps = {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
};

const tabs: Array<{ key: AdminTab; label: string }> = [
  { key: "employees", label: "Team" },
  { key: "addEmployee", label: "Add" },
  { key: "attendance", label: "Logs" },
  { key: "locations", label: "Locations" },
  { key: "settings", label: "Settings" },
];

function AdminTabIcon({ tab, active }: { tab: AdminTab; active: boolean }) {
  const shapeColor = active ? "bg-wind-700" : "bg-slate-500";
  const borderColor = active ? "border-wind-700" : "border-slate-500";

  if (tab === "employees") {
    return (
      <View className="h-6 w-7 items-center">
        <View className="flex-row items-center">
          <View className={`h-2.5 w-2.5 rounded-full ${shapeColor}`} />
          <View className={`-ml-0.5 h-2 w-2 rounded-full ${shapeColor}`} />
        </View>
        <View className="mt-1 flex-row items-end">
          <View className={`h-3 w-4 rounded-t-full ${shapeColor}`} />
          <View className={`-ml-1 h-2.5 w-3 rounded-t-full ${shapeColor}`} />
        </View>
      </View>
    );
  }

  if (tab === "addEmployee") {
    return (
      <View className="h-6 w-7">
        <View className="items-start">
          <View className={`ml-1 h-2.5 w-2.5 rounded-full ${shapeColor}`} />
          <View className={`mt-1 h-3 w-5 rounded-t-full ${shapeColor}`} />
        </View>
        <View className={`absolute right-0 top-2.5 h-1 w-3 rounded-full ${shapeColor}`} />
        <View className={`absolute right-1 top-1.5 h-3 w-1 rounded-full ${shapeColor}`} />
      </View>
    );
  }

  if (tab === "attendance") {
    return (
      <View className="h-6 w-6 flex-row items-end justify-between px-0.5 py-0.5">
        <View className={`h-3 w-1 rounded-full ${shapeColor}`} />
        <View className={`h-5 w-1 rounded-full ${shapeColor}`} />
        <View className={`h-4 w-1 rounded-full ${shapeColor}`} />
      </View>
    );
  }

  if (tab === "locations") {
    return (
      <View className="h-7 w-6 items-center">
        <View
          className={`h-5 w-5 items-center justify-center rounded-full border-2 ${borderColor}`}
        >
          <View className={`h-2 w-2 rounded-full ${shapeColor}`} />
        </View>
        <View className={`-mt-1 h-2 w-2 rotate-45 ${shapeColor}`} />
      </View>
    );
  }

  return (
    <View className="h-6 w-6 justify-around py-0.5">
      {["top", "middle", "bottom"].map((position, index) => (
        <View key={position} className="h-1 w-6 flex-row items-center">
          <View
            className={`h-1.5 w-1.5 rounded-full ${shapeColor}`}
            style={{ marginLeft: index === 1 ? 14 : index === 2 ? 5 : 2 }}
          />
          <View
            className={`absolute h-0.5 rounded-full ${shapeColor}`}
            style={{
              left: index === 1 ? 1 : index === 2 ? 1 : 9,
              width: index === 1 ? 11 : index === 2 ? 3 : 14,
            }}
          />
        </View>
      ))}
    </View>
  );
}

export default function AdminBottomNavigation({
  activeTab,
  onTabChange,
}: AdminBottomNavigationProps) {
  return (
    <View className="border-t border-slate-200 bg-white px-3 pb-2 pt-2">
      <View className="h-[68px] flex-row items-center rounded-[24px] border border-slate-200 bg-white px-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <Pressable
              key={tab.key}
              accessibilityLabel={`${tab.label} tab`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={`min-h-14 flex-1 items-center justify-center rounded-[17px] ${
                isActive ? "bg-wind-50" : "bg-white active:bg-slate-50"
              }`}
              hitSlop={2}
              onPress={() => onTabChange(tab.key)}
            >
              <AdminTabIcon active={isActive} tab={tab.key} />
              <Text
                className={`mt-1 text-[9px] font-bold ${
                  isActive ? "text-wind-700" : "text-slate-500"
                }`}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

