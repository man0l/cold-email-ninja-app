/**
 * Edge Function: billing/check-limits
 * Checks if user can add N leads to their account
 * Called BEFORE creating scrape/import jobs
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getSupabaseClient,
  getUserId,
  getUserClient,
  jsonResponse,
  errorResponse,
  handleCors,
} from "../_shared/supabase.ts";

interface RequestBody {
  leads_to_add: number;
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const userId = getUserId(req);
    const supabase = getUserClient(req);

    const { leads_to_add } = (await req.json()) as RequestBody;

    if (!leads_to_add || leads_to_add <= 0) {
      return jsonResponse(
        { error: "leads_to_add must be a positive number" },
        400
      );
    }

    // Call RPC to check limits
    const { data, error } = await supabase.rpc("can_add_leads", {
      customer_id_param: userId,
      leads_to_add_param: leads_to_add,
    });

    if (error) {
      return errorResponse(error.message, 500);
    }

    if (!data || data.length === 0) {
      return jsonResponse(
        {
          allowed: false,
          reason: "Unable to verify subscription status",
        },
        403
      );
    }

    const result = data[0];

    if (!result.allowed) {
      return jsonResponse(
        {
          allowed: false,
          reason: result.reason,
        },
        403
      );
    }

    // Also get current info for context
    const { data: infoData } = await supabase.rpc(
      "get_user_subscription_info",
      { customer_id_param: userId }
    );

    const info = infoData?.[0];

    return jsonResponse({
      allowed: true,
      reason: "OK",
      tier: info?.tier,
      leads_remaining:
        info?.monthly_leads_limit === -1 ? -1 : info?.leads_remaining,
      percent_used:
        info?.monthly_leads_limit === -1
          ? 0
          : Math.round(
              ((info?.leads_used_this_month || 0) /
                info?.monthly_leads_limit) *
              100
            ),
    });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
