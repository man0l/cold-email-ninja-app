/**
 * Settings screen - API keys configuration
 */
import { View, Text, ScrollView, Alert } from "react-native";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useApiKeys, useSaveApiKey } from "@/lib/queries";

const API_SERVICES = [
  { key: "openai", label: "OpenAI", desc: "GPT models for enrichment & icebreakers" },
  { key: "openwebninja", label: "OpenWeb Ninja", desc: "Email/contact scraping" },
  { key: "anymail", label: "Anymail Finder", desc: "Decision maker emails" },
  { key: "rapidapi_maps", label: "RapidAPI Maps", desc: "Google Maps scraping" },
  { key: "rapidapi_linkedin", label: "RapidAPI LinkedIn", desc: "LinkedIn data" },
  { key: "dataforseo", label: "DataForSEO", desc: "Search API for LinkedIn" },
];

export default function SettingsScreen() {
  const { data: existingKeys } = useApiKeys();
  const saveKey = useSaveApiKey();
  const [editingService, setEditingService] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");

  const configuredServices = new Set(
    (existingKeys || []).map((k) => k.service)
  );

  const handleSave = async (service: string) => {
    if (!keyValue.trim()) return;
    try {
      await saveKey.mutateAsync({ service, api_key: keyValue.trim() });
      setEditingService(null);
      setKeyValue("");
      Alert.alert("Saved", `${service} API key saved.`);
    } catch (err) {
      Alert.alert("Error", String(err));
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4 pb-8"
    >
      <Text className="text-lg font-bold text-foreground mb-1">API Keys</Text>
      <Text className="text-sm text-muted-foreground mb-4">
        Configure external service credentials. Stored in the ninja.api_keys table.
      </Text>

      {API_SERVICES.map((svc) => {
        const isConfigured = configuredServices.has(svc.key);
        const isEditing = editingService === svc.key;

        return (
          <Card key={svc.key} className="mb-3">
            <CardContent>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-sm font-semibold text-foreground">
                  {svc.label}
                </Text>
                <Badge variant="status" status={isConfigured ? "done" : "pending"}>
                  {isConfigured ? "configured" : "missing"}
                </Badge>
              </View>
              <Text className="text-xs text-muted-foreground mb-2">
                {svc.desc}
              </Text>

              {isEditing ? (
                <View>
                  <Input
                    value={keyValue}
                    onChangeText={setKeyValue}
                    placeholder="Paste API key..."
                    secureTextEntry
                  />
                  <View className="flex-row gap-2">
                    <Button
                      size="sm"
                      onPress={() => handleSave(svc.key)}
                      loading={saveKey.isPending}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setEditingService(null);
                        setKeyValue("");
                      }}
                    >
                      Cancel
                    </Button>
                  </View>
                </View>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    setEditingService(svc.key);
                    setKeyValue("");
                  }}
                >
                  {isConfigured ? "Update Key" : "Add Key"}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* System Info */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>System</CardTitle>
        </CardHeader>
        <CardContent>
          <Text className="text-xs text-muted-foreground">
            Supabase: {process.env.EXPO_PUBLIC_SUPABASE_URL}
          </Text>
          <Text className="text-xs text-muted-foreground">Schema: ninja</Text>
          <Text className="text-xs text-muted-foreground">Version: 1.0.0</Text>
        </CardContent>
      </Card>
    </ScrollView>
  );
}
