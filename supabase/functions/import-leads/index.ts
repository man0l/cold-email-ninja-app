/**
 * Edge Function: import-leads
 * Parse CSV upload and insert leads into a campaign
 * Handles both CamelCase and snake_case columns (Apollo exports)
 * Directive: export_to_sheets.md (reverse), create_campaign.md
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseClient, getUserId, jsonResponse, errorResponse, handleCors } from "../_shared/supabase.ts";
import { parseCSV, mapRow } from "../_shared/csv.ts";

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const supabase = getSupabaseClient(req);
  const customerId = getUserId(req);

  try {
    const formData = await req.formData();
    const campaignId = formData.get("campaign_id") as string;
    const file = formData.get("file") as File;
    const source = (formData.get("source") as string) || "csv_import";

    if (!campaignId) return errorResponse("campaign_id required");
    if (!file) return errorResponse("file required (CSV)");

    // Verify campaign exists and belongs to this customer
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("customer_id", customerId)
      .single();
    if (campErr || !campaign) return errorResponse("Campaign not found", 404);

    // Parse CSV
    const text = await file.text();
    const { headers, rows } = parseCSV(text);

    if (rows.length === 0) return errorResponse("CSV is empty");

    // Map rows to lead schema
    const leads = rows.map((row) => {
      const mapped = mapRow(row);
      return {
        campaign_id: campaignId,
        customer_id: customerId,
        ...mapped,
        source,
        raw: row, // preserve original data
        ice_status: "pending",
      };
    });

    // Insert in batches of 500
    let inserted = 0;
    const batchSize = 500;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from("leads")
        .upsert(batch, {
          onConflict: "campaign_id,email",
          ignoreDuplicates: true,
        })
        .select("id");

      if (error) {
        console.error(`Batch ${i} error:`, error);
        // Continue with remaining batches
      } else {
        inserted += data?.length || 0;
      }
    }

    return jsonResponse({
      imported: inserted,
      total_rows: rows.length,
      headers,
      campaign_id: campaignId,
    }, 201);
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
