/**
 * Utility functions
 */

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelativeTime(date: string | null): string {
  if (!date) return "—";
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function truncate(str: string | null, len: number): string {
  if (!str) return "—";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

export function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export const JOB_TYPE_LABELS: Record<string, string> = {
  scrape_maps: "Google Maps Scrape",
  find_emails: "Find Emails",
  find_decision_makers: "Find Decision Makers",
  anymail_emails: "Anymail Emails",
  clean_leads: "Clean & Validate",
  casualise_names: "Casualise Names",
  clean_spam: "Clean Spam",
  export: "Export",
  import: "Import",
};

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500",
  active: "bg-blue-500",
  completed: "bg-green-500",
  archived: "bg-gray-600",
  pending: "bg-yellow-500",
  running: "bg-blue-500",
  failed: "bg-red-500",
  cancelled: "bg-gray-500",
  queued: "bg-yellow-500",
  processing: "bg-blue-500",
  done: "bg-green-500",
  error: "bg-red-500",
};
