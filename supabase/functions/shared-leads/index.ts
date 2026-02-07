/**
 * Edge Function: shared-leads
 * Serves lead data for a share token. Public shares need no auth;
 * private shares require a JWT matching the share's customer_id.
 *
 * POST body: { token, steps?, step?, format?, search?, offset?, limit?, action? }
 *   - token:   share token (required)
 *   - steps:   array of pipeline filters applied additively (AND logic)
 *   - step:    single pipeline filter (backward compat — converted to steps)
 *   - format:  "json" (default) or "csv"
 *   - search:  text search across company_name, email, decision_maker_name
 *   - offset:  pagination offset (default 0)
 *   - limit:   pagination limit (default 100, max 500)
 *   - action:  "stats" returns pipeline counts without lead data
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

// ── Types ───────────────────────────────────────────────────────────────

type PipelineStep =
  | "has_website"
  | "validated"
  | "has_email"
  | "has_dm"
  | "has_dm_email"
  | "casualised"
  | "has_icebreaker";

// ── CSV helpers ─────────────────────────────────────────────────────────

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

// ── Apply pipeline step filters (additive — AND logic) ──────────────────

function applyStepFilters(
  query: ReturnType<ReturnType<typeof getSupabaseClient>["from"]>,
  steps: PipelineStep[],
) {
  for (const s of steps) {
    switch (s) {
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
    }
  }
  return query;
}

// ── Main handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const supabase = getSupabaseClient(req);

  try {
    const body = await req.json();
    const {
      token,
      step,               // backward compat: single step string
      steps: rawSteps,     // new: array of step strings
      format = "json",
      search,
      offset = 0,
      limit: rawLimit = 100,
      action,
    } = body;

    if (!token) return errorResponse("token required");

    // Normalize limit (max 500 for json, unlimited for csv)
    const limit = format === "csv" ? 50_000 : Math.min(Number(rawLimit) || 100, 500);

    // Normalize steps: prefer `steps` array, fall back to single `step`
    let steps: PipelineStep[] = [];
    if (Array.isArray(rawSteps) && rawSteps.length > 0) {
      steps = rawSteps.filter((s: string) => s !== "all") as PipelineStep[];
    } else if (step && step !== "all") {
      steps = [step as PipelineStep];
    }

    // ── Look up share (service_role bypasses RLS) ────────────────────
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

    // ── Auth check for private shares ────────────────────────────────
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

    // ── Fetch campaign name ──────────────────────────────────────────
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("name")
      .eq("id", share.campaign_id)
      .single();

    const shareMeta = {
      name: share.name,
      campaign_name: campaign?.name || "Unknown",
      is_public: share.is_public,
      created_at: share.created_at,
    };

    // ══════════════════════════════════════════════════════════════════
    // ACTION: stats — return pipeline counts without fetching leads
    // ══════════════════════════════════════════════════════════════════
    if (action === "stats") {
      const base = () =>
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", share.campaign_id)
          .eq("customer_id", share.customer_id);

      // Fire all counts in parallel
      const [
        totalRes,
        withWebsiteRes,
        validatedRes,
        withEmailRes,
        withDMRes,
        withDMEmailRes,
        casualisedRes,
        withIcebreakerRes,
      ] = await Promise.all([
        base(),
        base().not("company_website", "is", null),
        base().contains("enrichment_status", { website_validated: true }),
        base().not("email", "is", null),
        base().not("decision_maker_name", "is", null),
        base().not("decision_maker_email", "is", null),
        base().not("company_name_casual", "is", null),
        base().not("ice_breaker", "is", null),
      ]);

      return jsonResponse({
        share: shareMeta,
        stats: {
          total: totalRes.count || 0,
          has_website: withWebsiteRes.count || 0,
          validated: validatedRes.count || 0,
          has_email: withEmailRes.count || 0,
          has_dm: withDMRes.count || 0,
          has_dm_email: withDMEmailRes.count || 0,
          casualised: casualisedRes.count || 0,
          has_icebreaker: withIcebreakerRes.count || 0,
        },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION: default — fetch leads with filters + pagination
    // ══════════════════════════════════════════════════════════════════

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("campaign_id", share.campaign_id)
      .eq("customer_id", share.customer_id)
      .order("created_at", { ascending: true });

    // Apply additive pipeline filters
    query = applyStepFilters(query, steps);

    // Text search
    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,email.ilike.%${search}%,decision_maker_name.ilike.%${search}%`
      );
    }

    // Pagination (for json) — CSV fetches all
    if (format !== "csv") {
      query = query.range(Number(offset), Number(offset) + limit - 1);
    }

    const { data: leads, error: leadsErr, count } = await query;
    if (leadsErr) return errorResponse(leadsErr.message);

    // ── CSV format ───────────────────────────────────────────────────
    if (format === "csv") {
      const csvLines: string[] = [CSV_COLUMNS.join(",")];
      for (const lead of leads || []) {
        const row = CSV_COLUMNS.map((col) =>
          escapeCsvValue((lead as Record<string, unknown>)[col])
        );
        csvLines.push(row.join(","));
      }
      const csv = csvLines.join("\n");
      const stepLabel = steps.length > 0 ? steps.join("_") : "all";
      const filename = `leads_${share.name || share.token}_${stepLabel}.csv`
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

    // ── JSON format (default) ────────────────────────────────────────
    return jsonResponse({
      share: shareMeta,
      leads: leads || [],
      total: count || 0,
      offset: Number(offset),
      limit,
    });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
