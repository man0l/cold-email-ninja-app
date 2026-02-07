/**
 * Auth context & provider.
 * Tracks the Supabase session and exposes sign-in / sign-out helpers.
 * Works on both native (Android/iOS) and web.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

/* Complete any pending auth sessions on app open (Android) */
if (Platform.OS !== "web") {
  WebBrowser.maybeCompleteAuthSession();
}

interface AuthState {
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /* Fetch the initial session */
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    /* Listen for auth changes (login, logout, token refresh) */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS === "web") {
      // On web: let Supabase handle the redirect natively (full page redirect)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      // Browser will redirect to Google, then back to our origin
      return;
    }

    // On native: use expo-web-browser for in-app browser OAuth.
    // GoTrue v2.2.12 only accepts redirect URLs whose hostname matches
    // the SiteURL (zenmanager.eu) or exact strings in the allowlist.
    // Custom schemes (exp://, cold-email-ninja://) are rejected entirely.
    //
    // Solution: use an auth-relay page served at zenmanager.eu/auth-relay
    // (same hostname as SiteURL, so GoTrue accepts it). Traefik proxies
    // this path to the Supabase Edge Function which serves HTML that reads
    // the tokens from the URL fragment and redirects to the app's deep link.
    const appDeepLink = Linking.createURL("auth/callback");
    const relayUrl = `https://zenmanager.eu/auth-relay?redirect=${encodeURIComponent(appDeepLink)}`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: relayUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (!data.url) return;

    // Listen for the app deep link (exp:// or cold-email-ninja://)
    // The relay page will redirect the browser to this deep link after loading
    const result = await WebBrowser.openAuthSessionAsync(data.url, appDeepLink);

    if (result.type === "success") {
      // Tokens may arrive as query params (relay converts fragments to params)
      // or as hash fragments. Try both.
      const url = new URL(result.url);
      const queryParams = new URLSearchParams(url.search);
      const hashParams = url.hash
        ? new URLSearchParams(url.hash.substring(1))
        : new URLSearchParams();

      const accessToken =
        queryParams.get("access_token") || hashParams.get("access_token");
      const refreshToken =
        queryParams.get("refresh_token") || hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
      // If tokens aren't here, the auth/callback route will handle them
      // via the deep link params (Expo Router).
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
