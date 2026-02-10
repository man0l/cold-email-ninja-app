/**
 * Edge Function: billing/log-usage
 * Log lead usage after successful scrape/import
 * Called by backend after job completes
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getSupabaseClient,
  jsonResponse,
  errorResponse,
  handleCors,
} from "../_shared/supabase.ts";

interface RequestBody {
  customer_id: string;
  campaign_id: string;
  leads_count: number;
  action: "scrape" | "import" | "manual";
  bulk_job_id?: string;
  note?: string;
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Only service_role can call this
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.includes("service_role")) {
      return jsonResponse({ error: "Unauthorized" }, 403);
    }

    const body = (await req.json()) as RequestBody;
    const { customer_id, campaign_id, leads_count, action, bulk_job_id, note } =
      body;

    if (!customer_id || !campaign_id || !leads_count || !action) {
      return jsonResponse(
        { error: "Missing required fields: customer_id, campaign_id, leads_count, action" },
        400
      );
    }

    if (leads_count <= 0) {
      return jsonResponse({ error: "leads_count must be positive" }, 400);
    }

    const supabase = getSupabaseClient(req);

    // Log the usage using RPC (handles both logging and subscription update)
    const { data, error } = await supabase.rpc("log_lead_usage", {
      customer_id_param: customer_id,
      campaign_id_param: campaign_id,
      leads_count_param: leads_count,
      action_param: action,
      note_param: note || null,
    });

    if (error) {
      return errorResponse(error.message, 500);
    }

    // Update campaign lead count
    const { error: campaignError } = await supabase
      .from("campaigns")
      .update({
        leads_count: 0, // Will be recalculated by trigger or separate job
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign_id);

    if (campaignError) {
      console.error("Error updating campaign lead count:", campaignError);
      // Non-fatal, continue
    }

    return jsonResponse({
      success: true,
      usage_log_id: data?.[0],
      leads_logged: leads_count,
      action,
    });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
