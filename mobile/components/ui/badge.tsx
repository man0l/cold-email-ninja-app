import { View, Text } from "react-native";
import { cn, STATUS_COLORS } from "@/lib/utils";

interface BadgeProps {
  children: string;
  variant?: "default" | "status";
  status?: string;
  className?: string;
}

export function Badge({ children, variant = "default", status, className }: BadgeProps) {
  const bgColor = status ? STATUS_COLORS[status] || "bg-gray-500" : "bg-primary";

  return (
    <View
      className={cn(
        "rounded-full px-2.5 py-0.5 self-start",
        variant === "status" ? bgColor : "bg-primary",
        className
      )}
    >
      <Text className="text-xs font-medium text-white capitalize">
        {children}
      </Text>
    </View>
  );
}
