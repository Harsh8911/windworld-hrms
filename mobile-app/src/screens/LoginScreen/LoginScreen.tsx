import { useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BrandLogo from "../../components/BrandLogo/BrandLogo";
import FormField from "../../components/FormField/FormField";
import PasswordVisibilityButton from "../../components/PasswordVisibilityButton/PasswordVisibilityButton";
import PrimaryButton from "../../components/PrimaryButton/PrimaryButton";
import type { RootStackParamList } from "../../navigation/types";
import { ApiError, login } from "../../services/api";
import { saveAuthentication } from "../../services/authStorage";

type LoginScreenProps = NativeStackScreenProps<RootStackParamList, "Login">;

type LoginErrors = {
  identity?: string;
  password?: string;
};

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (isSubmitting) return;

    const nextErrors: LoginErrors = {};
    const normalizedIdentity = identity.trim().toLowerCase();

    if (!identity.trim()) {
      nextErrors.identity = "Enter your email, username, or employee ID.";
    }

    if (!password) {
      nextErrors.password = "Enter your password.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const authentication = await login(normalizedIdentity, password);

      await saveAuthentication(authentication);
      navigation.replace(
        authentication.user.role === "ADMIN" ? "AdminDashboard" : "EmployeeDashboard",
      );
    } catch (error) {
      setErrors({
        password:
          error instanceof ApiError
            ? error.message
            : "Unable to sign in right now. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f3f8f1]">
      <StatusBar style="light" />

      <View className="absolute -left-24 -right-24 -top-36 h-96 rounded-b-[120px] bg-wind-700" />
      <View
        className="absolute -right-16 top-16 h-44 w-44 rounded-full bg-wind-500"
        style={{ opacity: 0.25 }}
      />
      <View
        className="absolute -left-12 top-28 h-28 w-28 rounded-full bg-white"
        style={{ opacity: 0.1 }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          alwaysBounceVertical={false}
          contentContainerClassName="flex-grow justify-center px-5 py-7"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-5 flex-row items-center justify-between px-1">
            <View>
              <Text className="text-xs font-bold tracking-[2px] text-emerald-100">
                Wind World (India) Limited
              </Text>
            </View>
          </View>

          <View className="w-full max-w-md self-center rounded-[32px] border border-slate-100 bg-white px-6 pb-7 pt-3">
            <View className="items-center">
              <View className="h-36 w-full items-center justify-center overflow-hidden">
                <BrandLogo className="h-full w-full" />
              </View>
              <View className="-mt-3 h-1 w-10 rounded-full bg-wind-500" />
            </View>

            <View className="mb-8 mt-5">
              <Text className="text-2xl font-bold tracking-tight text-wind-900">
                Welcome
              </Text>
              <Text className="mt-2 text-base leading-6 text-slate-500">
                Sign in to your WindWorld workspace.
              </Text>
            </View>

            <FormField
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect={false}
              error={errors.identity}
              editable={!isSubmitting}
              label="Email, username, or employee ID"
              onChangeText={(value) => {
                setIdentity(value);
                if (errors.identity) {
                  setErrors((current) => ({ ...current, identity: undefined }));
                }
              }}
              placeholder="admin@windworld.com / EMP-1043"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              returnKeyType="next"
              textContentType="username"
              value={identity}
            />

            <FormField
              ref={passwordInputRef}
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!isSubmitting}
              error={errors.password}
              label="Password"
              onChangeText={(value) => {
                setPassword(value);
                if (errors.password) {
                  setErrors((current) => ({ ...current, password: undefined }));
                }
              }}
              onSubmitEditing={handleLogin}
              placeholder="Enter your password"
              returnKeyType="done"
              rightAccessory={
                <PasswordVisibilityButton
                  onPress={() => setShowPassword((current) => !current)}
                  visible={showPassword}
                />
              }
              secureTextEntry={!showPassword}
              textContentType="password"
              value={password}
            />

            <PrimaryButton
              disabled={isSubmitting}
              label={isSubmitting ? "Signing in..." : "Login securely"}
              loading={isSubmitting}
              onPress={() => void handleLogin()}
            />

             
           
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
