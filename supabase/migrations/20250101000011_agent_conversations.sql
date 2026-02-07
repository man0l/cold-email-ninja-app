-- Migration 011: Agent conversation history
-- Stores full conversation transcripts (including tool call data)
-- with configurable retention (default 7 days).

CREATE TABLE ninja.agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  -- Full OpenAI-format messages array (user, assistant, tool messages)
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Tool execution log for display
  tool_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Display-friendly message list (user + assistant with tool cards)
  display_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_conversations_updated ON ninja.agent_conversations (updated_at DESC);

GRANT ALL ON ninja.agent_conversations TO anon, authenticated, service_role;

-- Add conversation_retention_days to agent config defaults
UPDATE ninja.app_settings
SET settings = jsonb_set(
  settings,
  '{agent,defaults,conversation_retention_days}',
  '7'::jsonb
)
WHERE id = 1;

-- Add agent conversation cleanup to the existing system cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_system_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  retention_days int;
BEGIN
  -- pg_cron job run history
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '1 day';
  -- pg_net HTTP responses
  DELETE FROM net._http_response WHERE created < now() - interval '1 day';
  -- pgmq archived messages
  DELETE FROM pgmq.a_lead_enrichment WHERE archived_at < now() - interval '1 day';
  -- Agent conversations: configurable retention (default 7 days)
  SELECT COALESCE(
    (settings->'agent'->'defaults'->>'conversation_retention_days')::int,
    7
  ) INTO retention_days
  FROM ninja.app_settings WHERE id = 1;

  DELETE FROM ninja.agent_conversations
  WHERE updated_at < now() - (retention_days || ' days')::interval;
END;
$$;
