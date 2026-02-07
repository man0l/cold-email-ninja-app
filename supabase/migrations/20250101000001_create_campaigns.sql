-- Migration 001: campaigns table
-- Mirrors production public.campaigns + status/updated_at extensions

CREATE TABLE ninja.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  service_line TEXT NOT NULL,
  summarize_prompt TEXT NOT NULL,
  icebreaker_prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Extensions (not in production public.campaigns)
  status TEXT DEFAULT 'draft',  -- draft, active, completed, archived
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grant explicit permissions
GRANT ALL ON ninja.campaigns TO anon, authenticated, service_role;
