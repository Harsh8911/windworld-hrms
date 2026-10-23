import { Pressable, Text, View } from "react-native";

import type { EmployeeTab } from "../../types/employee";

type EmployeeBottomNavigationProps = {
  activeTab: EmployeeTab;
  onTabChange: (tab: EmployeeTab) => void;
};

const tabs: Array<{ key: EmployeeTab; label: string }> = [
  { key: "home", label: "Home" },
  { key: "attendance", label: "Attendance" },
  { key: "profile", label: "Profile" },
  { key: "settings", label: "Settings" },
];

function TabIcon({ tab, active }: { tab: EmployeeTab; active: boolean }) {
  const color = active ? "bg-wind-700" : "bg-slate-400";
  const cutout = active ? "bg-wind-50" : "bg-white";

  if (tab === "home") {
    return (
      <View className="h-5 w-5 items-center justify-end">
        <View className={`absolute top-1 h-3.5 w-3.5 rotate-45 rounded-[3px] ${color}`} />
        <View className={`h-3.5 w-[18px] rounded-b-[3px] ${color}`} />
        <View className={`absolute bottom-0 h-2.5 w-1.5 rounded-t-sm ${cutout}`} />
      </View>
    );
  }

  if (tab === "attendance") {
    return (
      <View className="h-5 w-5 flex-row items-end justify-between px-0.5">
        <View className={`h-2.5 w-1 rounded-full ${color}`} />
        <View className={`h-[18px] w-1 rounded-full ${color}`} />
        <View className={`h-3.5 w-1 rounded-full ${color}`} />
      </View>
    );
  }

  if (tab === "profile") {
    return (
      <View className="h-5 w-5 items-center">
        <View className={`h-2 w-2 rounded-full ${color}`} />
        <View className={`mt-1 h-2.5 w-5 rounded-t-full ${color}`} />
      </View>
    );
  }

  return (
    <View className="h-5 w-5 items-center justify-center">
      <View className={`h-4 w-4 rounded-full ${color}`} />
      <View className={`absolute h-2 w-2 rounded-full ${cutout}`} />
      <View className={`absolute top-0 h-1.5 w-1.5 rounded-sm ${color}`} />
    </View>
  );
}

export default function EmployeeBottomNavigation({
  activeTab,
  onTabChange,
}: EmployeeBottomNavigationProps) {
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
              className={`min-h-14 flex-1 items-center justify-center rounded-[18px] ${
                isActive ? "bg-wind-50" : "bg-white active:bg-slate-50"
              }`}
              hitSlop={4}
              onPress={() => onTabChange(tab.key)}
            >
              <TabIcon active={isActive} tab={tab.key} />
              <Text
                className={`mt-1 text-[10px] font-bold ${
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
