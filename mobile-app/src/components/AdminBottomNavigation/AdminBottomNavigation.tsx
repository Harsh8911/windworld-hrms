import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";

import type { AdminTab } from "../../types/admin";

type AdminBottomNavigationProps = {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
};

type IconName = ComponentProps<typeof Ionicons>["name"];

const tabs: Array<{
  key: AdminTab;
  label: string;
  icon: IconName;
  activeIcon: IconName;
}> = [
  { key: "employees", label: "Team", icon: "people-outline", activeIcon: "people" },
  { key: "addEmployee", label: "Add", icon: "person-add-outline", activeIcon: "person-add" },
  { key: "attendance", label: "Logs", icon: "clipboard-outline", activeIcon: "clipboard" },
  { key: "locations", label: "Locations", icon: "location-outline", activeIcon: "location" },
  { key: "settings", label: "Settings", icon: "settings-outline", activeIcon: "settings" },
];

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
              <Ionicons
                color={isActive ? "#047857" : "#64748b"}
                name={isActive ? tab.activeIcon : tab.icon}
                size={23}
              />
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
