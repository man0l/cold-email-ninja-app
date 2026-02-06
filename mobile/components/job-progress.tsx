/**
 * Learning #2 + #10: Job progress with speed tiers and heartbeat.
 * - Instant: inline spinner with immediate result
 * - Fast: progress bar, keep user on screen
 * - Slow: background with elapsed time heartbeat
 */
import { View, Text, Pressable } from "react-native";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useRealtimeJob } from "@/hooks/use-realtime-job";
import { JOB_TYPE_LABELS, formatRelativeTime } from "@/lib/utils";
import { humanizeError } from "@/lib/errors";

interface JobProgressCardProps {
  jobId: string;
  onRetry?: () => void;
}

function ElapsedTime({ startedAt }: { startedAt: string | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <Text className="text-xs text-muted-foreground">
      {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`} elapsed
    </Text>
  );
}

export function JobProgressCard({ jobId, onRetry }: JobProgressCardProps) {
  const job = useRealtimeJob(jobId);

  if (!job) return null;

  const progress = job.progress;
  const pct =
    progress?.total && progress.total > 0
      ? ((progress.processed || 0) / progress.total) * 100
      : 0;

  return (
    <Card className="mb-3">
      <CardContent>
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm font-bold text-foreground">
            {JOB_TYPE_LABELS[job.type] || job.type}
          </Text>
          <Badge variant="status" status={job.status}>
            {job.status}
          </Badge>
        </View>

        {/* Running: progress bar + heartbeat */}
        {job.status === "running" && (
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
                <View className="w-2 h-2 rounded-full bg-blue-500 animate-pulse mr-2" />
                <Text className="text-xs text-muted-foreground">Working...</Text>
              </View>
            )}
            <ElapsedTime startedAt={job.started_at} />
          </View>
        )}

        {/* Pending: waiting for worker */}
        {job.status === "pending" && (
          <View className="flex-row items-center">
            <View className="w-2 h-2 rounded-full bg-yellow-500 mr-2" />
            <Text className="text-xs text-muted-foreground">
              Waiting for worker to pick up...
            </Text>
          </View>
        )}

        {/* Completed: result summary */}
        {job.status === "completed" && (
          <View className="bg-green-500/10 rounded-lg p-2.5 mt-1">
            <Text className="text-xs text-green-400 font-medium">
              {Object.entries(job.result || {})
                .filter(([k]) => !["total"].includes(k))
                .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                .join("  ·  ")}
            </Text>
            <Text className="text-xs text-green-400/60 mt-0.5">
              Completed {formatRelativeTime(job.completed_at)}
            </Text>
          </View>
        )}

        {/* Failed: error with retry */}
        {job.status === "failed" && job.error && (
          <View className="bg-red-500/10 rounded-lg p-2.5 mt-1">
            {(() => {
              const err = humanizeError(job.error);
              return (
                <>
                  <Text className="text-xs text-red-400 font-medium">{err.message}</Text>
                  <Text className="text-xs text-red-400/70 mt-0.5">{err.fix}</Text>
                </>
              );
            })()}
            {onRetry && (
              <Button
                size="sm"
                variant="outline"
                onPress={onRetry}
                className="mt-2 self-start"
              >
                Retry
              </Button>
            )}
          </View>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Inline result display for instant operations (Learning #2).
 */
export function InlineResult({
  result,
  label,
}: {
  result: { processed?: number; total?: number; [key: string]: unknown } | null;
  label: string;
}) {
  if (!result) return null;

  return (
    <View className="bg-green-500/10 rounded-lg p-2.5 mt-2">
      <Text className="text-xs text-green-400 font-medium">
        {label}: {result.processed || 0} processed
        {Object.entries(result)
          .filter(([k]) => !["processed", "total", "campaign_id"].includes(k))
          .map(([k, v]) => ` · ${k.replace(/_/g, " ")}: ${v}`)
          .join("")}
      </Text>
    </View>
  );
}
