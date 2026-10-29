import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";

import FormField from "../FormField/FormField";
import PasswordVisibilityButton from "../PasswordVisibilityButton/PasswordVisibilityButton";

type Props = {
  employeeName: string;
  visible: boolean;
  isBusy: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (password: string) => void;
};

export default function ResetCredentialsDialog({
  employeeName,
  visible,
  isBusy,
  error,
  onCancel,
  onSubmit,
}: Props) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (visible) {
      setPassword("");
      setConfirmation("");
      setShowPassword(false);
      setValidationError("");
    }
  }, [visible]);

  const submit = () => {
    if (password.length < 8) {
      setValidationError("Password must contain at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setValidationError("Passwords do not match.");
      return;
    }
    setValidationError("");
    onSubmit(password);
  };

  return (
    <Modal animationType="fade" onRequestClose={() => { if (!isBusy) onCancel(); }} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 items-center justify-center px-6">
        <Pressable className="absolute inset-0" disabled={isBusy} onPress={onCancel} style={{ backgroundColor: "rgba(2, 6, 23, 0.6)" }} />
        <View accessibilityViewIsModal className="w-full max-w-md rounded-[28px] bg-white p-6">
          <View className="h-14 w-14 items-center justify-center rounded-[20px] bg-sky-50">
            <Ionicons color="#0369a1" name="key-outline" size={27} />
          </View>
          <Text className="mt-5 text-[22px] font-bold text-slate-950">Reset credentials</Text>
          <Text className="mb-5 mt-2 text-sm leading-6 text-slate-600">
            Set a new password for {employeeName}. Their existing sessions will be signed out.
          </Text>
          <FormField
            autoCapitalize="none"
            editable={!isBusy}
            label="New password"
            onChangeText={(value) => { setPassword(value); setValidationError(""); }}
            rightAccessory={<PasswordVisibilityButton visible={showPassword} onPress={() => setShowPassword((current) => !current)} />}
            secureTextEntry={!showPassword}
            value={password}
          />
          <FormField
            autoCapitalize="none"
            editable={!isBusy}
            label="Confirm new password"
            onChangeText={(value) => { setConfirmation(value); setValidationError(""); }}
            secureTextEntry={!showPassword}
            value={confirmation}
          />
          {validationError || error ? (
            <Text accessibilityLiveRegion="polite" className="-mt-2 mb-4 text-sm font-semibold text-red-700">
              {validationError || error}
            </Text>
          ) : null}
          <View className="flex-row gap-3">
            <Pressable accessibilityRole="button" className="min-h-12 flex-1 items-center justify-center rounded-[16px] border border-slate-300" disabled={isBusy} onPress={onCancel}>
              <Text className="text-sm font-bold text-slate-700">Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" className="min-h-12 flex-1 items-center justify-center rounded-[16px] bg-sky-700" disabled={isBusy} onPress={submit}>
              {isBusy ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-bold text-white">Reset password</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
