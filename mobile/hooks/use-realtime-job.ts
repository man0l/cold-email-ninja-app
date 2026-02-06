/**
 * Realtime subscription for bulk job progress.
 * Listens to ninja.bulk_jobs table changes via Supabase Realtime.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { BulkJob, JobProgress } from "@/lib/types";

export function useRealtimeJob(jobId: string | null) {
  const [job, setJob] = useState<BulkJob | null>(null);

  useEffect(() => {
    if (!jobId) return;

    // Fetch initial state
    supabase
      .from("bulk_jobs")
      .select("*")
      .eq("id", jobId)
      .single()
      .then(({ data }) => {
        if (data) setJob(data as BulkJob);
      });

    // Subscribe to changes
    const channel = supabase
      .channel(`job:${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "ninja",
          table: "bulk_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          setJob(payload.new as BulkJob);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return job;
}

/**
 * Subscribe to all active jobs for a campaign.
 */
export function useRealtimeCampaignJobs(campaignId: string | null) {
  const [jobs, setJobs] = useState<BulkJob[]>([]);

  useEffect(() => {
    if (!campaignId) return;

    // Fetch initial state
    supabase
      .from("bulk_jobs")
      .select("*")
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setJobs(data as BulkJob[]);
      });

    // Subscribe to changes
    const channel = supabase
      .channel(`campaign_jobs:${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "ninja",
          table: "bulk_jobs",
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setJobs((prev) => [payload.new as BulkJob, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as BulkJob;
            setJobs((prev) =>
              prev
                .map((j) => (j.id === updated.id ? updated : j))
                .filter((j) => ["pending", "running"].includes(j.status))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  return jobs;
}
