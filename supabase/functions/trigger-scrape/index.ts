/**
 * Edge Function: trigger-scrape
 * Creates a bulk_job for Google Maps scraping -> Contabo worker picks it up
 * Directive: scrape_google_maps.md
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
      keywords,
      locations_file,
      max_leads = 1000,
      concurrent = 20,
    } = await req.json();

    if (!campaign_id) return errorResponse("campaign_id required");
    if (!keywords?.length) return errorResponse("keywords required (array of strings)");

    // CHECK BILLING LIMITS BEFORE ALLOWING SCRAPE
    const { data: limitCheck, error: limitErr } = await supabase.rpc(
      "can_add_leads",
      {
        customer_id_param: customerId,
        leads_to_add_param: max_leads,
      }
    );

    if (limitErr || !limitCheck?.[0]?.allowed) {
      const reason = limitCheck?.[0]?.reason || "Unable to verify billing restrictions";
      return jsonResponse(
        {
          error: "Billing limit exceeded",
          reason,
          upgrade_required: true,
        },
        403
      );
    }

    // Verify campaign exists and belongs to this customer
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaign_id)
      .eq("customer_id", customerId)
      .single();
    if (campErr || !campaign) return errorResponse("Campaign not found", 404);

    // Create bulk job
    const { data: job, error } = await supabase
      .from("bulk_jobs")
      .insert({
        campaign_id,
        customer_id: customerId,
        type: "scrape_maps",
        config: {
          keywords,
          locations_file: locations_file || "data/us_locations.csv",
          max_leads,
          concurrent,
        },
      })
      .select()
      .single();

    if (error) return errorResponse(error.message);

    return jsonResponse({
      job,
      message: "Scrape job created. Contabo worker will pick it up.",
    }, 201);
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
