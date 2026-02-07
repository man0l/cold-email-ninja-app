/**
 * Edge Function: manage-shares
 * CRUD for lead share links. All operations require JWT auth.
 *
 * POST   - Create a new share link
 * GET    - List shares for a campaign
 * DELETE - Remove a share link
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getSupabaseClient,
  getUserId,
  jsonResponse,
  errorResponse,
  handleCors,
} from "../_shared/supabase.ts";

/** Generate a random 24-char hex token */
function generateToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const supabase = getSupabaseClient(req);

  let customerId: string;
  try {
    customerId = getUserId(req);
  } catch {
    return errorResponse("Unauthorized", 401);
  }

  try {
    // ── POST: Create share ────────────────────────────────────────────
    if (req.method === "POST") {
      const { campaign_id, name, is_public = false } = await req.json();
      if (!campaign_id) return errorResponse("campaign_id required");

      // Verify campaign belongs to this user
      const { data: campaign, error: campErr } = await supabase
        .from("campaigns")
        .select("id, name")
        .eq("id", campaign_id)
        .eq("customer_id", customerId)
        .single();
      if (campErr || !campaign) return errorResponse("Campaign not found", 404);

      const token = generateToken();

      const { data: share, error } = await supabase
        .from("lead_shares")
        .insert({
          customer_id: customerId,
          campaign_id,
          token,
          name: name || campaign.name,
          is_public,
        })
        .select()
        .single();

      if (error) return errorResponse(error.message);
      return jsonResponse({ ...share }, 201);
    }

    // ── GET: List shares ──────────────────────────────────────────────
    if (req.method === "GET") {
      const url = new URL(req.url);
      const campaignId = url.searchParams.get("campaign_id");

      let query = supabase
        .from("lead_shares")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (campaignId) query = query.eq("campaign_id", campaignId);

      const { data, error } = await query;
      if (error) return errorResponse(error.message);
      return jsonResponse(data || []);
    }

    // ── DELETE: Remove share ──────────────────────────────────────────
    if (req.method === "DELETE") {
      const { share_id } = await req.json();
      if (!share_id) return errorResponse("share_id required");

      const { error } = await supabase
        .from("lead_shares")
        .delete()
        .eq("id", share_id)
        .eq("customer_id", customerId);

      if (error) return errorResponse(error.message);
      return jsonResponse({ deleted: true });
    }

    return errorResponse("Method not allowed", 405);
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
