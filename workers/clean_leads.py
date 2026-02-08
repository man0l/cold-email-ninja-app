"""
Worker: clean_leads
Adapted from execution/clean_leads.py
Validates lead websites (HTTP 200) and optionally filters by category.
Updates lead records directly in ninja.leads via Supabase.

Job config:
  - categories: list of category filters (OR logic) (default: [])
  - max_leads: max leads to process (default: 1000)
  - workers: number of concurrent HTTP validation workers (default: 10)
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List
from urllib.parse import urlparse

import requests

from base import SupabaseWorkerBase

logger = logging.getLogger(__name__)


class CleanLeadsWorker(SupabaseWorkerBase):
    def run(self):
        categories = self.config.get("categories", [])
        max_leads = self.config.get("max_leads", 1000)
        workers = self.config.get("workers", 10)

        # Build category OR filter for SQL-level filtering (much faster than in-memory)
        or_filter = None
        if categories:
            conditions = [f"category.ilike.*{cat}*" for cat in categories]
            or_filter = ",".join(conditions)

        # Fetch leads with websites, filtered by category at SQL level
        # - not_null ensures only leads with company_website are fetched
        # - or_filter handles category matching in the DB query
        # - Pagination in get_leads handles large result sets (>5000 rows)
        leads = self.get_leads(
            self.campaign_id,
            limit=max_leads,
            not_null=["company_website"],
            or_filter=or_filter,
        )

        if not leads:
            self.complete({"processed": 0, "message": "No leads with websites found"})
            return

        if categories:
            logger.info(f"Category filter (SQL): {len(leads)} leads match {categories}")

        logger.info(f"Validating {len(leads)} lead websites with {workers} workers")
        self.update_progress(0, len(leads))

        processed = 0
        valid = 0
        invalid = 0

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {}
            for lead in leads:
                website = lead.get("company_website") or lead.get("domain", "")
                # Normalize to root domain
                website = self._normalize_url(website)
                future = executor.submit(self._validate_website, website)
                futures[future] = lead

            for future in as_completed(futures):
                lead = futures[future]
                processed += 1

                try:
                    is_valid = future.result()
                    if is_valid:
                        valid += 1
                        self.update_lead(lead["id"], {
                            "enrichment_status": {
                                **(lead.get("enrichment_status") or {}),
                                "website_validated": True,
                            },
                        })
                    else:
                        invalid += 1
                        self.update_lead(lead["id"], {
                            "enrichment_status": {
                                **(lead.get("enrichment_status") or {}),
                                "website_validated": False,
                            },
                        })
                except Exception as e:
                    logger.debug(f"Validation error: {e}")
                    invalid += 1

                if processed % 50 == 0:
                    self.update_progress(processed, len(leads),
                                         valid=valid, invalid=invalid)

        self.update_progress(processed, len(leads), valid=valid, invalid=invalid)
        self.complete({
            "processed": processed,
            "valid": valid,
            "invalid": invalid,
            "total": len(leads),
            "categories": categories,
        })

    def _normalize_url(self, url: str) -> str:
        """Normalize URL to root domain with protocol."""
        if not url:
            return ""
        if not url.startswith("http"):
            url = f"https://{url}"
        try:
            parsed = urlparse(url)
            return f"https://{parsed.netloc}"
        except Exception:
            return url

    def _validate_website(self, url: str) -> bool:
        """Check if a website returns HTTP 200."""
        if not url:
            return False
        try:
            # Try HEAD first (faster)
            resp = requests.head(url, timeout=10, allow_redirects=True,
                                 headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                return True

            # Fallback to GET (some servers don't support HEAD)
            if resp.status_code in (405, 403):
                resp = requests.get(url, timeout=10, allow_redirects=True,
                                    headers={"User-Agent": "Mozilla/5.0"})
                return resp.status_code == 200
        except Exception:
            pass
        return False
