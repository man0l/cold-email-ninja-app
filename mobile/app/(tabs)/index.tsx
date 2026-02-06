/**
 * Dashboard screen - overview stats, active jobs, recent campaigns
 */
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDashboardStats, useCampaigns } from "@/lib/queries";
import { formatNumber, formatRelativeTime, JOB_TYPE_LABELS } from "@/lib/utils";
import type { BulkJob } from "@/lib/types";

export default function DashboardScreen() {
  const router = useRouter();
  const { data: stats, refetch, isLoading } = useDashboardStats();
  const { data: campaigns } = useCampaigns();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4 pb-8"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
      }
    >
      {/* Stats Cards */}
      <View className="flex-row gap-3 mb-6">
        <Card className="flex-1">
          <CardContent>
            <Text className="text-3xl font-bold text-primary">
              {formatNumber(stats?.campaignCount || 0)}
            </Text>
            <Text className="text-xs text-muted-foreground mt-1">Campaigns</Text>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent>
            <Text className="text-3xl font-bold text-primary">
              {formatNumber(stats?.leadCount || 0)}
            </Text>
            <Text className="text-xs text-muted-foreground mt-1">Total Leads</Text>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent>
            <Text className="text-3xl font-bold text-yellow-500">
              {stats?.activeJobs?.length || 0}
            </Text>
            <Text className="text-xs text-muted-foreground mt-1">Active Jobs</Text>
          </CardContent>
        </Card>
      </View>

      {/* Active Jobs */}
      {stats?.activeJobs && stats.activeJobs.length > 0 && (
        <View className="mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">Active Jobs</Text>
          {stats.activeJobs.map((job: BulkJob) => (
            <Card key={job.id} className="mb-2">
              <CardContent>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-semibold text-foreground">
                    {JOB_TYPE_LABELS[job.type] || job.type}
                  </Text>
                  <Badge variant="status" status={job.status}>
                    {job.status}
                  </Badge>
                </View>
                {job.progress?.total ? (
                  <Progress
                    value={(job.progress.processed || 0) / job.progress.total * 100}
                    label={`${job.progress.processed || 0} / ${job.progress.total}`}
                  />
                ) : (
                  <Text className="text-xs text-muted-foreground">Starting...</Text>
                )}
              </CardContent>
            </Card>
          ))}
        </View>
      )}

      {/* Recent Campaigns */}
      <Text className="text-lg font-bold text-foreground mb-3">Recent Campaigns</Text>
      {campaigns?.slice(0, 5).map((campaign) => (
        <Pressable
          key={campaign.id}
          onPress={() => router.push(`/campaign/${campaign.id}`)}
        >
          <Card className="mb-2">
            <CardContent>
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-3">
                  <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                    {campaign.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground mt-0.5">
                    {campaign.leads?.[0]?.count || 0} leads · {formatRelativeTime(campaign.created_at)}
                  </Text>
                </View>
                <Badge variant="status" status={campaign.status}>
                  {campaign.status}
                </Badge>
              </View>
            </CardContent>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}
