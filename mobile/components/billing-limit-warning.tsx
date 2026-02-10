/**
 * Billing Limit Warning Component
 * Displays when user has limited leads remaining or is over quota
 */
import { View, Text, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "./ui/button";

interface BillingLimitWarningProps {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  reason: string;
  leadsToAdd?: number;
  leadsRemaining?: number;
  percentUsed?: number;
  tier?: string;
}

export function BillingLimitWarning(props: BillingLimitWarningProps) {
  const isOverLimit = props.leadsRemaining === 0;

  return (
    <Modal visible={props.visible} animationType="fade" transparent>
      <View className="flex-1 bg-black/70 justify-end">
        <View className="bg-background rounded-t-3xl p-6 border-t border-border">
          {/* Close button */}
          <Pressable
            onPress={props.onClose}
            className="absolute top-4 right-4 z-10 p-2"
            hitSlop={16}
          >
            <Ionicons name="close" size={24} color="#94a3b8" />
          </Pressable>

          {/* Icon */}
          <View className="items-center mb-4">
            <View
              className={`w-16 h-16 rounded-full items-center justify-center ${
                isOverLimit ? "bg-red-500/20" : "bg-yellow-500/20"
              }`}
            >
              <Ionicons
                name={isOverLimit ? "close-circle" : "warning"}
                size={32}
                color={isOverLimit ? "#ef4444" : "#eab308"}
              />
            </View>
          </View>

          {/* Title & Message */}
          <Text
            className={`text-xl font-bold text-center mb-2 ${
              isOverLimit ? "text-red-300" : "text-yellow-300"
            }`}
          >
            {isOverLimit ? "Monthly Limit Reached" : "Approaching Limit"}
          </Text>

          <Text className="text-sm text-muted-foreground text-center mb-4">
            {props.reason}
          </Text>

          {/* Stats */}
          {props.percentUsed !== undefined && (
            <View className="bg-secondary/50 rounded-lg p-4 mb-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs text-muted-foreground">Usage</Text>
                <Text className="text-sm font-semibold text-foreground">
                  {props.percentUsed}% used
                </Text>
              </View>
              {props.leadsRemaining !== undefined && props.leadsRemaining > 0 && (
                <Text className="text-xs text-muted-foreground">
                  {props.leadsRemaining} leads remaining this month
                </Text>
              )}
            </View>
          )}

          {/* Plan info */}
          <View className="bg-secondary/20 border border-border rounded-lg p-3 mb-6">
            <Text className="text-xs text-muted-foreground mb-2">
              Current Plan
            </Text>
            <Text className="text-sm font-semibold text-foreground">
              {props.tier === "free"
                ? "Free (1,000 leads/month)"
                : `Pro (10,000 leads/month)`}
            </Text>
          </View>

          {/* Buttons */}
          <Button onPress={props.onUpgrade} className="mb-2">
            <Ionicons name="arrow-up-circle-outline" size={16} color="white" />
            <Text className="ml-2">Upgrade Plan</Text>
          </Button>

          <Button variant="outline" onPress={props.onClose}>
            Cancel
          </Button>
        </View>
      </View>
    </Modal>
  );
}
