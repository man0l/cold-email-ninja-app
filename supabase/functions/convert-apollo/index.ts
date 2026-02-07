/**
 * Edge Function: convert-apollo
 * Transform leads to Apollo-compatible format
 * Directive: convert_to_apollo.md
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
    const { campaign_id, lead_ids } = await req.json();
    if (!campaign_id) return errorResponse("campaign_id required");

    let query = supabase
      .from("leads")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("customer_id", customerId);

    if (lead_ids?.length) query = query.in("id", lead_ids);

    const { data: leads, error } = await query;
    if (error) return errorResponse(error.message);
    if (!leads?.length) return errorResponse("No leads found");

    // Convert to Apollo format
    const apolloLeads = leads.map((lead) => {
      // Use decision maker info if available, fallback to lead contact
      const firstName = lead.first_name ||
        (lead.decision_maker_name ? lead.decision_maker_name.split(" ")[0] : "");
      const lastName = lead.last_name ||
        (lead.decision_maker_name ? lead.decision_maker_name.split(" ").slice(1).join(" ") : "");
      const email = lead.decision_maker_email || lead.email || lead.personal_email || "";
      const title = lead.decision_maker_title || lead.title || "";
      const linkedin = lead.decision_maker_linkedin || lead.linkedin || "";

      // Normalize website
      let website = lead.company_website || lead.domain || "";
      website = website.replace(/^https?:\/\//, "");

      return {
        first_name: firstName,
        last_name: lastName,
        full_name: [firstName, lastName].filter(Boolean).join(" ") || lead.full_name || "",
        email,
        personal_email: lead.personal_email || "",
        company_name: lead.company_name || "",
        company_website: website,
        linkedin,
        title,
        industry: lead.industry || "",
        city: lead.city || "",
        state: lead.state || "",
        country: lead.country || "United States",
      };
    });

    return jsonResponse({
      leads: apolloLeads,
      count: apolloLeads.length,
      campaign_id,
    });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
