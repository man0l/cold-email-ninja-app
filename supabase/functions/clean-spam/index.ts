/**
 * Edge Function: clean-spam
 * Remove spam trigger keywords from ice_breaker column
 * Directive: spam_keywords_cleanup.md
 * Supports: keyword removal only or OpenAI rewrite
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseClient, getUserId, jsonResponse, errorResponse, handleCors } from "../_shared/supabase.ts";

// Top spam trigger keywords (subset - full list has 400+)
const SPAM_KEYWORDS = [
  "act now", "action required", "apply now", "as seen on", "best price",
  "buy now", "call now", "cash bonus", "cheap", "click here",
  "congratulations", "deal", "discount", "don't delete", "don't miss out",
  "double your", "earn extra", "exclusive deal", "expires", "extra cash",
  "fast cash", "free", "free access", "free gift", "free trial",
  "get it now", "get started now", "great offer", "guarantee",
  "hurry", "important information", "incredible deal", "instant",
  "limited time", "lowest price", "luxury", "make money",
  "million dollars", "miracle", "money back", "new customers only",
  "no catch", "no cost", "no fees", "no obligation",
  "no strings attached", "now only", "offer expires", "once in a lifetime",
  "one time", "order now", "please read", "prize", "promise",
  "pure profit", "risk-free", "save big", "save up to",
  "special promotion", "take action", "this isn't spam",
  "time limited", "triple your", "unlimited", "urgent",
  "while supplies last", "winner", "you have been selected",
  "you're a winner", "zero risk",
];

function containsSpamKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return SPAM_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
}

function removeSpamKeywords(text: string): string {
  let result = text;
  for (const kw of SPAM_KEYWORDS) {
    const pattern = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    result = result.replace(pattern, "").trim();
  }
  // Clean up double spaces and leading/trailing punctuation
  return result.replace(/\s{2,}/g, " ").replace(/^[,.\s]+|[,.\s]+$/g, "").trim();
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
    const { campaign_id, lead_ids, use_openai = false } = await req.json();
    if (!campaign_id) return errorResponse("campaign_id required");

    // Fetch leads with ice_breaker content (scoped to customer)
    let query = supabase
      .from("leads")
      .select("id, ice_breaker")
      .eq("campaign_id", campaign_id)
      .eq("customer_id", customerId)
      .not("ice_breaker", "is", null)
      .is("ice_breaker_cleaned", null);

    if (lead_ids?.length) query = query.in("id", lead_ids);

    const { data: leads, error } = await query.limit(500);
    if (error) return errorResponse(error.message);
    if (!leads?.length) {
      return jsonResponse({ processed: 0, message: "No leads need spam cleaning" });
    }

    let processed = 0;
    let spamFound = 0;

    for (const lead of leads) {
      const found = containsSpamKeywords(lead.ice_breaker);
      if (found.length === 0) {
        // No spam - copy as-is
        await supabase
          .from("leads")
          .update({ ice_breaker_cleaned: lead.ice_breaker })
          .eq("id", lead.id);
        processed++;
        continue;
      }

      spamFound++;

      if (use_openai) {
        // Get OpenAI key for this customer
        const { data: keyRow } = await supabase
          .from("api_keys")
          .select("api_key")
          .eq("service", "openai")
          .eq("customer_id", customerId)
          .single();

        if (keyRow) {
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
                  content: `Rewrite this cold email icebreaker to remove spam trigger words while preserving meaning and tone. Keep it natural and conversational. Return only the rewritten text.`,
                },
                { role: "user", content: lead.ice_breaker },
              ],
            }),
          });

          const result = await response.json();
          const cleaned = result.choices?.[0]?.message?.content || removeSpamKeywords(lead.ice_breaker);

          await supabase
            .from("leads")
            .update({ ice_breaker_cleaned: cleaned })
            .eq("id", lead.id);
        } else {
          // Fallback to keyword removal
          const cleaned = removeSpamKeywords(lead.ice_breaker);
          await supabase
            .from("leads")
            .update({ ice_breaker_cleaned: cleaned })
            .eq("id", lead.id);
        }
      } else {
        // Keyword removal only
        const cleaned = removeSpamKeywords(lead.ice_breaker);
        await supabase
          .from("leads")
          .update({ ice_breaker_cleaned: cleaned })
          .eq("id", lead.id);
      }
      processed++;
    }

    return jsonResponse({
      processed,
      spam_found: spamFound,
      total: leads.length,
      campaign_id,
    });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
