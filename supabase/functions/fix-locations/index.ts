/**
 * Edge Function: fix-locations
 * Normalize scattered location data in leads
 * Directive: fix_location_columns.md
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseClient, getUserId, jsonResponse, errorResponse, handleCors } from "../_shared/supabase.ts";

// US state abbreviation mapping
const STATE_MAP: Record<string, string> = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
  "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
  "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
  "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
  "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
  "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
  "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
  "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
  "vermont": "VT", "virginia": "VA", "washington": "WA",
  "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
};

function normalizeState(state: string | null): string | null {
  if (!state) return null;
  const trimmed = state.trim();
  // Already an abbreviation
  if (trimmed.length === 2 && trimmed === trimmed.toUpperCase()) return trimmed;
  // Full name
  const abbrev = STATE_MAP[trimmed.toLowerCase()];
  return abbrev || trimmed;
}

function extractZip(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(/\b(\d{5}(?:-\d{4})?)\b/);
  return match ? match[1] : null;
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const supabase = getSupabaseClient(req);
  const customerId = getUserId(req);

  try {
    const { campaign_id, lead_ids } = await req.json();
    if (!campaign_id) return errorResponse("campaign_id required");

    let query = supabase
      .from("leads")
      .select("id, city, state, zip, country, address, raw")
      .eq("campaign_id", campaign_id)
      .eq("customer_id", customerId);

    if (lead_ids?.length) query = query.in("id", lead_ids);

    const { data: leads, error } = await query.limit(1000);
    if (error) return errorResponse(error.message);
    if (!leads?.length) {
      return jsonResponse({ processed: 0, message: "No leads found" });
    }

    let processed = 0;
    for (const lead of leads) {
      const updates: Record<string, string | null> = {};

      // Normalize state
      const normalizedState = normalizeState(lead.state);
      if (normalizedState !== lead.state) {
        updates.state = normalizedState;
      }

      // Try to extract zip from address if missing
      if (!lead.zip && lead.address) {
        const zip = extractZip(lead.address);
        if (zip) updates.zip = zip;
      }

      // Normalize country
      if (lead.country) {
        const lower = lead.country.toLowerCase().trim();
        if (lower === "us" || lower === "usa" || lower === "united states of america") {
          updates.country = "United States";
        }
      }

      // Check raw data for missing fields
      if (lead.raw && typeof lead.raw === "object") {
        const raw = lead.raw as Record<string, string>;
        if (!lead.city && (raw["Company City"] || raw["city"])) {
          updates.city = raw["Company City"] || raw["city"];
        }
        if (!lead.state && (raw["Company State"] || raw["state"])) {
          updates.state = normalizeState(raw["Company State"] || raw["state"]);
        }
        if (!lead.zip && (raw["Company Postal Code"] || raw["zip"])) {
          updates.zip = raw["Company Postal Code"] || raw["zip"];
        }
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("leads")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", lead.id);
        processed++;
      }
    }

    return jsonResponse({ processed, total: leads.length, campaign_id });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
