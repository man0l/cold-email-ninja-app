import "../global.css";
import { Stack, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, Pressable, ActivityIndicator, Platform } from "react-native";
import Constants from "expo-constants";
import { useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useVersionCheck } from "@/lib/queries";
import LoginScreen from "./login";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

// ─── Update Banner ───────────────────────────────────────────────────

function UpdateBanner() {
  const { data: latestVersion } = useVersionCheck();
  const [dismissed, setDismissed] = useState(false);
  const insets = useSafeAreaInsets();

  const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
  const updateAvailable = latestVersion && latestVersion !== currentVersion;

  if (!updateAvailable || dismissed) return null;

  const handleUpdate = () => {
    if (Platform.OS === "web") {
      window.location.reload();
    }
  };

  return (
    <View
      style={{ paddingTop: insets.top, backgroundColor: "#3b82f6" }}
    >
      <Pressable
        onPress={handleUpdate}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 8,
          paddingHorizontal: 16,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", flex: 1, textAlign: "center" }}>
          New version available — tap to update
        </Text>
        <Pressable
          onPress={(e) => { e.stopPropagation(); setDismissed(true); }}
          hitSlop={8}
        >
          <Text style={{ color: "#ffffffcc", fontSize: 16, fontWeight: "700", paddingLeft: 12 }}>✕</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

// ─── Root Navigator ──────────────────────────────────────────────────

function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();

  // Allow /share routes without auth — they handle their own access control
  const isShareRoute = segments[0] === "share";

  if (loading && !isShareRoute) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f172a" }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // No session → show login directly (bypass router), unless on share route
  if (!session && !isShareRoute) {
    return <LoginScreen />;
  }

  return (
    <View style={{ flex: 1 }}>
    <UpdateBanner />
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0f172a" },
        headerTintColor: "#f8fafc",
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: "#0f172a" },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="campaign/[id]"
        options={{ title: "Campaign", headerShown: false }}
      />
      <Stack.Screen
        name="campaign/new"
        options={{ title: "New Campaign", presentation: "modal" }}
      />
      <Stack.Screen
        name="lead/[id]"
        options={{ title: "Lead Details", presentation: "modal" }}
      />
      <Stack.Screen
        name="enrich/[campaignId]"
        options={{ title: "Enrichment Pipeline", headerShown: false }}
      />
      <Stack.Screen
        name="share/[token]"
        options={{ title: "Shared Leads", headerShown: false }}
      />
    </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <RootNavigator />
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
