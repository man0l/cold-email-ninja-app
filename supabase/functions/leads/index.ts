/**
 * Edge Function: leads
 * Bulk query, update, and delete leads
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseClient, jsonResponse, errorResponse, handleCors } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const supabase = getSupabaseClient(req);
  const url = new URL(req.url);

  try {
    // GET - list leads with pagination and filters
    if (req.method === "GET") {
      const id = url.searchParams.get("id");
      if (id) {
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .eq("id", id)
          .single();
        if (error) return errorResponse(error.message, 404);
        return jsonResponse(data);
      }

      const campaignId = url.searchParams.get("campaign_id");
      const iceStatus = url.searchParams.get("ice_status");
      const search = url.searchParams.get("search");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const limit = parseInt(url.searchParams.get("limit") || "50");

      let query = supabase
        .from("leads")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (campaignId) query = query.eq("campaign_id", campaignId);
      if (iceStatus) query = query.eq("ice_status", iceStatus);
      if (search) {
        query = query.or(
          `company_name.ilike.%${search}%,email.ilike.%${search}%,full_name.ilike.%${search}%`
        );
      }

      const { data, error, count } = await query;
      if (error) return errorResponse(error.message);
      return jsonResponse({ leads: data, total: count, offset, limit });
    }

    // PATCH - bulk update leads
    if (req.method === "PATCH") {
      const { ids, updates } = await req.json();
      if (!ids?.length || !updates) {
        return errorResponse("Required: ids (array), updates (object)");
      }

      const { data, error } = await supabase
        .from("leads")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .in("id", ids)
        .select();

      if (error) return errorResponse(error.message);
      return jsonResponse({ updated: data?.length || 0 });
    }

    // DELETE - bulk delete leads
    if (req.method === "DELETE") {
      const { ids } = await req.json();
      if (!ids?.length) return errorResponse("Required: ids (array)");

      const { error } = await supabase.from("leads").delete().in("id", ids);
      if (error) return errorResponse(error.message);
      return jsonResponse({ deleted: ids.length });
    }

    return errorResponse("Method not allowed", 405);
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
