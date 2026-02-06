import { View, Text } from "react-native";
import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <View className={cn("rounded-2xl bg-card p-4 border border-border", className)}>
      {children}
    </View>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return <View className={cn("mb-3", className)}>{children}</View>;
}

export function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Text className={cn("text-lg font-bold text-card-foreground", className)}>
      {children}
    </Text>
  );
}

export function CardDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Text className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </Text>
  );
}

export function CardContent({ children, className }: CardProps) {
  return <View className={cn("", className)}>{children}</View>;
}
