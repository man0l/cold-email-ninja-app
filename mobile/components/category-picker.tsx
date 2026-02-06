/**
 * Learning #4: Interactive category filter for clean_leads.
 * Shows a breakdown of categories with tap-to-select and live count.
 */
import { View, Text, Pressable, ScrollView } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCategoryBreakdown } from "@/lib/queries";

interface CategoryPickerProps {
  campaignId: string;
  onConfirm: (categories: string[]) => void;
  loading?: boolean;
}

export function CategoryPicker({ campaignId, onConfirm, loading }: CategoryPickerProps) {
  const { data: categories } = useCategoryBreakdown(campaignId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!categories?.length) {
    return (
      <Card className="mb-4">
        <CardContent>
          <Text className="text-sm text-muted-foreground py-4 text-center">
            No categories found. Run a scrape first.
          </Text>
        </CardContent>
      </Card>
    );
  }

  const toggle = (cat: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set((categories || []).map((c) => c.name)));
  };

  const selectedCount = (categories || [])
    .filter((c) => selected.has(c.name))
    .reduce((sum, c) => sum + c.count, 0);

  return (
    <Card className="mb-4">
      <CardHeader>
        <View className="flex-row items-center justify-between">
          <CardTitle className="text-base">Filter by Category</CardTitle>
          <Pressable onPress={selectAll}>
            <Text className="text-xs text-primary">Select all</Text>
          </Pressable>
        </View>
      </CardHeader>
      <CardContent>
        <ScrollView style={{ maxHeight: 280 }}>
          {(categories || []).map((cat) => {
            const isSelected = selected.has(cat.name);
            return (
              <Pressable
                key={cat.name}
                onPress={() => toggle(cat.name)}
                className={`flex-row items-center justify-between py-2.5 px-3 mb-1.5 rounded-lg ${
                  isSelected ? "bg-primary/15" : "bg-secondary/30"
                }`}
              >
                <View className="flex-row items-center flex-1 mr-3">
                  <Ionicons
                    name={isSelected ? "checkbox" : "square-outline"}
                    size={20}
                    color={isSelected ? "#3b82f6" : "#64748b"}
                  />
                  <Text
                    className={`text-sm ml-2 flex-1 ${
                      isSelected ? "text-foreground font-medium" : "text-muted-foreground"
                    }`}
                    numberOfLines={1}
                  >
                    {cat.name}
                  </Text>
                </View>
                <Text className="text-xs text-muted-foreground">{cat.count}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View className="mt-3 pt-3 border-t border-border">
          <Text className="text-sm text-foreground text-center mb-3">
            {selected.size > 0 ? (
              <>
                <Text className="font-bold text-primary">{selectedCount}</Text> leads match{" "}
                {selected.size} categor{selected.size === 1 ? "y" : "ies"}
              </>
            ) : (
              "Select categories to filter"
            )}
          </Text>
          <Button
            onPress={() => onConfirm([...selected])}
            disabled={selected.size === 0}
            loading={loading}
          >
            Clean & Validate {selected.size > 0 ? `(${selectedCount} leads)` : ""}
          </Button>
        </View>
      </CardContent>
    </Card>
  );
}
