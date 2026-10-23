import { forwardRef, useState, type ReactNode } from "react";
import {
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

export type FormFieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  error?: string;
  helperText?: string;
  rightAccessory?: ReactNode;
};

const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  {
    label,
    error,
    helperText,
    rightAccessory,
    accessibilityLabel,
    onBlur,
    onFocus,
    ...inputProps
  },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false);

  const borderClass = error
    ? "border-red-400 bg-red-50"
    : isFocused
      ? "border-wind-700 bg-white"
      : "border-slate-200 bg-slate-50";

  return (
    <View className="mb-5">
      <Text className="mb-2 ml-1 text-sm font-semibold text-slate-700">
        {label}
      </Text>
      <View
        className={`min-h-14 flex-row items-center rounded-2xl border px-4 ${borderClass}`}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={accessibilityLabel ?? label}
          className="min-h-14 flex-1 text-base text-wind-900 outline-none"
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor="#94a3b8"
          {...inputProps}
        />
        {rightAccessory}
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          className="ml-1 mt-1.5 text-xs font-medium text-red-500"
        >
          {error}
        </Text>
      ) : helperText ? (
        <Text className="ml-1 mt-1.5 text-xs leading-5 text-slate-500">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
});

export default FormField;
