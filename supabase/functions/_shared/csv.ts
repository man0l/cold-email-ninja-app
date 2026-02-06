/**
 * Simple CSV parser for Edge Functions
 */

export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Normalize header to snake_case (handles CamelCase, spaces, dashes)
 */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Map Apollo export columns to our schema
 */
export const APOLLO_FIELD_MAP: Record<string, string> = {
  job_title: "title",
  person_linkedin: "linkedin",
  company_category: "industry",
  company_city: "city",
  company_state: "state",
  company_country: "country",
  linkedin_url: "linkedin",
  website: "company_website",
  company_domain: "domain",
};

export const LEAD_FIELDS = [
  "first_name", "last_name", "full_name", "company_name", "company_website",
  "email", "personal_email", "linkedin", "title", "industry",
  "city", "state", "country", "domain", "phone",
];

export function mapRow(row: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};

  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeHeader(key);
    const targetField = APOLLO_FIELD_MAP[normalized] || normalized;

    if (LEAD_FIELDS.includes(targetField) && value) {
      mapped[targetField] = value;
    }
  }

  // Generate full_name if missing
  if (!mapped.full_name && (mapped.first_name || mapped.last_name)) {
    mapped.full_name = [mapped.first_name, mapped.last_name]
      .filter(Boolean)
      .join(" ");
  }

  return mapped;
}
