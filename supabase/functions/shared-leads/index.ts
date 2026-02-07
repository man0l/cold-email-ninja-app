/**
 * Edge Function: shared-leads
 * Serves lead data for a share token. Public shares need no auth;
 * private shares require a JWT matching the share's customer_id.
 *
 * POST body: { token, step?, format?, search? }
 *   - token:  share token (required)
 *   - step:   pipeline filter (default "all")
 *   - format: "json" (default) or "csv"
 *   - search: text search across company_name, email, decision_maker_name
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getSupabaseClient,
  getUserId,
  jsonResponse,
  errorResponse,
  handleCors,
  corsHeaders,
} from "../_shared/supabase.ts";

// Columns included in the CSV export
const CSV_COLUMNS = [
  "company_name", "company_name_casual", "company_website", "domain",
  "email", "personal_email", "phone",
  "decision_maker_name", "decision_maker_title", "decision_maker_email",
  "decision_maker_linkedin",
  "first_name", "last_name", "full_name", "linkedin", "title", "industry",
  "city", "state", "country", "address", "zip",
  "social_facebook", "social_instagram", "social_linkedin", "social_twitter",
  "ice_breaker", "ice_breaker_cleaned", "ice_status",
  "rating", "reviews", "category",
  "verification_status", "source",
];

function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const supabase = getSupabaseClient(req);

  try {
    const { token, step = "all", format = "json", search } = await req.json();
    if (!token) return errorResponse("token required");

    // ── Look up share (service_role bypasses RLS) ─────────────────────
    const { data: share, error: shareErr } = await supabase
      .from("lead_shares")
      .select("*")
      .eq("token", token)
      .single();

    if (shareErr || !share) return errorResponse("Share not found", 404);

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return errorResponse("Share link has expired", 410);
    }

    // ── Auth check for private shares ─────────────────────────────────
    if (!share.is_public) {
      let callerId: string | null = null;
      try {
        callerId = getUserId(req);
      } catch {
        // no valid JWT
      }
      if (!callerId || callerId !== share.customer_id) {
        return errorResponse("This is a private share. Sign in to view.", 403);
      }
    }

    // ── Fetch campaign name ───────────────────────────────────────────
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("name")
      .eq("id", share.campaign_id)
      .single();

    // ── Build lead query ──────────────────────────────────────────────
    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("campaign_id", share.campaign_id)
      .eq("customer_id", share.customer_id)
      .order("created_at", { ascending: true });

    // Pipeline step filters
    switch (step) {
      case "has_website":
        query = query.not("company_website", "is", null);
        break;
      case "validated":
        query = query.contains("enrichment_status", { website_validated: true });
        break;
      case "has_email":
        query = query.not("email", "is", null);
        break;
      case "has_dm":
        query = query.not("decision_maker_name", "is", null);
        break;
      case "has_dm_email":
        query = query.not("decision_maker_email", "is", null);
        break;
      case "casualised":
        query = query.not("company_name_casual", "is", null);
        break;
      case "has_icebreaker":
        query = query.not("ice_breaker", "is", null);
        break;
      // "all" — no additional filter
    }

    // Text search
    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,email.ilike.%${search}%,decision_maker_name.ilike.%${search}%`
      );
    }

    const { data: leads, error: leadsErr, count } = await query;
    if (leadsErr) return errorResponse(leadsErr.message);

    // ── CSV format ────────────────────────────────────────────────────
    if (format === "csv") {
      const csvLines: string[] = [CSV_COLUMNS.join(",")];
      for (const lead of leads || []) {
        const row = CSV_COLUMNS.map((col) =>
          escapeCsvValue((lead as Record<string, unknown>)[col])
        );
        csvLines.push(row.join(","));
      }
      const csv = csvLines.join("\n");
      const filename = `leads_${share.name || share.token}_${step}.csv`
        .replace(/[^a-zA-Z0-9._-]/g, "_");

      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}"`,
          ...corsHeaders(),
        },
      });
    }

    // ── JSON format (default) ─────────────────────────────────────────
    return jsonResponse({
      share: {
        name: share.name,
        campaign_name: campaign?.name || "Unknown",
        is_public: share.is_public,
        created_at: share.created_at,
      },
      leads: leads || [],
      total: count || 0,
    });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
