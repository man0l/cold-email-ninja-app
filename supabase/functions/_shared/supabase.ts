/**
 * Shared Supabase client for Edge Functions
 * All operations target the 'ninja' schema to isolate from production public schema
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Create a service-role Supabase client (bypasses RLS).
 * Use for admin operations where customer_id is set explicitly.
 */
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

/**
 * Extract the authenticated user's ID from the JWT in the Authorization header.
 * The JWT has already been verified by the Supabase gateway (Kong) so we only
 * need to decode the payload — no cryptographic verification required.
 */
export function getUserId(req: Request): string {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token || !token.includes(".")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const payload = JSON.parse(atob(token.split(".")[1]));
  return payload.sub;
}

/**
 * Create a Supabase client using the caller's JWT (RLS applies).
 * Useful for read queries where RLS should filter by customer_id automatically.
 */
export function getUserClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("ANON_KEY")!;
  const authHeader = req.headers.get("Authorization")!;
  return createClient(supabaseUrl, anonKey, {
    db: { schema: "ninja" },
    global: { headers: { Authorization: authHeader } },
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
