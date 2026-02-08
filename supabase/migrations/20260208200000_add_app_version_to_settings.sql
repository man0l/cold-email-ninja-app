-- Add app_version column to app_settings so we can bump the version
-- from the database without redeploying the Edge Function or the app.

ALTER TABLE ninja.app_settings
  ADD COLUMN IF NOT EXISTS app_version TEXT NOT NULL DEFAULT '1.2.1';

-- Set the current version
UPDATE ninja.app_settings SET app_version = '1.2.1' WHERE id = 1;
