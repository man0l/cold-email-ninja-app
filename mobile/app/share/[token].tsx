/**
 * Shared Leads Web View
 *
 * Renders a filterable lead table for a share token.
 * Publicly accessible for public shares; private shares require sign-in.
 * Optimised for web (Vercel) — never navigated to from mobile tabs.
 *
 * Features:
 *   - Pipeline step filter pills
 *   - Text search across company, email, DM name
 *   - Sortable columns
 *   - CSV download
 *   - Auth prompt for private shares
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

interface ShareMeta {
  name: string;
  campaign_name: string;
  is_public: boolean;
  created_at: string;
}

interface LeadRow {
  id: string;
  company_name: string | null;
  company_name_casual: string | null;
  company_website: string | null;
  email: string | null;
  phone: string | null;
  decision_maker_name: string | null;
  decision_maker_email: string | null;
  decision_maker_title: string | null;
  category: string | null;
  city: string | null;
  state: string | null;
  ice_status: string | null;
  enrichment_status: Record<string, unknown>;
  [key: string]: unknown;
}

type PipelineStep =
  | "all"
  | "has_website"
  | "validated"
  | "has_email"
  | "has_dm"
  | "has_dm_email"
  | "casualised"
  | "has_icebreaker";

const PIPELINE_STEPS: { key: PipelineStep; label: string }[] = [
  { key: "all", label: "All" },
  { key: "has_website", label: "Has Website" },
  { key: "validated", label: "Validated" },
  { key: "has_email", label: "Has Email" },
  { key: "has_dm", label: "Has DM" },
  { key: "has_dm_email", label: "Has DM Email" },
  { key: "casualised", label: "Casualised" },
  { key: "has_icebreaker", label: "Has Icebreaker" },
];

const TABLE_COLUMNS: { key: string; label: string; width: number }[] = [
  { key: "company_name", label: "Company", width: 200 },
  { key: "company_website", label: "Website", width: 180 },
  { key: "email", label: "Email", width: 220 },
  { key: "phone", label: "Phone", width: 140 },
  { key: "decision_maker_name", label: "DM Name", width: 160 },
  { key: "decision_maker_email", label: "DM Email", width: 220 },
  { key: "decision_maker_title", label: "DM Title", width: 150 },
  { key: "category", label: "Category", width: 160 },
  { key: "city", label: "City", width: 120 },
  { key: "state", label: "State", width: 80 },
];

// ═══════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════

export default function SharedLeadsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();

  // State
  const [shareMeta, setShareMeta] = useState<ShareMeta | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [step, setStep] = useState<PipelineStep>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [csvLoading, setCsvLoading] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Fetch leads ───────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setNeedsAuth(false);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "shared-leads",
        {
          body: {
            token,
            step,
            format: "json",
            search: debouncedSearch || undefined,
          },
        }
      );

      if (fnErr) {
        // Check for 403 (private share, not authed)
        const msg = fnErr.message || String(fnErr);
        if (msg.includes("403") || msg.includes("private")) {
          setNeedsAuth(true);
          setLoading(false);
          return;
        }
        throw new Error(msg);
      }

      // The Edge Function might return an error in the JSON body
      if (data?.error) {
        if (data.error.includes("private") || data.error.includes("Sign in")) {
          setNeedsAuth(true);
          setLoading(false);
          return;
        }
        throw new Error(data.error);
      }

      setShareMeta(data.share);
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [token, step, debouncedSearch, session]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // ── Sorted leads ──────────────────────────────────────────────────
  const sortedLeads = useMemo(() => {
    if (!sortCol) return leads;
    return [...leads].sort((a, b) => {
      const aVal = String(a[sortCol] ?? "");
      const bVal = String(b[sortCol] ?? "");
      const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: "base" });
      return sortAsc ? cmp : -cmp;
    });
  }, [leads, sortCol, sortAsc]);

  // ── Handle column sort ────────────────────────────────────────────
  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  // ── CSV download ──────────────────────────────────────────────────
  const handleCsvDownload = async () => {
    if (Platform.OS !== "web") return;
    setCsvLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "shared-leads",
        {
          body: { token, step, format: "csv", search: debouncedSearch || undefined },
        }
      );
      if (fnErr) throw fnErr;

      // data is the CSV string when format=csv
      const csvContent = typeof data === "string" ? data : JSON.stringify(data);
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads_${shareMeta?.name || token}_${step}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV download failed:", err);
    } finally {
      setCsvLoading(false);
    }
  };

  // ── Google sign-in for private shares ─────────────────────────────
  const handleSignIn = async () => {
    if (Platform.OS !== "web") return;
    const { data, error: authErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (authErr) console.error("Auth error:", authErr);
    if (data?.url) window.location.href = data.url;
  };

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  // Auth required screen
  if (needsAuth) {
    return (
      <View style={styles.container}>
        <View style={styles.authCard}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.authTitle}>Private Share</Text>
          <Text style={styles.authSubtitle}>
            This lead list is private. Sign in with the account that created it
            to view.
          </Text>
          <Pressable style={styles.signInButton} onPress={handleSignIn}>
            <Text style={styles.signInButtonText}>Sign in with Google</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Loading
  if (loading && !shareMeta) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading leads...</Text>
      </View>
    );
  }

  // Error
  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={fetchLeads}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>
            {shareMeta?.name || "Shared Leads"}
          </Text>
          <Text style={styles.headerSubtitle}>
            {shareMeta?.campaign_name} · {total} leads
            {shareMeta?.is_public ? " · Public" : " · Private"}
          </Text>
        </View>
        {Platform.OS === "web" && (
          <Pressable
            style={[styles.csvButton, csvLoading && styles.csvButtonDisabled]}
            onPress={handleCsvDownload}
            disabled={csvLoading}
          >
            <Text style={styles.csvButtonText}>
              {csvLoading ? "Exporting..." : "⬇ Download CSV"}
            </Text>
          </Pressable>
        )}
      </View>

      {/* ── Filter pills ────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {PIPELINE_STEPS.map((s) => (
          <Pressable
            key={s.key}
            style={[
              styles.filterPill,
              step === s.key && styles.filterPillActive,
            ]}
            onPress={() => setStep(s.key)}
          >
            <Text
              style={[
                styles.filterPillText,
                step === s.key && styles.filterPillTextActive,
              ]}
            >
              {s.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── Search ──────────────────────────────────────────────── */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by company, email, or DM name..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
        />
        {loading && <ActivityIndicator size="small" color="#3b82f6" />}
      </View>

      {/* ── Data table ──────────────────────────────────────────── */}
      <ScrollView style={styles.tableWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View>
            {/* Table header */}
            <View style={styles.tableHeaderRow}>
              <View style={[styles.tableCell, { width: 50 }]}>
                <Text style={styles.tableHeaderText}>#</Text>
              </View>
              {TABLE_COLUMNS.map((col) => (
                <Pressable
                  key={col.key}
                  style={[styles.tableCell, { width: col.width }]}
                  onPress={() => handleSort(col.key)}
                >
                  <Text style={styles.tableHeaderText}>
                    {col.label}
                    {sortCol === col.key ? (sortAsc ? " ↑" : " ↓") : ""}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Table rows */}
            {sortedLeads.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>
                  No leads match the current filter.
                </Text>
              </View>
            ) : (
              sortedLeads.map((lead, idx) => (
                <View
                  key={lead.id}
                  style={[
                    styles.tableRow,
                    idx % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd,
                  ]}
                >
                  <View style={[styles.tableCell, { width: 50 }]}>
                    <Text style={styles.tableCellText}>{idx + 1}</Text>
                  </View>
                  {TABLE_COLUMNS.map((col) => (
                    <View
                      key={col.key}
                      style={[styles.tableCell, { width: col.width }]}
                    >
                      <Text
                        style={styles.tableCellText}
                        numberOfLines={1}
                      >
                        {lead[col.key] != null ? String(lead[col.key]) : "—"}
                      </Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </ScrollView>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Showing {sortedLeads.length} of {total} leads · Filter: {PIPELINE_STEPS.find(s => s.key === step)?.label}
        </Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles (dark theme matching mobile app design tokens)
// ═══════════════════════════════════════════════════════════════════════

const styles = {
  // Layout
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  page: {
    flex: 1,
    backgroundColor: "#0f172a",
  },

  // Header
  header: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 20 : 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#f8fafc",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 2,
  },

  // CSV button
  csvButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  csvButtonDisabled: {
    opacity: 0.5,
  },
  csvButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600" as const,
  },

  // Filters
  filterBar: {
    maxHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  filterBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row" as const,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  filterPillActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  filterPillText: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "500" as const,
  },
  filterPillTextActive: {
    color: "#ffffff",
  },

  // Search
  searchRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#f8fafc",
    fontSize: 13,
  },

  // Table
  tableWrapper: {
    flex: 1,
  },
  tableHeaderRow: {
    flexDirection: "row" as const,
    backgroundColor: "#1e293b",
    borderBottomWidth: 2,
    borderBottomColor: "#334155",
  },
  tableRow: {
    flexDirection: "row" as const,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  tableRowEven: {
    backgroundColor: "#0f172a",
  },
  tableRowOdd: {
    backgroundColor: "#131c31",
  },
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center" as const,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  tableCellText: {
    fontSize: 12,
    color: "#e2e8f0",
  },
  emptyRow: {
    padding: 32,
    alignItems: "center" as const,
  },
  emptyText: {
    fontSize: 14,
    color: "#64748b",
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
  },
  footerText: {
    fontSize: 12,
    color: "#64748b",
  },

  // Auth / error / loading states
  loadingText: {
    color: "#94a3b8",
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    textAlign: "center" as const,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600" as const,
  },
  authCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 32,
    alignItems: "center" as const,
    maxWidth: 400,
    width: "100%" as const,
  },
  lockIcon: {
    fontSize: 40,
    marginBottom: 16,
  },
  authTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#f8fafc",
    marginBottom: 8,
  },
  authSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center" as const,
    marginBottom: 24,
    lineHeight: 20,
  },
  signInButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    width: "100%" as const,
    alignItems: "center" as const,
  },
  signInButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600" as const,
  },
} as const;
