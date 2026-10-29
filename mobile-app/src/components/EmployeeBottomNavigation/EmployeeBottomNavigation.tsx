import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";

import type { EmployeeTab } from "../../types/employee";

type EmployeeBottomNavigationProps = {
  activeTab: EmployeeTab;
  unreadNotificationCount?: number;
  onTabChange: (tab: EmployeeTab) => void;
};

type IconName = ComponentProps<typeof Ionicons>["name"];

const tabs: Array<{
  key: EmployeeTab;
  label: string;
  icon: IconName;
  activeIcon: IconName;
}> = [
  { key: "home", label: "Home", icon: "home-outline", activeIcon: "home" },
  { key: "attendance", label: "Attendance", icon: "time-outline", activeIcon: "time" },
  { key: "notifications", label: "Alerts", icon: "notifications-outline", activeIcon: "notifications" },
  { key: "profile", label: "Profile", icon: "person-outline", activeIcon: "person" },
  { key: "settings", label: "Settings", icon: "settings-outline", activeIcon: "settings" },
];

export default function EmployeeBottomNavigation({
  activeTab,
  unreadNotificationCount = 0,
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
              <Ionicons
                color={isActive ? "#047857" : "#64748b"}
                name={isActive ? tab.activeIcon : tab.icon}
                size={23}
              />
              {tab.key === "notifications" && unreadNotificationCount > 0 ? (
                <View className="absolute right-3 top-1.5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5">
                  <Text className="text-[9px] font-bold text-white">{Math.min(unreadNotificationCount, 99)}</Text>
                </View>
              ) : null}
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
