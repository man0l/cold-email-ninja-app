/**
 * Edge Function: enqueue-enrichment
 * Queue per-lead icebreaker enrichment jobs (mirrors production pattern)
 * Uses ninja.enqueue_lead_enrichment RPC
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseClient, getUserId, jsonResponse, errorResponse, handleCors } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const supabase = getSupabaseClient(req);
  const customerId = getUserId(req);

  try {
    const { campaign_id, lead_ids, all = false } = await req.json();
    if (!campaign_id) return errorResponse("campaign_id required");

    let targetLeadIds: string[] = lead_ids || [];

    // If all=true, fetch all pending leads without enrichment jobs
    if (all && !lead_ids?.length) {
      const { data: leads, error } = await supabase
        .from("leads")
        .select("id")
        .eq("campaign_id", campaign_id)
        .eq("customer_id", customerId)
        .eq("ice_status", "pending");

      if (error) return errorResponse(error.message);
      targetLeadIds = (leads || []).map((l: { id: string }) => l.id);
    }

    if (!targetLeadIds.length) {
      return jsonResponse({ enqueued: 0, message: "No leads to enqueue" });
    }

    // Use RPC to bulk enqueue
    const { data, error } = await supabase.rpc("enqueue_lead_enrichment", {
      p_campaign_id: campaign_id,
      p_lead_ids: targetLeadIds,
    });

    if (error) return errorResponse(error.message);

    // Update lead statuses to 'queued'
    await supabase
      .from("leads")
      .update({ ice_status: "queued" })
      .in("id", targetLeadIds)
      .eq("customer_id", customerId)
      .eq("ice_status", "pending");

    return jsonResponse({
      enqueued: data || targetLeadIds.length,
      campaign_id,
    });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
