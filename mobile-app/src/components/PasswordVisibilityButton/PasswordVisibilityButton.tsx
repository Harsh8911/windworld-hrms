import { Pressable, View } from "react-native";

type PasswordVisibilityButtonProps = {
  visible: boolean;
  onPress: () => void;
};

export default function PasswordVisibilityButton({
  visible,
  onPress,
}: PasswordVisibilityButtonProps) {
  return (
    <Pressable
      accessibilityLabel={visible ? "Hide password" : "Show password"}
      accessibilityRole="button"
      className="ml-3 h-12 w-12 items-center justify-center rounded-full active:bg-wind-50"
      hitSlop={6}
      onPress={onPress}
    >
      <View className="h-4 w-6 items-center justify-center rounded-[12px] border-2 border-wind-700">
        <View className="h-2 w-2 rounded-full bg-wind-700" />
      </View>
      {!visible ? (
        <View
          className="absolute h-0.5 w-7 rounded-full bg-wind-700"
          style={{ transform: [{ rotate: "-42deg" }] }}
        />
      ) : null}
    </Pressable>
  );
}
