/**
 * OAuth callback route for native deep links.
 *
 * When the auth-relay redirects back to the app via deep link, Expo Router
 * navigates here. The tokens are passed as query parameters (converted from
 * URL fragments by the relay page since Android drops fragments in deep links).
 *
 * This screen extracts the tokens, sets the Supabase session, and the
 * AuthProvider's onAuthStateChange listener takes care of the rest.
 */
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const params = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
  }>();
  const router = useRouter();

  useEffect(() => {
    const setSession = async () => {
      const accessToken = params.access_token;
      const refreshToken = params.refresh_token;

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }

      // Navigate to home — AuthProvider will detect the session change
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/");
      }
    };

    setSession();
  }, [params.access_token, params.refresh_token]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#0f172a",
      }}
    >
      <ActivityIndicator size="large" color="#3b82f6" />
    </View>
  );
}
