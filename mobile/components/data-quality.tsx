/**
 * Learning #5: Data quality summary card.
 * Shows enrichment coverage with color-coded metrics.
 */
import { View, Text } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataQuality } from "@/lib/queries";

function Metric({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const color =
    pct >= 80 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400";
  const barColor =
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";

  return (
    <View className="mb-2.5">
      <View className="flex-row justify-between mb-0.5">
        <Text className="text-xs text-muted-foreground">{label}</Text>
        <Text className={`text-xs font-semibold ${color}`}>
          {value}/{total} ({pct}%)
        </Text>
      </View>
      <View className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <View className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

export function DataQualityCard({ campaignId }: { campaignId: string }) {
  const { data: quality } = useDataQuality(campaignId);
  if (!quality || quality.total === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Data Quality</CardTitle>
      </CardHeader>
      <CardContent>
        <Metric label="Has website" value={quality.withWebsite} total={quality.total} />
        <Metric label="Has email" value={quality.withEmail} total={quality.total} />
        <Metric label="Decision maker" value={quality.withDM} total={quality.total} />
        <Metric label="Website validated" value={quality.validated} total={quality.total} />
        <Metric label="Name casualised" value={quality.withCasual} total={quality.total} />
        <Metric label="Has icebreaker" value={quality.withIcebreaker} total={quality.total} />
      </CardContent>
    </Card>
  );
}
