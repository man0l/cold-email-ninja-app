/**
 * Campaign detail screen - leads list with enrichment actions.
 * Uses FlashList with infinite scroll for 10,000+ lead scalability.
 * Lean field selection (~10 fields instead of 40+).
 * Debounced search to avoid query spam.
 */
import { View, Text, Pressable, RefreshControl, ActivityIndicator, Modal, Switch, Alert, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useMemo, useCallback } from "react";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataQualityCard } from "@/components/data-quality";
import { ReadinessChecklist } from "@/components/readiness-checklist";
import { ScreenHeader } from "@/components/screen-header";
import { BottomTabs } from "@/components/bottom-tabs";
import {
  useCampaign, useInfiniteLeads, useDataQuality,
  useShares, useCreateShare, useDeleteShare, LeadShare,
} from "@/lib/queries";
import { useRealtimeLeads } from "@/hooks/use-realtime-leads";
import { useDebounce } from "@/hooks/use-debounce";
import { truncate } from "@/lib/utils";
import type { Lead } from "@/lib/types";

// Vercel domain for share links (set in .env as EXPO_PUBLIC_WEB_URL)
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || "https://cold-email-ninja.vercel.app";

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: campaign, refetch: refetchCampaign } = useCampaign(id);
  const { data: quality } = useDataQuality(id);

  // Debounced search (300ms delay)
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Infinite scroll leads
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isLoading,
  } = useInfiniteLeads(id, {
    search: debouncedSearch || undefined,
  });

  const [refreshing, setRefreshing] = useState(false);

  // Realtime lead updates
  useRealtimeLeads(id);

  // ── Share modal state ─────────────────────────────────────────────
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareName, setShareName] = useState("");
  const [shareIsPublic, setShareIsPublic] = useState(true);
  const { data: shares } = useShares(id);
  const createShare = useCreateShare();
  const deleteShare = useDeleteShare();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCreateShare = async () => {
    try {
      await createShare.mutateAsync({
        campaign_id: id,
        name: shareName || undefined,
        is_public: shareIsPublic,
      });
      setShareName("");
    } catch (err) {
      Alert.alert("Error", String(err));
    }
  };

  const handleCopyShareLink = async (share: LeadShare) => {
    const url = `${WEB_URL}/share/${share.token}`;
    await Clipboard.setStringAsync(url);
    setCopiedId(share.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteShare = (share: LeadShare) => {
    if (Platform.OS === "web") {
      if (confirm("Delete this share link?")) {
        deleteShare.mutate({ share_id: share.id, campaign_id: id });
      }
    } else {
      Alert.alert("Delete Share", "Delete this share link?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteShare.mutate({ share_id: share.id, campaign_id: id }),
        },
      ]);
    }
  };

  // Flatten pages into a single array
  const leads = useMemo(
    () => infiniteData?.pages.flatMap((p) => p.leads) ?? [],
    [infiniteData]
  );
  const total = infiniteData?.pages[0]?.total ?? 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchCampaign()]);
    setRefreshing(false);
  }, [refetch, refetchCampaign]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderLead = useCallback(
    ({ item }: { item: Partial<Lead> }) => {
      const enrichment = (item.enrichment_status || {}) as Record<string, unknown>;

      return (
        <Pressable onPress={() => router.push(`/lead/${item.id}`)}>
          <Card className="mb-2">
            <CardContent>
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-2">
                  <Text
                    className="text-sm font-semibold text-foreground"
                    numberOfLines={1}
                  >
                    {item.company_name_casual || item.company_name || "—"}
                  </Text>
                  <Text
                    className="text-xs text-muted-foreground mt-0.5"
                    numberOfLines={1}
                  >
                    {item.email || item.decision_maker_email || "No email"}
                    {item.decision_maker_name
                      ? ` · ${item.decision_maker_name}`
                      : item.title
                      ? ` · ${truncate(item.title, 25)}`
                      : ""}
                  </Text>
                  <View className="flex-row flex-wrap gap-1 mt-1.5">
                    {item.email && (
                      <View className="bg-green-500/15 rounded px-1.5 py-0.5">
                        <Text className="text-[10px] text-green-400">email</Text>
                      </View>
                    )}
                    {item.decision_maker_name && (
                      <View className="bg-purple-500/15 rounded px-1.5 py-0.5">
                        <Text className="text-[10px] text-purple-400">DM</Text>
                      </View>
                    )}
                    {enrichment.website_validated === true && (
                      <View className="bg-blue-500/15 rounded px-1.5 py-0.5">
                        <Text className="text-[10px] text-blue-400">valid</Text>
                      </View>
                    )}
                    {item.phone && (
                      <View className="bg-cyan-500/15 rounded px-1.5 py-0.5">
                        <Text className="text-[10px] text-cyan-400">phone</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color="#475569"
                  style={{ marginTop: 4 }}
                />
              </View>
            </CardContent>
          </Card>
        </Pressable>
      );
    },
    [router]
  );

  const ListHeader = useMemo(
    () => (
      <View className="mb-2">
        {/* Campaign header */}
        <Text className="text-xl font-bold text-foreground mb-0.5">
          {campaign?.name || "Loading..."}
        </Text>
        <Text className="text-sm text-muted-foreground mb-4">
          {total} leads
          {quality
            ? ` · ${quality.withEmail} emails · ${quality.withDM} decision makers`
            : ""}
        </Text>

        {/* Readiness warnings */}
        <ReadinessChecklist />

        {/* Action buttons */}
        <View className="flex-row gap-2 mb-4">
          <Button
            onPress={() => router.push(`/enrich/${id}`)}
            className="flex-1"
          >
            Enrichment Pipeline
          </Button>
          <Pressable
            onPress={() => setShareModalVisible(true)}
            className="bg-card border border-border rounded-lg px-3 justify-center"
          >
            <Ionicons name="share-outline" size={20} color="#94a3b8" />
          </Pressable>
        </View>

        {/* Data quality */}
        <DataQualityCard campaignId={id} />

        {/* Debounced search */}
        <Input
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder={`Search ${total} leads...`}
        />
      </View>
    ),
    [campaign, total, quality, id, searchInput, router]
  );

  const ListFooter = useMemo(
    () =>
      isFetchingNextPage ? (
        <View className="py-4 items-center">
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text className="text-xs text-muted-foreground mt-1">
            Loading more...
          </Text>
        </View>
      ) : leads.length > 0 && leads.length < total ? (
        <Text className="text-xs text-muted-foreground text-center py-4">
          Showing {leads.length} of {total}
        </Text>
      ) : null,
    [isFetchingNextPage, leads.length, total]
  );

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Campaign" />
      <View className="flex-1">
        <FlashList
          data={leads}
          renderItem={renderLead}
          keyExtractor={(item) => item.id!}
          estimatedItemSize={72}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#3b82f6"
            />
          }
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            isLoading ? (
              <View className="items-center py-8">
                <ActivityIndicator size="large" color="#3b82f6" />
              </View>
            ) : (
              <View className="items-center py-8">
                <Ionicons name="people-outline" size={40} color="#334155" />
                <Text className="text-muted-foreground text-sm mt-2">
                  No leads yet. Start with the Enrichment Pipeline.
                </Text>
              </View>
            )
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        />
      </View>
      <BottomTabs />

      {/* ── Share Modal ──────────────────────────────────────────── */}
      <Modal
        visible={shareModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View className="flex-1 bg-background p-4">
          {/* Modal header */}
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-lg font-bold text-foreground">
              Share Leads
            </Text>
            <Pressable onPress={() => setShareModalVisible(false)}>
              <Ionicons name="close" size={24} color="#94a3b8" />
            </Pressable>
          </View>

          {/* Create new share */}
          <View className="bg-card rounded-xl p-4 mb-4 border border-border">
            <Text className="text-sm font-semibold text-foreground mb-3">
              Create New Share Link
            </Text>
            <Input
              value={shareName}
              onChangeText={setShareName}
              placeholder="Link name (optional)"
              className="mb-3"
            />
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm text-foreground">Public access</Text>
                <Text className="text-xs text-muted-foreground">
                  {shareIsPublic
                    ? "Anyone with the link can view"
                    : "Only you can view (requires sign-in)"}
                </Text>
              </View>
              <Switch
                value={shareIsPublic}
                onValueChange={setShareIsPublic}
                trackColor={{ false: "#334155", true: "#3b82f6" }}
                thumbColor="#f8fafc"
              />
            </View>
            <Button
              onPress={handleCreateShare}
              disabled={createShare.isPending}
            >
              {createShare.isPending ? "Creating..." : "Create Link"}
            </Button>
          </View>

          {/* Existing shares */}
          <Text className="text-sm font-semibold text-foreground mb-2">
            Existing Share Links
          </Text>
          {!shares?.length ? (
            <Text className="text-sm text-muted-foreground text-center py-4">
              No share links yet.
            </Text>
          ) : (
            shares.map((share) => (
              <View
                key={share.id}
                className="bg-card rounded-xl p-3 mb-2 border border-border"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-2">
                    <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                      {share.name || "Untitled"}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-0.5">
                      {share.is_public ? "Public" : "Private"} ·{" "}
                      {new Date(share.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => handleCopyShareLink(share)}
                      className="bg-primary/10 rounded-lg px-3 py-1.5"
                    >
                      <Text className="text-xs text-primary font-medium">
                        {copiedId === share.id ? "Copied!" : "Copy Link"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDeleteShare(share)}
                      className="bg-red-500/10 rounded-lg px-3 py-1.5"
                    >
                      <Text className="text-xs text-red-400 font-medium">
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </Modal>
    </View>
  );
}
