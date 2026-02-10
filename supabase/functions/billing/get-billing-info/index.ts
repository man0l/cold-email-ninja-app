/**
 * Edge Function: billing/get-billing-info
 * Returns user's current subscription, plan, and usage
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

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    if (req.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const userId = getUserId(req);
    const supabase = getUserClient(req);

    // Get subscription info via RPC
    const { data, error } = await supabase.rpc(
      "get_user_subscription_info",
      { customer_id_param: userId }
    );

    if (error) {
      return errorResponse(error.message, 500);
    }

    if (!data || data.length === 0) {
      return errorResponse("No subscription found", 404);
    }

    const info = data[0];

    // Calculate percentage used
    const percentUsed =
      info.monthly_leads_limit === -1
        ? 0
        : Math.round(
            ((info.leads_used_this_month || 0) / info.monthly_leads_limit) * 100
          );

    return jsonResponse({
      subscription_id: info.subscription_id,
      plan_name: info.plan_name,
      tier: info.tier,
      is_free_tier: info.is_free_tier,
      monthly_leads_limit: info.monthly_leads_limit,
      leads_used_this_month: info.leads_used_this_month || 0,
      leads_remaining:
        info.monthly_leads_limit === -1
          ? -1
          : Math.max(0, info.leads_remaining),
      percent_used: percentUsed,
      billing_period_end: info.billing_period_end,
      status: info.status,
      stripe_subscription_id: info.stripe_subscription_id,
    });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
