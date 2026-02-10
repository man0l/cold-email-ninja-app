/**
 * Billing Dashboard Screen
 * Shows current plan, usage, and upgrade options
 */
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBillingInfo } from "@/lib/queries";
import { truncate } from "@/lib/utils";

export default function BillingScreen() {
  const router = useRouter();
  const { data: billing, isLoading, error } = useBillingInfo();

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  if (error || !billing) {
    return (
      <SafeAreaView className="flex-1 bg-background p-4">
        <Text className="text-foreground text-center">
          Unable to load billing information
        </Text>
        <Button onPress={() => router.back()} className="mt-4">
          Go Back
        </Button>
      </SafeAreaView>
    );
  }

  const isNearLimit = billing.percent_used >= 80 && billing.is_free_tier;
  const isOverLimit = billing.leads_remaining === 0 && billing.is_free_tier;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Header */}
        <View className="mb-6">
          <Text className="text-3xl font-bold text-foreground mb-2">
            Billing & Subscription
          </Text>
          <Text className="text-sm text-muted-foreground">
            Manage your GTM Zero subscription
          </Text>
        </View>

        {/* Current Plan Card */}
        <Card className="mb-4">
          <CardContent>
            <View className="mb-4">
              <Text className="text-xs text-muted-foreground uppercase font-semibold letter-spacing">
                Current Plan
              </Text>
              <Text className="text-2xl font-bold text-foreground mt-1">
                {billing.plan_name}
              </Text>
              {billing.stripe_subscription_id && (
                <Text className="text-xs text-muted-foreground mt-1">
                  Active subscription
                </Text>
              )}
            </View>

            <View className="flex-row items-center justify-between pt-4 border-t border-border">
              <Text className="text-sm text-foreground">Billing Status</Text>
              <View
                className={`px-3 py-1 rounded-full ${
                  billing.status === "active"
                    ? "bg-green-500/15"
                    : "bg-yellow-500/15"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    billing.status === "active"
                      ? "text-green-400"
                      : "text-yellow-400"
                  }`}
                >
                  {billing.status === "active" ? "Active" : "Pending"}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Usage Card */}
        <Card className="mb-4">
          <CardContent>
            <View className="mb-4">
              <Text className="text-xs text-muted-foreground uppercase font-semibold">
                Monthly Usage
              </Text>
              <View className="flex-row items-baseline gap-1 mt-2">
                <Text className="text-3xl font-bold text-foreground">
                  {billing.leads_used_this_month}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {billing.monthly_leads_limit === -1
                    ? "leads (unlimited)"
                    : `of ${billing.monthly_leads_limit} leads`}
                </Text>
              </View>
            </View>

            {/* Progress Bar */}
            {billing.monthly_leads_limit !== -1 && (
              <>
                <View className="h-2 bg-secondary rounded-full overflow-hidden mb-2">
                  <View
                    className={`h-full rounded-full ${
                      isOverLimit
                        ? "bg-red-500"
                        : isNearLimit
                        ? "bg-yellow-500"
                        : "bg-blue-500"
                    }`}
                    style={{
                      width: `${Math.min(billing.percent_used, 100)}%`,
                    }}
                  />
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-muted-foreground">
                    {billing.percent_used}% used
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {billing.leads_remaining >= 0
                      ? `${billing.leads_remaining} remaining`
                      : "Unlimited"}
                  </Text>
                </View>
              </>
            )}

            {/* Reset info */}
            <View className="mt-4 pt-4 border-t border-border">
              <Text className="text-xs text-muted-foreground">
                Resets on{" "}
                {new Date(billing.billing_period_end).toLocaleDateString()}
              </Text>
            </View>
          </CardContent>
        </Card>

        {/* Warning if near/over limit */}
        {isNearLimit && !isOverLimit && (
          <Card className="mb-4 bg-yellow-500/10 border border-yellow-500/20">
            <CardContent>
              <View className="flex-row gap-2">
                <Ionicons
                  name="warning"
                  size={20}
                  color="#eab308"
                  style={{ marginTop: 2 }}
                />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-yellow-300">
                    Nearing Usage Limit
                  </Text>
                  <Text className="text-xs text-yellow-200 mt-1">
                    You've used {billing.percent_used}% of your monthly leads.
                    Upgrade to Pro to continue without limits.
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>
        )}

        {isOverLimit && (
          <Card className="mb-4 bg-red-500/10 border border-red-500/20">
            <CardContent>
              <View className="flex-row gap-2">
                <Ionicons
                  name="close-circle"
                  size={20}
                  color="#ef4444"
                  style={{ marginTop: 2 }}
                />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-red-300">
                    Usage Limit Reached
                  </Text>
                  <Text className="text-xs text-red-200 mt-1">
                    You've reached your monthly lead limit. Upgrade your plan
                    to continue importing or scraping leads.
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>
        )}

        {/* Plan Comparison */}
        <View className="mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">
            Plan Comparison
          </Text>

          {[
            { name: "Free", leads: "1,000/month", price: "Free", active: billing.is_free_tier },
            { name: "Pro", leads: "10,000/month", price: "$29/mo", active: billing.tier === "pro" },
            { name: "Enterprise", leads: "Unlimited", price: "Custom", active: billing.tier === "enterprise" },
          ].map((plan) => (
            <Card
              key={plan.name}
              className={`mb-2 ${
                plan.active ? "bg-blue-500/10 border-blue-500/50" : "opacity-60"
              }`}
            >
              <CardContent>
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="font-semibold text-foreground">
                      {plan.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-0.5">
                      {plan.leads}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-semibold text-foreground">
                      {plan.price}
                    </Text>
                    {plan.active && (
                      <View className="bg-blue-500/20 rounded px-2 py-0.5 mt-1">
                        <Text className="text-xs text-blue-300">Current</Text>
                      </View>
                    )}
                  </View>
                </View>
              </CardContent>
            </Card>
          ))}
        </View>

        {/* Action Buttons */}
        {billing.is_free_tier && (
          <Button className="mb-2">
            <Ionicons name="arrow-up" size={16} color="white" />
            <Text className="ml-2">Upgrade to Pro</Text>
          </Button>
        )}

        <Button
          variant="outline"
          className="mb-2"
          onPress={() =>
            Alert.alert(
              "Support",
              "Contact us at support@gtm-zero.com for billing questions"
            )
          }
        >
          <Ionicons name="help-circle-outline" size={16} color="#3b82f6" />
          <Text className="ml-2">Contact Support</Text>
        </Button>

        {billing.stripe_subscription_id && (
          <Button
            variant="outline"
            className="mb-2"
            onPress={() =>
              Alert.alert(
                "Manage Subscription",
                "Visit your Stripe customer portal to update payment method or cancel"
              )
            }
          >
            <Ionicons name="card-outline" size={16} color="#3b82f6" />
            <Text className="ml-2">Manage Payment Method</Text>
          </Button>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
