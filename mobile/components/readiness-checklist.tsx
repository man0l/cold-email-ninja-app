/**
 * Learning #1: API key readiness checklist.
 * Shows which keys are configured and which are missing,
 * grouped by pipeline step.
 */
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, CardContent } from "@/components/ui/card";
import { useApiKeys } from "@/lib/queries";
import { STEP_REQUIREMENTS, API_SERVICE_LABELS } from "@/lib/errors";

export function ReadinessChecklist({ steps }: { steps?: string[] }) {
  const router = useRouter();
  const { data: keys } = useApiKeys();
  const configuredKeys = new Set((keys || []).map((k) => k.service));

  const stepsToShow = steps || Object.keys(STEP_REQUIREMENTS);

  // Collect all required keys
  const allRequired = new Set<string>();
  for (const step of stepsToShow) {
    const req = STEP_REQUIREMENTS[step];
    if (req) req.keys.forEach((k) => allRequired.add(k));
  }

  const missingKeys = [...allRequired].filter((k) => !configuredKeys.has(k));
  if (missingKeys.length === 0) return null;

  return (
    <Pressable onPress={() => router.push("/(tabs)/settings")}>
      <Card className="mb-4 border-yellow-500/50">
        <CardContent>
          <View className="flex-row items-center mb-2">
            <Ionicons name="warning-outline" size={18} color="#eab308" />
            <Text className="text-sm font-bold text-yellow-500 ml-2">
              {missingKeys.length} API key{missingKeys.length > 1 ? "s" : ""} missing
            </Text>
          </View>
          <View className="gap-1">
            {missingKeys.map((key) => (
              <View key={key} className="flex-row items-center">
                <Ionicons name="close-circle" size={14} color="#ef4444" />
                <Text className="text-xs text-muted-foreground ml-1.5">
                  {API_SERVICE_LABELS[key] || key}
                  <Text className="text-muted-foreground/60">
                    {" -- "}
                    {Object.values(STEP_REQUIREMENTS)
                      .filter((s) => s.keys.includes(key))
                      .map((s) => s.label)
                      .join(", ")}
                  </Text>
                </Text>
              </View>
            ))}
          </View>
          <Text className="text-xs text-primary mt-2">Tap to configure in Settings</Text>
        </CardContent>
      </Card>
    </Pressable>
  );
}
