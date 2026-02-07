/**
 * Shared Leads Web View
 *
 * Renders a filterable, paginated lead table for a share token.
 * Publicly accessible for public shares; private shares require sign-in.
 * Optimised for web (Vercel) — never navigated to from mobile tabs.
 *
 * Features:
 *   - Additive pipeline filter pills (AND logic — each builds on the others)
 *   - Pipeline statistics bar with counts and percentages
 *   - Server-side paginated table (handles tens of thousands of leads)
 *   - Text search across company, email, DM name
 *   - Sortable columns
 *   - CSV download
 *   - Auth prompt for private shares
 */
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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

interface PipelineStats {
  total: number;
  has_website: number;
  validated: number;
  has_email: number;
  has_dm: number;
  has_dm_email: number;
  casualised: number;
  has_icebreaker: number;
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
  | "has_website"
  | "validated"
  | "has_email"
  | "has_dm"
  | "has_dm_email"
  | "casualised"
  | "has_icebreaker";

const PIPELINE_STEPS: { key: PipelineStep; label: string; color: string }[] = [
  { key: "has_website", label: "Has Website", color: "#3b82f6" },
  { key: "validated", label: "Validated", color: "#8b5cf6" },
  { key: "has_email", label: "Has Email", color: "#06b6d4" },
  { key: "has_dm", label: "Has DM", color: "#f59e0b" },
  { key: "has_dm_email", label: "Has DM Email", color: "#10b981" },
  { key: "casualised", label: "Casualised", color: "#ec4899" },
  { key: "has_icebreaker", label: "Has Icebreaker", color: "#f97316" },
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

const PAGE_SIZE = 100;

// ═══════════════════════════════════════════════════════════════════════
// Stats Bar Component
// ═══════════════════════════════════════════════════════════════════════

function StatsBar({
  stats,
  activeSteps,
  onToggleStep,
}: {
  stats: PipelineStats;
  activeSteps: Set<PipelineStep>;
  onToggleStep: (step: PipelineStep) => void;
}) {
  if (stats.total === 0) return null;

  return (
    <View style={styles.statsContainer}>
      {/* Total count */}
      <View style={styles.statsTotalRow}>
        <Text style={styles.statsTotalLabel}>Total Leads</Text>
        <Text style={styles.statsTotalValue}>
          {stats.total.toLocaleString()}
        </Text>
      </View>

      {/* Pipeline step stats — each is clickable to toggle filter */}
      <View style={styles.statsGrid}>
        {PIPELINE_STEPS.map((step) => {
          const count = stats[step.key] ?? 0;
          const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
          const isActive = activeSteps.has(step.key);

          return (
            <Pressable
              key={step.key}
              style={[
                styles.statCard,
                isActive && { borderColor: step.color, borderWidth: 2 },
              ]}
              onPress={() => onToggleStep(step.key)}
            >
              {/* Progress bar background */}
              <View style={styles.statBarBg}>
                <View
                  style={[
                    styles.statBarFill,
                    { width: `${pct}%` as unknown as number, backgroundColor: step.color },
                  ]}
                />
              </View>
              <View style={styles.statCardContent}>
                <Text style={styles.statLabel} numberOfLines={1}>
                  {step.label}
                </Text>
                <View style={styles.statValues}>
                  <Text style={[styles.statCount, { color: step.color }]}>
                    {count.toLocaleString()}
                  </Text>
                  <Text style={styles.statPct}>{pct}%</Text>
                </View>
              </View>
              {isActive && (
                <View style={[styles.statActiveDot, { backgroundColor: step.color }]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pagination Component
// ═══════════════════════════════════════════════════════════════════════

function Pagination({
  total,
  offset,
  limit,
  onPageChange,
  loading,
}: {
  total: number;
  offset: number;
  limit: number;
  onPageChange: (newOffset: number) => void;
  loading: boolean;
}) {
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (totalPages <= 1) return null;

  // Build page numbers to show (max 7 visible)
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <View style={styles.paginationRow}>
      {/* Prev */}
      <Pressable
        style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
        onPress={() => onPageChange(Math.max(0, offset - limit))}
        disabled={currentPage === 1 || loading}
      >
        <Text style={styles.pageBtnText}>Prev</Text>
      </Pressable>

      {/* Page numbers */}
      {pages.map((p, idx) =>
        p === "..." ? (
          <Text key={`dots-${idx}`} style={styles.pageDots}>
            ...
          </Text>
        ) : (
          <Pressable
            key={p}
            style={[styles.pageBtn, p === currentPage && styles.pageBtnActive]}
            onPress={() => onPageChange((p - 1) * limit)}
            disabled={loading}
          >
            <Text
              style={[
                styles.pageBtnText,
                p === currentPage && styles.pageBtnTextActive,
              ]}
            >
              {p}
            </Text>
          </Pressable>
        )
      )}

      {/* Next */}
      <Pressable
        style={[
          styles.pageBtn,
          currentPage === totalPages && styles.pageBtnDisabled,
        ]}
        onPress={() =>
          onPageChange(Math.min((totalPages - 1) * limit, offset + limit))
        }
        disabled={currentPage === totalPages || loading}
      >
        <Text style={styles.pageBtnText}>Next</Text>
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════

export default function SharedLeadsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();

  // State
  const [shareMeta, setShareMeta] = useState<ShareMeta | null>(null);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [activeSteps, setActiveSteps] = useState<Set<PipelineStep>>(new Set());
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [csvLoading, setCsvLoading] = useState(false);

  const tableRef = useRef<ScrollView>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0); // Reset to first page on search change
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to first page when filters change
  useEffect(() => {
    setOffset(0);
  }, [activeSteps]);

  // ── Toggle a pipeline filter step ────────────────────────────────
  const toggleStep = useCallback((step: PipelineStep) => {
    setActiveSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) {
        next.delete(step);
      } else {
        next.add(step);
      }
      return next;
    });
  }, []);

  // ── Fetch pipeline stats ─────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!token) return;
    setStatsLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "shared-leads",
        {
          body: { token, action: "stats" },
        }
      );
      if (fnErr) {
        const msg = fnErr.message || String(fnErr);
        if (msg.includes("403") || msg.includes("private")) {
          setNeedsAuth(true);
          return;
        }
        // Non-fatal: stats are supplementary
        console.warn("Stats fetch failed:", msg);
        return;
      }
      if (data?.error) {
        if (data.error.includes("private") || data.error.includes("Sign in")) {
          setNeedsAuth(true);
          return;
        }
        console.warn("Stats error:", data.error);
        return;
      }
      setShareMeta(data.share);
      setStats(data.stats);
    } catch (err) {
      console.warn("Stats fetch error:", err);
    } finally {
      setStatsLoading(false);
    }
  }, [token, session]);

  // ── Fetch leads (paginated) ──────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setNeedsAuth(false);

    try {
      const steps = Array.from(activeSteps);
      const { data, error: fnErr } = await supabase.functions.invoke(
        "shared-leads",
        {
          body: {
            token,
            steps: steps.length > 0 ? steps : undefined,
            format: "json",
            search: debouncedSearch || undefined,
            offset,
            limit: PAGE_SIZE,
          },
        }
      );

      if (fnErr) {
        const msg = fnErr.message || String(fnErr);
        if (msg.includes("403") || msg.includes("private")) {
          setNeedsAuth(true);
          setLoading(false);
          return;
        }
        throw new Error(msg);
      }

      if (data?.error) {
        if (
          data.error.includes("private") ||
          data.error.includes("Sign in")
        ) {
          setNeedsAuth(true);
          setLoading(false);
          return;
        }
        throw new Error(data.error);
      }

      if (data.share) setShareMeta(data.share);
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [token, activeSteps, debouncedSearch, offset, session]);

  // Fetch stats once on mount / auth change
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Fetch leads on filter/search/page change
  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Scroll table to top on page change
  useEffect(() => {
    tableRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [offset]);

  // ── Sorted leads (client-side sort within current page) ──────────
  const sortedLeads = useMemo(() => {
    if (!sortCol) return leads;
    return [...leads].sort((a, b) => {
      const aVal = String(a[sortCol] ?? "");
      const bVal = String(b[sortCol] ?? "");
      const cmp = aVal.localeCompare(bVal, undefined, {
        sensitivity: "base",
      });
      return sortAsc ? cmp : -cmp;
    });
  }, [leads, sortCol, sortAsc]);

  // ── Handle column sort ──────────────────────────────────────────
  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  // ── Handle page change ──────────────────────────────────────────
  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
  };

  // ── CSV download ────────────────────────────────────────────────
  const handleCsvDownload = async () => {
    if (Platform.OS !== "web") return;
    setCsvLoading(true);
    try {
      const steps = Array.from(activeSteps);
      const { data, error: fnErr } = await supabase.functions.invoke(
        "shared-leads",
        {
          body: {
            token,
            steps: steps.length > 0 ? steps : undefined,
            format: "csv",
            search: debouncedSearch || undefined,
          },
        }
      );
      if (fnErr) throw fnErr;

      const csvContent =
        typeof data === "string" ? data : JSON.stringify(data);
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stepLabel =
        steps.length > 0 ? steps.join("_") : "all";
      a.download = `leads_${shareMeta?.name || token}_${stepLabel}.csv`;
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

  // ── Google sign-in for private shares ───────────────────────────
  const handleSignIn = async () => {
    if (Platform.OS !== "web") return;
    const { data, error: authErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (authErr) console.error("Auth error:", authErr);
    if (data?.url) window.location.href = data.url;
  };

  // ── Clear all filters ──────────────────────────────────────────
  const clearFilters = () => {
    setActiveSteps(new Set());
    setSearch("");
    setSortCol(null);
  };

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  // Auth required screen
  if (needsAuth) {
    return (
      <View style={styles.container}>
        <View style={styles.authCard}>
          <Text style={styles.lockIcon}>&#128274;</Text>
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

  // Loading (initial)
  if (loading && !shareMeta && leads.length === 0) {
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

  const activeCount = activeSteps.size;
  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <View style={styles.page}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>
            {shareMeta?.name || "Shared Leads"}
          </Text>
          <Text style={styles.headerSubtitle}>
            {shareMeta?.campaign_name} · {total.toLocaleString()} leads
            {activeCount > 0
              ? ` (${activeCount} filter${activeCount > 1 ? "s" : ""} active)`
              : ""}
            {shareMeta?.is_public ? " · Public" : " · Private"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {activeCount > 0 && (
            <Pressable style={styles.clearButton} onPress={clearFilters}>
              <Text style={styles.clearButtonText}>Clear filters</Text>
            </Pressable>
          )}
          {Platform.OS === "web" && (
            <Pressable
              style={[
                styles.csvButton,
                csvLoading && styles.csvButtonDisabled,
              ]}
              onPress={handleCsvDownload}
              disabled={csvLoading}
            >
              <Text style={styles.csvButtonText}>
                {csvLoading ? "Exporting..." : "Download CSV"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Pipeline Stats ──────────────────────────────────────── */}
      {stats && (
        <StatsBar
          stats={stats}
          activeSteps={activeSteps}
          onToggleStep={toggleStep}
        />
      )}
      {statsLoading && !stats && (
        <View style={styles.statsLoading}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.statsLoadingText}>Loading pipeline stats...</Text>
        </View>
      )}

      {/* ── Active Filters Indicator ────────────────────────────── */}
      {activeCount > 0 && (
        <View style={styles.activeFiltersRow}>
          <Text style={styles.activeFiltersLabel}>Active filters:</Text>
          {Array.from(activeSteps).map((stepKey) => {
            const stepDef = PIPELINE_STEPS.find((s) => s.key === stepKey);
            return (
              <Pressable
                key={stepKey}
                style={[
                  styles.activeFilterChip,
                  { borderColor: stepDef?.color || "#3b82f6" },
                ]}
                onPress={() => toggleStep(stepKey)}
              >
                <Text
                  style={[
                    styles.activeFilterText,
                    { color: stepDef?.color || "#3b82f6" },
                  ]}
                >
                  {stepDef?.label || stepKey} ✕
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

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
      <ScrollView ref={tableRef} style={styles.tableWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View>
            {/* Table header */}
            <View style={styles.tableHeaderRow}>
              <View style={[styles.tableCell, { width: 60 }]}>
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
                    {sortCol === col.key
                      ? sortAsc
                        ? " \u2191"
                        : " \u2193"
                      : ""}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Table rows */}
            {sortedLeads.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>
                  {loading
                    ? "Loading..."
                    : "No leads match the current filters."}
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
                  <View style={[styles.tableCell, { width: 60 }]}>
                    <Text style={styles.tableCellTextMuted}>
                      {offset + idx + 1}
                    </Text>
                  </View>
                  {TABLE_COLUMNS.map((col) => (
                    <View
                      key={col.key}
                      style={[styles.tableCell, { width: col.width }]}
                    >
                      <Text style={styles.tableCellText} numberOfLines={1}>
                        {lead[col.key] != null
                          ? String(lead[col.key])
                          : "\u2014"}
                      </Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </ScrollView>

      {/* ── Footer with pagination ───────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          <Text style={styles.footerText}>
            {total > 0
              ? `Showing ${pageStart.toLocaleString()}\u2013${pageEnd.toLocaleString()} of ${total.toLocaleString()} leads`
              : "No leads"}
          </Text>
        </View>
        <Pagination
          total={total}
          offset={offset}
          limit={PAGE_SIZE}
          onPageChange={handlePageChange}
          loading={loading}
        />
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
  headerActions: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },

  // Clear filters button
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#475569",
  },
  clearButtonText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "500" as const,
  },

  // CSV button
  csvButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  csvButtonDisabled: {
    opacity: 0.5,
  },
  csvButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600" as const,
  },

  // ── Pipeline Stats ─────────────────────────────────────────────
  statsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  statsTotalRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 10,
  },
  statsTotalLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  statsTotalValue: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#f8fafc",
  },
  statsGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  statCard: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    padding: 10,
    minWidth: 130,
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden" as const,
    position: "relative" as const,
    cursor: "pointer" as const,
  },
  statBarBg: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#0f172a",
  },
  statBarFill: {
    height: 3,
    borderRadius: 2,
  },
  statCardContent: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  statLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "500" as const,
    flex: 1,
  },
  statValues: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    gap: 6,
  },
  statCount: {
    fontSize: 14,
    fontWeight: "700" as const,
  },
  statPct: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "500" as const,
  },
  statActiveDot: {
    position: "absolute" as const,
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statsLoading: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 12,
    gap: 8,
  },
  statsLoadingText: {
    fontSize: 12,
    color: "#64748b",
  },

  // ── Active filters row ─────────────────────────────────────────
  activeFiltersRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    flexWrap: "wrap" as const,
  },
  activeFiltersLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "500" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
    marginRight: 4,
  },
  activeFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
  },
  activeFilterText: {
    fontSize: 11,
    fontWeight: "600" as const,
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
    position: "sticky" as const,
    top: 0,
    zIndex: 10,
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
  tableCellTextMuted: {
    fontSize: 11,
    color: "#64748b",
    fontVariant: ["tabular-nums"] as ("tabular-nums")[],
  },
  emptyRow: {
    padding: 32,
    alignItems: "center" as const,
  },
  emptyText: {
    fontSize: 14,
    color: "#64748b",
  },

  // Footer / Pagination
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
  },
  footerInfo: {
    marginBottom: 6,
  },
  footerText: {
    fontSize: 12,
    color: "#64748b",
  },
  paginationRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 4,
    flexWrap: "wrap" as const,
  },
  pageBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    minWidth: 36,
    alignItems: "center" as const,
  },
  pageBtnActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "500" as const,
  },
  pageBtnTextActive: {
    color: "#ffffff",
    fontWeight: "700" as const,
  },
  pageDots: {
    color: "#64748b",
    fontSize: 12,
    paddingHorizontal: 4,
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
