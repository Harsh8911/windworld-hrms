import { Pressable, Text } from "react-native";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export default function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      className={`min-h-14 flex-row items-center justify-center rounded-2xl px-5 ${
        disabled ? "bg-wind-400" : "bg-wind-700 active:bg-wind-800"
      }`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text className="text-base font-bold text-white">{label}</Text>
      <Text className="ml-2 text-xl text-white">→</Text>
    </Pressable>
  );
}
