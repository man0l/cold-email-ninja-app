-- Migration 009: Server-side category aggregation for CategoryPicker.
-- Splits comma-separated category strings and groups by individual category.
-- Returns only category names + counts, no lead data transferred.

CREATE OR REPLACE FUNCTION ninja.lead_category_breakdown(p_campaign_id UUID)
RETURNS TABLE(category_name TEXT, lead_count BIGINT) AS $$
  SELECT trim(unnest(string_to_array(category, ', '))) AS category_name,
         COUNT(*) AS lead_count
  FROM ninja.leads
  WHERE campaign_id = p_campaign_id
    AND category IS NOT NULL
    AND category != ''
  GROUP BY category_name
  ORDER BY lead_count DESC;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION ninja.lead_category_breakdown(UUID) TO anon, authenticated, service_role;
