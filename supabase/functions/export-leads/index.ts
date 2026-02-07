/**
 * Edge Function: export-leads
 * Export leads as CSV or Apollo-formatted CSV
 * Directives: convert_to_apollo.md, export_to_sheets.md
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseClient, getUserId, jsonResponse, errorResponse, handleCors, corsHeaders } from "../_shared/supabase.ts";

const APOLLO_COLUMNS = [
  "first_name", "last_name", "full_name", "email", "personal_email",
  "company_name", "company_website", "linkedin", "title", "industry",
  "city", "state", "country",
];

const ALL_COLUMNS = [
  ...APOLLO_COLUMNS,
  "phone", "domain", "company_name_casual",
  "decision_maker_name", "decision_maker_title", "decision_maker_email",
  "decision_maker_linkedin",
  "social_facebook", "social_instagram", "social_linkedin", "social_twitter",
  "ice_breaker", "ice_status", "verification_status",
  "rating", "reviews", "category", "address", "zip",
];

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const supabase = getSupabaseClient(req);
  const customerId = getUserId(req);

  try {
    const { campaign_id, format = "csv", filters = {} } = await req.json();
    if (!campaign_id) return errorResponse("campaign_id required");

    // Fetch leads (scoped to customer)
    let query = supabase
      .from("leads")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });

    if (filters.ice_status) query = query.eq("ice_status", filters.ice_status);
    if (filters.verification_status) {
      query = query.eq("verification_status", filters.verification_status);
    }
    if (filters.has_email) query = query.not("email", "is", null);

    const { data: leads, error } = await query;
    if (error) return errorResponse(error.message);
    if (!leads?.length) return errorResponse("No leads found");

    // Select columns based on format
    const columns = format === "apollo" ? APOLLO_COLUMNS : ALL_COLUMNS;

    // Build CSV
    const csvLines: string[] = [columns.join(",")];
    for (const lead of leads) {
      const row = columns.map((col) => {
        const val = (lead as Record<string, unknown>)[col];
        if (val === null || val === undefined) return "";
        const str = String(val);
        // Escape quotes and wrap if contains comma/quote/newline
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvLines.push(row.join(","));
    }

    const csv = csvLines.join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="leads_${campaign_id}_${format}.csv"`,
        ...corsHeaders(),
      },
    });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
