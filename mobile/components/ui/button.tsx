import { Pressable, Text, ActivityIndicator } from "react-native";
import { cn } from "@/lib/utils";

interface ButtonProps {
  onPress?: () => void;
  children: React.ReactNode;
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

const variants = {
  default: "bg-primary",
  secondary: "bg-secondary",
  destructive: "bg-destructive",
  outline: "border border-border bg-transparent",
  ghost: "bg-transparent",
};

const textVariants = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  destructive: "text-destructive-foreground",
  outline: "text-foreground",
  ghost: "text-foreground",
};

const sizes = {
  default: "h-12 px-6 rounded-xl",
  sm: "h-9 px-4 rounded-lg",
  lg: "h-14 px-8 rounded-xl",
  icon: "h-10 w-10 rounded-lg",
};

export function Button({
  onPress,
  children,
  variant = "default",
  size = "default",
  disabled = false,
  loading = false,
  className,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={cn(
        "flex-row items-center justify-center",
        variants[variant],
        sizes[size],
        (disabled || loading) && "opacity-50",
        className
      )}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color="#fff"
          style={{ marginRight: 8 }}
        />
      )}
      {typeof children === "string" ? (
        <Text className={cn("font-semibold text-sm", textVariants[variant])}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
