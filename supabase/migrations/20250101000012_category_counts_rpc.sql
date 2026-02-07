-- RPC function to efficiently count leads by individual category for a campaign.
-- The `category` column stores comma-separated Google Maps categories.
-- This function splits them, trims whitespace, and counts each individual category.
-- Uses GROUP BY at the database level instead of fetching all rows.
-- Critical for scalability: O(index scan) instead of O(n) row transfer for 100k+ leads.
CREATE OR REPLACE FUNCTION ninja.get_lead_category_counts(p_campaign_id UUID)
RETURNS TABLE(category TEXT, lead_count BIGINT) AS $$
  SELECT trim(cat) AS category, COUNT(*) AS lead_count
  FROM ninja.leads, unnest(string_to_array(ninja.leads.category, ',')) AS cat
  WHERE campaign_id = p_campaign_id
    AND ninja.leads.category IS NOT NULL
  GROUP BY trim(cat)
  ORDER BY lead_count DESC;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION ninja.get_lead_category_counts(UUID) TO anon, authenticated, service_role;
