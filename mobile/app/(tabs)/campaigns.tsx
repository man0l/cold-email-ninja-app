/**
 * Campaigns list screen
 */
import { View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCampaigns } from "@/lib/queries";
import { formatRelativeTime, truncate } from "@/lib/utils";
import type { Campaign } from "@/lib/types";

export default function CampaignsScreen() {
  const router = useRouter();
  const { data: campaigns, refetch, isLoading } = useCampaigns();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const renderCampaign = ({ item }: { item: Campaign }) => (
    <Pressable onPress={() => router.push(`/campaign/${item.id}`)}>
      <Card className="mb-3">
        <CardContent>
          <View className="flex-row items-start justify-between mb-2">
            <Text className="text-base font-bold text-foreground flex-1 mr-2" numberOfLines={2}>
              {item.name}
            </Text>
            <Badge variant="status" status={item.status}>
              {item.status}
            </Badge>
          </View>
          <Text className="text-xs text-muted-foreground mb-1" numberOfLines={1}>
            {truncate(item.service_line, 80)}
          </Text>
          <View className="flex-row items-center justify-between mt-2">
            <Text className="text-xs text-muted-foreground">
              {item.leads?.[0]?.count || 0} leads
            </Text>
            <Text className="text-xs text-muted-foreground">
              {formatRelativeTime(item.created_at)}
            </Text>
          </View>
        </CardContent>
      </Card>
    </Pressable>
  );

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={campaigns || []}
        renderItem={renderCampaign}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
        ListHeaderComponent={
          <Button
            onPress={() => router.push("/campaign/new")}
            className="mb-4"
          >
            + New Campaign
          </Button>
        }
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-muted-foreground text-sm">
              No campaigns yet. Create your first one.
            </Text>
          </View>
        }
      />
    </View>
  );
}
