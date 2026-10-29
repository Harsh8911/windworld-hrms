import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";

import { ApiError, getEmployeeNotifications, markEmployeeNotificationRead } from "../../../services/api";
import type { EmployeeNotification } from "../../../types/api";

type Props = { onUnreadCountChange: (count: number) => void };

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EmployeeNotificationsScreen({ onUnreadCountChange }: Props) {
  const [notifications, setNotifications] = useState<EmployeeNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setError("");
    try {
      const response = await getEmployeeNotifications();
      setNotifications(response.notifications);
      onUnreadCountChange(response.unreadCount);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load notifications.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => { void loadNotifications(); }, [loadNotifications]);

  const markRead = async (notification: EmployeeNotification) => {
    if (notification.isRead || busyId) return;
    setBusyId(notification.id);
    try {
      const response = await markEmployeeNotificationRead(notification.id);
      setNotifications((current) => current.map((item) => item.id === notification.id ? response.notification : item));
      onUnreadCountChange(Math.max(0, notifications.filter((item) => !item.isRead).length - 1));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to mark the notification as read.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <FlatList
      className="flex-1 bg-[#f6f8f4]"
      contentContainerClassName="px-5 pb-8 pt-4"
      data={notifications}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View className="mb-6">
          <Text className="text-sm font-semibold text-wind-700">ACCOUNT ACTIVITY</Text>
          <Text className="mt-1 text-[30px] font-bold leading-9 text-slate-950">Notifications</Text>
          <Text className="mt-2 text-sm leading-5 text-slate-500">Security and account updates from your administrator.</Text>
          {error ? <Text className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <View className="items-center rounded-[24px] border border-slate-200 bg-white px-6 py-10">
          {isLoading ? <ActivityIndicator color="#047857" /> : <Ionicons color="#64748b" name="notifications-off-outline" size={30} />}
          <Text className="mt-4 text-base font-bold text-slate-950">{isLoading ? "Loading notifications" : "No notifications"}</Text>
          {!isLoading ? <Text className="mt-1 text-center text-xs leading-5 text-slate-500">Account and security updates will appear here.</Text> : null}
        </View>
      }
      onRefresh={() => void loadNotifications(true)}
      refreshing={isRefreshing}
      renderItem={({ item }) => (
        <Pressable accessibilityLabel={`${item.title}. ${item.isRead ? "Read" : "Unread"}`} accessibilityRole="button" className={`mb-3 rounded-[24px] border p-4 ${item.isRead ? "border-slate-200 bg-white" : "border-wind-200 bg-wind-50"}`} disabled={busyId === item.id} onPress={() => void markRead(item)}>
          <View className="flex-row items-start">
            <View className={`h-11 w-11 items-center justify-center rounded-[16px] ${item.isRead ? "bg-slate-100" : "bg-white"}`}>
              <Ionicons color={item.isRead ? "#64748b" : "#047857"} name="key-outline" size={22} />
            </View>
            <View className="ml-3 flex-1">
              <View className="flex-row items-center">
                <Text className="flex-1 text-base font-bold text-slate-950">{item.title}</Text>
                {!item.isRead ? <View className="ml-2 h-2.5 w-2.5 rounded-full bg-red-600" /> : null}
              </View>
              <Text className="mt-2 text-sm leading-6 text-slate-600">{item.message}</Text>
              <Text className="mt-3 text-[11px] font-semibold text-slate-400">{formatTimestamp(item.createdAt)}</Text>
            </View>
          </View>
        </Pressable>
      )}
      showsVerticalScrollIndicator={false}
    />
  );
}
