/**
 * Learning #3: Pipeline funnel visualization.
 * Shows how leads narrow through each enrichment step.
 */
import { View, Text } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataQuality } from "@/lib/queries";

interface FunnelStep {
  label: string;
  count: number;
  color: string;
}

export function PipelineFunnel({ campaignId }: { campaignId: string }) {
  const { data: quality } = useDataQuality(campaignId);
  if (!quality || quality.total === 0) return null;

  const steps: FunnelStep[] = [
    { label: "Scraped", count: quality.total, color: "bg-blue-500" },
    { label: "Has website", count: quality.withWebsite, color: "bg-indigo-500" },
    { label: "Email found", count: quality.withEmail, color: "bg-violet-500" },
    { label: "Website valid", count: quality.validated, color: "bg-purple-500" },
    { label: "Decision maker", count: quality.withDM, color: "bg-fuchsia-500" },
    { label: "Name casualised", count: quality.withCasual, color: "bg-pink-500" },
  ].filter((s) => s.count > 0);

  const maxCount = steps[0]?.count || 1;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Pipeline Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        {steps.map((step, i) => {
          const widthPct = Math.max(15, (step.count / maxCount) * 100);
          const dropoff =
            i > 0 ? Math.round(((steps[i - 1].count - step.count) / steps[i - 1].count) * 100) : 0;

          return (
            <View key={step.label} className="mb-2">
              <View className="flex-row items-center justify-between mb-0.5">
                <Text className="text-xs text-muted-foreground">{step.label}</Text>
                <Text className="text-xs text-foreground font-semibold">
                  {step.count}
                  {dropoff > 0 && (
                    <Text className="text-red-400 font-normal"> (-{dropoff}%)</Text>
                  )}
                </Text>
              </View>
              <View className="h-5 rounded bg-secondary/50 overflow-hidden">
                <View
                  className={`h-full rounded ${step.color}`}
                  style={{ width: `${widthPct}%` }}
                />
              </View>
            </View>
          );
        })}
      </CardContent>
    </Card>
  );
}
