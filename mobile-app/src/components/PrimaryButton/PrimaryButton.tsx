import { ActivityIndicator, Pressable, Text } from "react-native";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export default function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      className={`min-h-14 flex-row items-center justify-center rounded-2xl px-5 ${
        isDisabled ? "bg-wind-600" : "bg-wind-700 active:bg-wind-800"
      }`}
      disabled={isDisabled}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator className="mr-2" color="#ffffff" size="small" /> : null}
      <Text className="text-base font-bold text-white">{label}</Text>
      {!loading ? <Text className="ml-2 text-xl text-white">→</Text> : null}
    </Pressable>
  );
}
