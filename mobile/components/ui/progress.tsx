import { View, Text } from "react-native";
import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number; // 0-100
  label?: string;
  className?: string;
}

export function Progress({ value, label, className }: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <View className={cn("w-full", className)}>
      {label && (
        <View className="flex-row justify-between mb-1">
          <Text className="text-xs text-muted-foreground">{label}</Text>
          <Text className="text-xs text-muted-foreground">
            {Math.round(clampedValue)}%
          </Text>
        </View>
      )}
      <View className="h-2 rounded-full bg-secondary overflow-hidden">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${clampedValue}%` }}
        />
      </View>
    </View>
  );
}
