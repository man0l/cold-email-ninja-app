/**
 * Edge Function: trigger-clean
 * Creates a bulk_job for lead cleaning/validation -> Contabo worker
 * Directive: clean_leads.md
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
    const {
      campaign_id,
      categories = [],
      max_leads = 1000,
      workers = 10,
    } = await req.json();

    if (!campaign_id) return errorResponse("campaign_id required");

    // Verify campaign exists and belongs to this customer
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaign_id)
      .eq("customer_id", customerId)
      .single();
    if (campErr || !campaign) return errorResponse("Campaign not found", 404);

    // Count leads
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact" })
      .eq("campaign_id", campaign_id)
      .eq("customer_id", customerId)
      .not("company_website", "is", null);

    // Create bulk job
    const { data: job, error } = await supabase
      .from("bulk_jobs")
      .insert({
        campaign_id,
        customer_id: customerId,
        type: "clean_leads",
        config: {
          categories,
          max_leads,
          workers,
          total_with_website: count || 0,
        },
      })
      .select()
      .single();

    if (error) return errorResponse(error.message);

    return jsonResponse({
      job,
      leads_with_website: count || 0,
      message: "Clean job created. Contabo worker will validate websites.",
    }, 201);
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
