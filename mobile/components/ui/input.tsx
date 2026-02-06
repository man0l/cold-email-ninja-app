import { TextInput, View, Text } from "react-native";
import { cn } from "@/lib/utils";

interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  multiline?: boolean;
  numberOfLines?: number;
  secureTextEntry?: boolean;
  className?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}

export function Input({
  value,
  onChangeText,
  placeholder,
  label,
  multiline,
  numberOfLines,
  secureTextEntry,
  className,
  autoCapitalize = "none",
}: InputProps) {
  return (
    <View className="mb-4">
      {label && (
        <Text className="text-sm font-medium text-foreground mb-1.5">
          {label}
        </Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        multiline={multiline}
        numberOfLines={numberOfLines}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        className={cn(
          "h-12 rounded-xl border border-input bg-card px-4 text-foreground text-sm",
          multiline && "h-auto min-h-[80px] py-3",
          className
        )}
      />
    </View>
  );
}
