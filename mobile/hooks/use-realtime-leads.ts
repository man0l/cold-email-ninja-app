/**
 * Realtime subscription for lead changes.
 * Listens to ninja.leads table for new/updated leads.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Invalidates leads query when leads change for a campaign.
 * This provides a lightweight "live" experience without fetching all changes.
 */
export function useRealtimeLeads(campaignId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!campaignId) return;

    const channel = supabase
      .channel(`leads:${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "ninja",
          table: "leads",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          // Invalidate the leads query so it refetches
          queryClient.invalidateQueries({
            queryKey: ["leads", campaignId],
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId, queryClient]);
}
