/**
 * Realtime subscription for bulk job progress.
 *
 * Primary: Supabase Realtime postgres_changes on ninja.bulk_jobs.
 * Fallback: REST polling every 15s as a safety net (stops when Realtime
 *           proves active or the job reaches a terminal state).
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { BulkJob, JobProgress } from "@/lib/types";

/** Polling is a safety net — 15s is enough since Realtime delivers in <1s */
const POLL_INTERVAL_MS = 15_000;

export function useRealtimeJob(jobId: string | null) {
  const [job, setJob] = useState<BulkJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeActiveRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    const { data } = await supabase
      .from("bulk_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (data) setJob(data as BulkJob);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;

    realtimeActiveRef.current = false;

    // Fetch initial state
    fetchJob();

    // Primary: subscribe to changes via Realtime
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
          realtimeActiveRef.current = true;
          stopPolling(); // Realtime is working — no need to poll
          setJob(payload.new as BulkJob);
        }
      )
      .subscribe();

    // Fallback: poll at a relaxed interval as safety net
    pollRef.current = setInterval(() => {
      if (!realtimeActiveRef.current) fetchJob();
    }, POLL_INTERVAL_MS);

    return () => {
      supabase.removeChannel(channel);
      stopPolling();
    };
  }, [jobId, fetchJob, stopPolling]);

  // Stop polling once the job reaches a terminal state
  useEffect(() => {
    if (
      job &&
      (job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled")
    ) {
      stopPolling();
    }
  }, [job?.status, stopPolling]);

  return job;
}

/**
 * Subscribe to all active jobs for a campaign.
 *
 * Primary: Supabase Realtime postgres_changes on ninja.bulk_jobs.
 * Fallback: REST polling every 15s as a safety net (stops when Realtime
 *           proves active or no active jobs remain).
 */
export function useRealtimeCampaignJobs(campaignId: string | null) {
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeActiveRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    if (!campaignId) return;
    const { data } = await supabase
      .from("bulk_jobs")
      .select("*")
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false });
    if (data) setJobs(data as BulkJob[]);
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) return;

    realtimeActiveRef.current = false;

    // Fetch initial state
    fetchJobs();

    // Primary: subscribe to changes via Realtime
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
          realtimeActiveRef.current = true;
          stopPolling(); // Realtime is working — no need to poll
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

    // Fallback: poll at a relaxed interval as safety net
    pollRef.current = setInterval(() => {
      if (!realtimeActiveRef.current) fetchJobs();
    }, POLL_INTERVAL_MS);

    return () => {
      supabase.removeChannel(channel);
      stopPolling();
    };
  }, [campaignId, fetchJobs, stopPolling]);

  // Stop polling when there are no active jobs
  useEffect(() => {
    if (jobs.length === 0) stopPolling();
  }, [jobs.length, stopPolling]);

  return jobs;
}
