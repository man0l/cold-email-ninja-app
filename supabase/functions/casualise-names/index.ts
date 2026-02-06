/**
 * Edge Function: casualise-names
 * Shortens company names to casual conversational form
 * Directive: casualise_company_name.md
 * Uses heuristic suffix removal + OpenAI fallback
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseClient, jsonResponse, errorResponse, handleCors } from "../_shared/supabase.ts";

// Legal suffixes to remove
const LEGAL_SUFFIXES = [
  "inc", "incorporated", "llc", "l.l.c", "ltd", "limited", "corp",
  "corporation", "co", "company", "pllc", "plc", "lp", "llp",
  "p.c", "p.a", "gmbh", "ag", "sa", "srl", "bv", "nv",
];

// Business descriptors to remove
const DESCRIPTORS = [
  "agency", "professional services", "services", "solutions", "technologies",
  "technology", "consulting", "consultants", "group", "partners",
  "associates", "enterprises", "international", "global", "digital",
  "marketing", "management", "advisors", "advisory", "studio",
  "labs", "lab", "systems", "network", "networks",
];

function casualiseName(name: string): string {
  if (!name) return name;

  let result = name.trim();

  // Remove legal suffixes (with optional trailing punctuation)
  for (const suffix of LEGAL_SUFFIXES) {
    const pattern = new RegExp(
      `[,\\s]+${suffix.replace(/\./g, "\\.")}[\\.\\s]*$`,
      "i"
    );
    result = result.replace(pattern, "").trim();
  }

  // Remove business descriptors from the end
  for (const desc of DESCRIPTORS) {
    const pattern = new RegExp(`\\s+${desc}\\s*$`, "i");
    result = result.replace(pattern, "").trim();
  }

  // If result is too short or empty, keep original
  if (result.length < 2) return name.trim();

  return result;
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const supabase = getSupabaseClient(req);

  try {
    const { campaign_id, lead_ids, use_openai = false } = await req.json();
    if (!campaign_id) return errorResponse("campaign_id required");

    // Fetch leads needing casualisation
    let query = supabase
      .from("leads")
      .select("id, company_name, company_name_casual")
      .eq("campaign_id", campaign_id)
      .not("company_name", "is", null)
      .is("company_name_casual", null);

    if (lead_ids?.length) {
      query = query.in("id", lead_ids);
    }

    const { data: leads, error } = await query.limit(500);
    if (error) return errorResponse(error.message);
    if (!leads?.length) {
      return jsonResponse({ processed: 0, message: "No leads need casualisation" });
    }

    let processed = 0;

    if (use_openai) {
      // Get OpenAI key from api_keys table
      const { data: keyRow } = await supabase
        .from("api_keys")
        .select("api_key")
        .eq("service", "openai")
        .single();

      if (!keyRow) return errorResponse("OpenAI API key not configured");

      // Process in chunks of 20 for OpenAI
      const chunkSize = 20;
      for (let i = 0; i < leads.length; i += chunkSize) {
        const chunk = leads.slice(i, i + chunkSize);
        const names = chunk.map((l) => l.company_name);

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${keyRow.api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Shorten each company name to its casual form. Remove legal suffixes (Inc, LLC, Ltd), business descriptors (Agency, Services, Solutions). Keep brand identity. Return JSON array of shortened names in same order.`,
              },
              {
                role: "user",
                content: JSON.stringify(names),
              },
            ],
            response_format: { type: "json_object" },
          }),
        });

        const result = await response.json();
        try {
          const content = JSON.parse(result.choices[0].message.content);
          const casualNames: string[] = content.names || content.result || Object.values(content);

          for (let j = 0; j < chunk.length && j < casualNames.length; j++) {
            await supabase
              .from("leads")
              .update({ company_name_casual: casualNames[j] })
              .eq("id", chunk[j].id);
            processed++;
          }
        } catch {
          // Fallback to heuristic for this chunk
          for (const lead of chunk) {
            const casual = casualiseName(lead.company_name);
            await supabase
              .from("leads")
              .update({ company_name_casual: casual })
              .eq("id", lead.id);
            processed++;
          }
        }
      }
    } else {
      // Heuristic-only mode (fast, no API cost)
      for (const lead of leads) {
        const casual = casualiseName(lead.company_name);
        await supabase
          .from("leads")
          .update({ company_name_casual: casual })
          .eq("id", lead.id);
        processed++;
      }
    }

    return jsonResponse({ processed, total: leads.length, campaign_id });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
