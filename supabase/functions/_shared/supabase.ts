/**
 * Shared Supabase client for Edge Functions
 * All operations target the 'ninja' schema to isolate from production public schema
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getSupabaseClient(req?: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  // SUPABASE_SERVICE_KEY is set directly in env_file; SUPABASE_SERVICE_ROLE_KEY
  // is set via $$ escaping in docker-compose and may be a literal string
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  return createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: "ninja" },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  };
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }
  return null;
}
