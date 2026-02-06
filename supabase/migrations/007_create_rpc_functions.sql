-- Migration 007: RPC functions for queue management
-- Mirrors production enrichment queue pattern + bulk job claiming

-- Enqueue leads for enrichment (icebreaker generation)
CREATE OR REPLACE FUNCTION ninja.enqueue_lead_enrichment(
  p_campaign_id UUID,
  p_lead_ids UUID[]
) RETURNS INT AS $$
DECLARE
  inserted_count INT;
BEGIN
  INSERT INTO ninja.enrichment_jobs (campaign_id, lead_id)
  SELECT p_campaign_id, unnest(p_lead_ids)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Dequeue and claim next lead for enrichment (atomic, skip-locked)
CREATE OR REPLACE FUNCTION ninja.dequeue_and_claim_lead_enrichment(
  p_campaign_id UUID
) RETURNS SETOF ninja.enrichment_jobs AS $$
  UPDATE ninja.enrichment_jobs
  SET status = 'processing', updated_at = now()
  WHERE id = (
    SELECT id FROM ninja.enrichment_jobs
    WHERE campaign_id = p_campaign_id AND status = 'queued'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;

-- Acknowledge enrichment completion
CREATE OR REPLACE FUNCTION ninja.ack_lead_enrichment(
  p_job_id UUID,
  p_status TEXT DEFAULT 'done',
  p_error TEXT DEFAULT NULL
) RETURNS VOID AS $$
  UPDATE ninja.enrichment_jobs
  SET status = p_status, error = p_error, updated_at = now()
  WHERE id = p_job_id;
$$ LANGUAGE sql;

-- Purge completed/errored enrichment jobs for a campaign
CREATE OR REPLACE FUNCTION ninja.purge_lead_enrichment(
  p_campaign_id UUID
) RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM ninja.enrichment_jobs
  WHERE campaign_id = p_campaign_id AND status IN ('done', 'error');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Claim next pending bulk job (for Contabo worker)
CREATE OR REPLACE FUNCTION ninja.claim_next_bulk_job()
RETURNS SETOF ninja.bulk_jobs AS $$
  UPDATE ninja.bulk_jobs
  SET status = 'running', started_at = now()
  WHERE id = (
    SELECT id FROM ninja.bulk_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;

-- Grant execute on all functions
GRANT EXECUTE ON FUNCTION ninja.enqueue_lead_enrichment(UUID, UUID[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION ninja.dequeue_and_claim_lead_enrichment(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION ninja.ack_lead_enrichment(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION ninja.purge_lead_enrichment(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION ninja.claim_next_bulk_job() TO anon, authenticated, service_role;
