/**
 * Edge Function: campaigns
 * CRUD operations for campaigns table
 * Directive: create_campaign.md
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseClient, getUserId, jsonResponse, errorResponse, handleCors } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const supabase = getSupabaseClient(req);
  const customerId = getUserId(req);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    // GET - list or get single campaign
    if (req.method === "GET") {
      if (id) {
        const { data, error } = await supabase
          .from("campaigns")
          .select("*, leads:leads(count)")
          .eq("id", id)
          .eq("customer_id", customerId)
          .single();
        if (error) return errorResponse(error.message, 404);
        return jsonResponse(data);
      }

      const status = url.searchParams.get("status");
      let query = supabase
        .from("campaigns")
        .select("*, leads:leads(count)")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    // POST - create campaign
    if (req.method === "POST") {
      const body = await req.json();
      const { name, service_line, summarize_prompt, icebreaker_prompt } = body;

      if (!name || !service_line || !summarize_prompt || !icebreaker_prompt) {
        return errorResponse(
          "Required: name, service_line, summarize_prompt, icebreaker_prompt"
        );
      }

      const { data, error } = await supabase
        .from("campaigns")
        .insert({
          name,
          service_line,
          summarize_prompt,
          icebreaker_prompt,
          customer_id: customerId,
          status: body.status || "draft",
        })
        .select()
        .single();

      if (error) return errorResponse(error.message);
      return jsonResponse({ campaign: data }, 201);
    }

    // PATCH - update campaign
    if (req.method === "PATCH") {
      if (!id) return errorResponse("id parameter required");

      const body = await req.json();
      const { data, error } = await supabase
        .from("campaigns")
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("customer_id", customerId)
        .select()
        .single();

      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    // DELETE - delete campaign (cascades to leads)
    if (req.method === "DELETE") {
      if (!id) return errorResponse("id parameter required");

      const { error } = await supabase
        .from("campaigns")
        .delete()
        .eq("id", id)
        .eq("customer_id", customerId);

      if (error) return errorResponse(error.message);
      return jsonResponse({ deleted: true });
    }

    return errorResponse("Method not allowed", 405);
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
