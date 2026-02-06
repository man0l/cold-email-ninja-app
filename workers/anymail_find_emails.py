"""
Worker: anymail_find_emails
Adapted from execution/anymail_find_emails.py
Finds decision maker email addresses using the Anymail Finder API.

Job config:
  - max_leads: max leads to process (default: 100)
  - include_existing: process leads with existing DM email (default: false)
  - decision_maker_categories: priority list (default: ['ceo', 'finance', 'sales'])
"""

import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests

from base import SupabaseWorkerBase

logger = logging.getLogger(__name__)

API_URL = "https://api.anymailfinder.com/v5.1/find-email/decision-maker"


class AnymailFindEmailsWorker(SupabaseWorkerBase):
    def run(self):
        max_leads = self.config.get("max_leads", 100)
        include_existing = self.config.get("include_existing", False)
        categories = self.config.get(
            "decision_maker_categories", ["ceo", "finance", "sales"]
        )

        api_key = self.get_api_key("anymail")
        if not api_key:
            self.fail("Anymail Finder API key not configured")
            return

        # Fetch leads needing DM email
        filters = {}
        if not include_existing:
            filters["decision_maker_email"] = None

        leads = self.get_leads(self.campaign_id, filters=filters, limit=max_leads)
        # Need website/domain to find email
        leads = [l for l in leads if l.get("company_website") or l.get("domain")]

        if not leads:
            self.complete({"processed": 0, "message": "No leads need DM email enrichment"})
            return

        logger.info(f"Processing {len(leads)} leads for Anymail email enrichment")
        self.update_progress(0, len(leads))

        processed = 0
        found = 0
        credits_used = 0

        for lead in leads:
            processed += 1
            website = lead.get("company_website") or lead.get("domain", "")

            # Extract domain
            domain = self._extract_domain(website)
            if not domain:
                continue

            company_name = lead.get("company_name", "")

            # Call Anymail Finder API
            result = self._find_email(api_key, domain, company_name, categories)

            if result and result.get("email"):
                updates = {
                    "decision_maker_email": result["email"],
                    "decision_maker_email_status": result.get("email_status", ""),
                }
                if result.get("name"):
                    updates["decision_maker_name"] = result["name"]
                if result.get("title"):
                    updates["decision_maker_title"] = result["title"]
                if result.get("linkedin"):
                    updates["decision_maker_linkedin"] = result["linkedin"]

                updates["enrichment_status"] = {
                    **(lead.get("enrichment_status") or {}),
                    "anymail_emails": "done",
                }

                self.update_lead(lead["id"], updates)
                found += 1

                # Valid emails cost 2 credits
                if result.get("email_status") in ("valid", "accept_all"):
                    credits_used += 2

            if processed % 10 == 0:
                self.update_progress(processed, len(leads),
                                     found=found, credits_used=credits_used)

        self.update_progress(processed, len(leads), found=found, credits_used=credits_used)
        self.complete({
            "processed": processed,
            "found": found,
            "credits_used": credits_used,
            "total": len(leads),
        })

    def _extract_domain(self, website: str) -> Optional[str]:
        """Extract root domain from website URL."""
        if not website:
            return None
        try:
            if not website.startswith("http"):
                website = f"http://{website}"
            parsed = urlparse(website)
            domain = parsed.netloc.replace("www.", "")
            return domain if domain else None
        except Exception:
            return None

    def _find_email(self, api_key: str, domain: str, company_name: str,
                    categories: List[str]) -> Optional[Dict]:
        """Call Anymail Finder API to find decision maker email."""
        headers = {"Authorization": f"Bearer {api_key}"}
        payload = {
            "domain": domain,
            "company_name": company_name,
            "decision_maker_category": categories,
        }

        try:
            resp = requests.post(API_URL, headers=headers, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            if data.get("email"):
                return {
                    "email": data["email"],
                    "email_status": data.get("email_status", ""),
                    "name": data.get("name", ""),
                    "title": data.get("title", ""),
                    "linkedin": data.get("linkedin", ""),
                }
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                logger.debug(f"No email found for {domain}")
            else:
                logger.warning(f"Anymail API error for {domain}: {e}")
        except Exception as e:
            logger.warning(f"Anymail error for {domain}: {e}")

        return None
