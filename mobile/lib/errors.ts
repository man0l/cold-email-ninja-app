/**
 * Human-friendly error messages mapped from backend error strings.
 * Learning #7: Error messages need context.
 */

const ERROR_MAP: Record<string, { message: string; fix: string }> = {
  "RapidAPI Maps Data API key not configured": {
    message: "Google Maps API key is missing",
    fix: "Go to Settings and add your RapidAPI Maps key",
  },
  "OpenWeb Ninja API key not configured": {
    message: "Email finder API key is missing",
    fix: "Go to Settings and add your OpenWeb Ninja key",
  },
  "OpenAI API key not configured": {
    message: "OpenAI key is missing",
    fix: "Go to Settings and add your OpenAI API key",
  },
  "Anymail Finder API key not configured": {
    message: "Anymail API key is missing",
    fix: "Go to Settings and add your Anymail Finder key",
  },
  "No locations loaded": {
    message: "Location data file not found on server",
    fix: "Contact support -- the us_locations.csv file needs to be uploaded to the worker",
  },
  "Campaign not found": {
    message: "This campaign no longer exists",
    fix: "Go back and refresh the campaigns list",
  },
};

export function humanizeError(error: string | null): {
  message: string;
  fix: string;
  raw: string;
} {
  if (!error) return { message: "Unknown error", fix: "Try again", raw: "" };

  for (const [pattern, info] of Object.entries(ERROR_MAP)) {
    if (error.includes(pattern)) {
      return { ...info, raw: error };
    }
  }

  return {
    message: error.length > 100 ? error.slice(0, 100) + "..." : error,
    fix: "Try again or check the job logs",
    raw: error,
  };
}

/**
 * API key requirements per pipeline step.
 * Learning #1: Show which keys are needed for which steps.
 */
export const STEP_REQUIREMENTS: Record<
  string,
  { label: string; keys: string[]; tier: "instant" | "fast" | "slow" }
> = {
  scrape_maps: {
    label: "Scrape Google Maps",
    keys: ["rapidapi_maps"],
    tier: "slow",
  },
  find_emails: {
    label: "Find Emails",
    keys: ["openwebninja"],
    tier: "fast",
  },
  find_decision_makers: {
    label: "Find Decision Makers",
    keys: ["openai"],
    tier: "slow",
  },
  anymail_emails: {
    label: "Find DM Emails",
    keys: ["anymail"],
    tier: "fast",
  },
  clean_leads: {
    label: "Clean & Validate",
    keys: [],
    tier: "fast",
  },
  casualise_names: {
    label: "Casualise Names",
    keys: [],
    tier: "instant",
  },
  clean_spam: {
    label: "Clean Spam",
    keys: ["openai"],
    tier: "instant",
  },
};

export const API_SERVICE_LABELS: Record<string, string> = {
  rapidapi_maps: "RapidAPI Maps",
  openwebninja: "OpenWeb Ninja",
  openai: "OpenAI",
  anymail: "Anymail Finder",
  dataforseo: "DataForSEO",
  rapidapi_linkedin: "RapidAPI LinkedIn",
};
