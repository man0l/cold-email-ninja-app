"""
Base class for Contabo Python workers.
All workers read from ninja.bulk_jobs and write results to ninja.leads.
Replaces Google Sheets I/O with Supabase.
"""

import os
import time
import logging
from typing import Any, Dict, List, Optional

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class SupabaseWorkerBase:
    """Base class for all worker scripts that process bulk_jobs."""

    def __init__(self, job_data: Dict[str, Any], supabase_client: Client):
        self.job_id = job_data["id"]
        self.campaign_id = job_data.get("campaign_id")
        self.config = job_data.get("config", {})
        self.db = supabase_client
        self._total = 0
        self._processed = 0

    def update_progress(self, processed: int, total: int, **extra):
        """Update job progress (visible via Realtime in mobile app)."""
        self._processed = processed
        self._total = total
        self.db.from_("bulk_jobs").update({
            "progress": {"processed": processed, "total": total, **extra}
        }).eq("id", self.job_id).execute()

    def write_leads(self, campaign_id: str, leads_batch: List[Dict[str, Any]]):
        """Upsert a batch of leads into the ninja.leads table."""
        rows = [{"campaign_id": campaign_id, **lead} for lead in leads_batch]
        self.db.from_("leads").upsert(
            rows,
            on_conflict="campaign_id,email"
        ).execute()

    def write_leads_no_conflict(self, campaign_id: str, leads_batch: List[Dict[str, Any]]):
        """Insert leads without conflict resolution (for leads without email yet)."""
        rows = [{"campaign_id": campaign_id, **lead} for lead in leads_batch]
        self.db.from_("leads").insert(rows).execute()

    def update_lead(self, lead_id: str, updates: Dict[str, Any]):
        """Update a single lead."""
        self.db.from_("leads").update(updates).eq("id", lead_id).execute()

    def get_leads(self, campaign_id: str, filters: Optional[Dict] = None,
                  limit: int = 1000) -> List[Dict]:
        """Fetch leads for processing."""
        query = self.db.from_("leads").select("*").eq(
            "campaign_id", campaign_id
        ).limit(limit)

        if filters:
            for key, value in filters.items():
                if value is None:
                    query = query.is_(key, "null")
                else:
                    query = query.eq(key, value)

        result = query.execute()
        return result.data or []

    def get_api_key(self, service: str) -> Optional[str]:
        """Get API key from ninja.api_keys table, fallback to env var."""
        try:
            result = self.db.from_("api_keys").select("api_key").eq(
                "service", service
            ).single().execute()
            if result.data:
                return result.data["api_key"]
        except Exception:
            pass

        # Fallback to environment variable
        env_map = {
            "openai": "OPENAI_API_KEY",
            "openwebninja": "OPENWEBNINJA_API_KEY",
            "anymail": "ANYMAIL_FINDER_API_KEY",
            "rapidapi_maps": "RAPIDAPI_MAPS_DATA_API_KEY",
            "rapidapi_linkedin": "RAPIDAPI_LI_DATA_SCRAPER_KEY",
            "dataforseo": "DATAFORSEO_USERNAME",
        }
        env_key = env_map.get(service, "")
        return os.getenv(env_key)

    def complete(self, result: Dict[str, Any] = None):
        """Mark job as completed."""
        self.db.from_("bulk_jobs").update({
            "status": "completed",
            "completed_at": "now()",
            "result": result or {"processed": self._processed, "total": self._total},
            "progress": {"processed": self._processed, "total": self._total},
        }).eq("id", self.job_id).execute()
        logger.info(f"Job {self.job_id} completed: {self._processed}/{self._total}")

    def fail(self, error: str):
        """Mark job as failed."""
        self.db.from_("bulk_jobs").update({
            "status": "failed",
            "error": str(error)[:2000],
            "completed_at": "now()",
        }).eq("id", self.job_id).execute()
        logger.error(f"Job {self.job_id} failed: {error}")

    def run(self):
        """Override this method in subclasses."""
        raise NotImplementedError("Subclasses must implement run()")


def get_supabase_client() -> Client:
    """Create a Supabase client configured for the ninja schema."""
    url = os.getenv("SUPABASE_URL", "https://api.zenmanager.eu")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    schema = os.getenv("WORKER_SCHEMA", "ninja")

    from supabase.lib.client_options import SyncClientOptions
    client = create_client(
        url, key,
        options=SyncClientOptions(schema=schema)
    )
    return client
