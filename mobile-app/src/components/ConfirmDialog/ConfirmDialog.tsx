import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";

type DialogVariant = "default" | "warning" | "danger";
type IconName = ComponentProps<typeof Ionicons>["name"];

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const variantStyles: Record<
  DialogVariant,
  {
    icon: IconName;
    iconColor: string;
    iconBackground: string;
    confirmButton: string;
  }
> = {
  default: {
    icon: "checkmark-circle-outline",
    iconColor: "#047857",
    iconBackground: "bg-wind-50",
    confirmButton: "bg-wind-700 active:bg-wind-800",
  },
  warning: {
    icon: "archive-outline",
    iconColor: "#b45309",
    iconBackground: "bg-amber-50",
    confirmButton: "bg-amber-600 active:bg-amber-700",
  },
  danger: {
    icon: "alert-circle-outline",
    iconColor: "#b91c1c",
    iconBackground: "bg-red-50",
    confirmButton: "bg-red-700 active:bg-red-800",
  },
};

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "default",
  isBusy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const styles = variantStyles[variant];
  const closeDialog = () => {
    if (!isBusy) onCancel();
  };

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      navigationBarTranslucent
      onRequestClose={closeDialog}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View className="flex-1 items-center justify-center px-6">
        <Pressable
          accessibilityElementsHidden
          className="absolute inset-0"
          disabled={isBusy}
          importantForAccessibility="no-hide-descendants"
          onPress={closeDialog}
          style={{ backgroundColor: "rgba(2, 6, 23, 0.6)" }}
        />

        <View
          accessibilityViewIsModal
          className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-6"
        >
          <View className={`h-14 w-14 items-center justify-center rounded-[20px] ${styles.iconBackground}`}>
            <Ionicons color={styles.iconColor} name={styles.icon} size={28} />
          </View>

          <Text accessibilityRole="header" className="mt-5 text-[22px] font-bold leading-7 text-slate-950">
            {title}
          </Text>
          <Text className="mt-2 text-sm leading-6 text-slate-600">{message}</Text>

          <View className="mt-6 flex-row gap-3">
            <Pressable
              accessibilityLabel={cancelLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
              className="min-h-12 flex-1 items-center justify-center rounded-[16px] border border-slate-300 bg-white active:bg-slate-50"
              disabled={isBusy}
              onPress={closeDialog}
            >
              <Text className="text-sm font-bold text-slate-700">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={confirmLabel}
              accessibilityRole="button"
              accessibilityState={{ busy: isBusy, disabled: isBusy }}
              className={`min-h-12 flex-1 items-center justify-center rounded-[16px] ${styles.confirmButton}`}
              disabled={isBusy}
              onPress={onConfirm}
            >
              {isBusy ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
