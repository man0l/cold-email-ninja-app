-- Migration 000: Bootstrap ninja schema
-- Isolates mobile app data from existing public schema tables (campaigns, leads, etc.)

CREATE SCHEMA IF NOT EXISTS ninja;

GRANT USAGE ON SCHEMA ninja TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA ninja
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA ninja
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
