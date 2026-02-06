-- Migration 008: Enable Realtime for ninja schema tables
-- Allows mobile app to subscribe to live updates

ALTER PUBLICATION supabase_realtime ADD TABLE ninja.bulk_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE ninja.enrichment_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE ninja.leads;
