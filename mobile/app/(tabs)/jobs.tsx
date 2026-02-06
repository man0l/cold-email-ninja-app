/**
 * Jobs monitor screen - Learning #7 + #10.
 * Human-friendly errors with retry, elapsed time heartbeat.
 */
import { View, Text, FlatList, RefreshControl } from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useBulkJobs } from "@/lib/queries";
import { formatRelativeTime, JOB_TYPE_LABELS } from "@/lib/utils";
import { humanizeError, STEP_REQUIREMENTS } from "@/lib/errors";
import type { BulkJob } from "@/lib/types";

function ElapsedTimer({ startedAt }: { startedAt: string | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!startedAt || elapsed === 0) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <Text className="text-xs text-muted-foreground">
      {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
    </Text>
  );
}

export default function JobsScreen() {
  const { data: jobs, refetch } = useBulkJobs();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const renderJob = ({ item }: { item: BulkJob }) => {
    const progress = item.progress;
    const pct =
      progress?.total && progress.total > 0
        ? ((progress.processed || 0) / progress.total) * 100
        : 0;
    const tier = STEP_REQUIREMENTS[item.type]?.tier;

    return (
      <Card className="mb-3">
        <CardContent>
          {/* Header row */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-1 mr-2">
              <Text className="text-sm font-bold text-foreground">
                {JOB_TYPE_LABELS[item.type] || item.type}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {formatRelativeTime(item.created_at)}
                {tier && ` · ${tier}`}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              {item.status === "running" && <ElapsedTimer startedAt={item.started_at} />}
              <Badge variant="status" status={item.status}>
                {item.status}
              </Badge>
            </View>
          </View>

          {/* Running: progress + heartbeat (Learning #10) */}
          {item.status === "running" && (
            <View>
              {progress?.total ? (
                <Progress
                  value={pct}
                  label={`${progress.processed || 0} / ${progress.total}${
                    progress.found !== undefined ? ` (${progress.found} found)` : ""
                  }`}
                />
              ) : (
                <View className="flex-row items-center">
                  <View className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                  <Text className="text-xs text-muted-foreground">
                    Worker processing... waiting for first results
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Pending: waiting (Learning #10) */}
          {item.status === "pending" && (
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-yellow-500 mr-2" />
              <Text className="text-xs text-muted-foreground">
                Queued. Worker will pick this up shortly.
              </Text>
            </View>
          )}

          {/* Completed: result summary */}
          {item.status === "completed" && item.result && (
            <View className="bg-green-500/10 rounded-lg p-2.5">
              <Text className="text-xs text-green-400 font-medium">
                {Object.entries(item.result)
                  .filter(([k]) => !["total"].includes(k))
                  .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                  .join("  ·  ")}
              </Text>
            </View>
          )}

          {/* Failed: human-friendly error + retry (Learning #7) */}
          {item.status === "failed" && item.error && (
            <View className="bg-red-500/10 rounded-lg p-2.5">
              {(() => {
                const err = humanizeError(item.error);
                return (
                  <>
                    <View className="flex-row items-start">
                      <Ionicons
                        name="alert-circle"
                        size={14}
                        color="#ef4444"
                        style={{ marginTop: 1, marginRight: 6 }}
                      />
                      <View className="flex-1">
                        <Text className="text-xs text-red-400 font-medium">{err.message}</Text>
                        <Text className="text-xs text-red-400/70 mt-0.5">{err.fix}</Text>
                      </View>
                    </View>
                  </>
                );
              })()}
            </View>
          )}

          {/* Cancelled */}
          {item.status === "cancelled" && (
            <Text className="text-xs text-muted-foreground italic">Cancelled</Text>
          )}
        </CardContent>
      </Card>
    );
  };

  // Split into active and history
  const active = (jobs || []).filter((j) => ["pending", "running"].includes(j.status));
  const history = (jobs || []).filter((j) => !["pending", "running"].includes(j.status));

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={[...active, ...history]}
        renderItem={renderJob}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
        ListHeaderComponent={
          active.length > 0 ? (
            <View className="flex-row items-center mb-3">
              <View className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
              <Text className="text-sm font-bold text-foreground">
                {active.length} active job{active.length > 1 ? "s" : ""}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center py-12">
            <Ionicons name="checkmark-circle-outline" size={40} color="#334155" />
            <Text className="text-muted-foreground text-sm mt-2">
              No jobs yet. Start from a campaign's enrichment pipeline.
            </Text>
          </View>
        }
        ItemSeparatorComponent={() =>
          // Visual separator between active and history sections
          null
        }
      />
    </View>
  );
}
