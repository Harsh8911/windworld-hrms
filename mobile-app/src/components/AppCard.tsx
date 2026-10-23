import { StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";

type CardTone = "neutral" | "success" | "error";

type AppCardProps = {
  label: string;
  value: string;
  tone?: CardTone;
};

const toneColors: Record<CardTone, string> = {
  neutral: colors.mutedText,
  success: colors.success,
  error: colors.error,
};

export default function AppCard({
  label,
  value,
  tone = "neutral",
}: AppCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: toneColors[tone] }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 28,
    padding: 18,
  },
  label: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  value: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
  },
});
