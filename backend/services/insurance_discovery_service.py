"""
Insurance Discovery Service (Stedi).

Finds a patient's active insurance coverage using only demographics
(name, DOB, gender, address). No member ID needed.

Modes:
  1. **Live** – calls Stedi Insurance Discovery API.
  2. **Simulated** – returns realistic mock data.
"""

import os
import logging
import random
import requests
from datetime import datetime, timedelta
from typing import Dict, Optional, List

log = logging.getLogger(__name__)

STEDI_DISCOVERY_URL = (
    "https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/"
    "insurancediscovery/v2"
)


class InsuranceDiscoveryService:
    """Discover patient insurance via Stedi or simulation."""

    def __init__(self):
        self._api_key: Optional[str] = os.getenv("STEDI_API_KEY")
        self._provider_npi: str = os.getenv("STEDI_PROVIDER_NPI", "1234567893")
        self._provider_org: str = os.getenv("STEDI_PROVIDER_ORG", "MedEase Health")

    @property
    def is_live(self) -> bool:
        return bool(self._api_key)

    def set_api_key(self, key: str):
        self._api_key = key if key else None

    def set_provider_info(self, npi: str = None, org: str = None):
        if npi:
            self._provider_npi = npi
        if org:
            self._provider_org = org

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def discover(
        self,
        first_name: str,
        last_name: str,
        date_of_birth: str,
        gender: str = "U",
        address1: str = "",
        city: str = "",
        state: str = "",
        postal_code: str = "",
        npi: str = None,
    ) -> Dict:
        """
        Search for active insurance coverage for a patient.
        Returns list of discovered coverages.
        """
        if self._api_key:
            try:
                return self._discover_via_stedi(
                    first_name=first_name,
                    last_name=last_name,
                    date_of_birth=date_of_birth,
                    gender=gender,
                    address1=address1,
                    city=city,
                    state=state,
                    postal_code=postal_code,
                    npi=npi,
                )
            except Exception as exc:
                log.warning("Stedi insurance discovery failed: %s", exc)
                result = self._simulate(first_name, last_name)
                result["_source"] = "simulated_fallback"
                result["_error"] = str(exc)
                return result
        result = self._simulate(first_name, last_name)
        result["_source"] = "simulated"
        return result

    def get_status(self) -> Dict:
        return {
            "mode": "live" if self.is_live else "simulated",
            "api_key_set": bool(self._api_key),
        }

    # ------------------------------------------------------------------
    # Stedi live implementation
    # ------------------------------------------------------------------

    def _discover_via_stedi(self, **kwargs) -> Dict:
        """Call Stedi Insurance Discovery API."""
        dob = kwargs["date_of_birth"].replace("-", "")

        payload = {
            "provider": {
                "npi": kwargs.get("npi") or self._provider_npi,
                "organizationName": self._provider_org,
            },
            "patient": {
                "firstName": kwargs["first_name"],
                "lastName": kwargs["last_name"],
                "dateOfBirth": dob,
                "gender": kwargs.get("gender", "U"),
            },
        }

        # Add address if provided
        addr = {}
        if kwargs.get("address1"):
            addr["address1"] = kwargs["address1"]
        if kwargs.get("city"):
            addr["city"] = kwargs["city"]
        if kwargs.get("state"):
            addr["state"] = kwargs["state"]
        if kwargs.get("postal_code"):
            addr["postalCode"] = kwargs["postal_code"]
        if addr:
            payload["patient"]["address"] = addr

        resp = requests.post(
            STEDI_DISCOVERY_URL,
            json=payload,
            headers={
                "Authorization": self._api_key,
                "Content-Type": "application/json",
            },
            timeout=30,
        )

        if not resp.ok:
            try:
                err = resp.json()
            except Exception:
                err = resp.text
            log.warning("Stedi discovery %d: %s", resp.status_code, err)
            raise ValueError(f"Stedi Discovery {resp.status_code}: {err}")

        data = resp.json()
        return self._parse_discovery_response(data)

    def _parse_discovery_response(self, data: Dict) -> Dict:
        """Parse Stedi insurance discovery response."""
        coverages = []
        for coverage in data.get("coverages", []):
            payer = coverage.get("payer", {})
            plan = coverage.get("plan", {})
            subscriber = coverage.get("subscriber", {})

            coverages.append({
                "payer_name": payer.get("payerName", ""),
                "payer_id": payer.get("payerId", ""),
                "plan_name": plan.get("planName", ""),
                "plan_type": plan.get("planType", ""),
                "member_id": subscriber.get("memberId", ""),
                "group_number": plan.get("groupNumber", ""),
                "group_name": plan.get("groupName", ""),
                "coverage_status": coverage.get("status", ""),
                "effective_date": coverage.get("effectiveDate", ""),
                "termination_date": coverage.get("terminationDate", ""),
                "relationship": coverage.get("relationshipCode", ""),
                "subscriber_name": f"{subscriber.get('firstName', '')} {subscriber.get('lastName', '')}".strip(),
            })

        return {
            "_source": "stedi_live",
            "coverages": coverages,
            "count": len(coverages),
            "searched_at": datetime.now().isoformat(),
        }

    # ------------------------------------------------------------------
    # Simulation
    # ------------------------------------------------------------------

    def _simulate(self, first_name: str, last_name: str) -> Dict:
        """Return simulated insurance discovery results."""
        payers = [
            ("Aetna", "60054", "Aetna Choice POS II", "PPO"),
            ("Blue Cross Blue Shield", "84980", "BCBS PPO", "PPO"),
            ("Cigna", "62308", "Cigna Open Access Plus", "PPO"),
            ("United Healthcare", "87726", "UHC Navigate", "HMO"),
            ("Humana", "61101", "Humana Gold Plus", "HMO"),
        ]

        num_coverages = random.randint(0, 3)
        if num_coverages == 0 and random.random() < 0.7:
            num_coverages = 1  # Usually find at least one

        selected = random.sample(payers, min(num_coverages, len(payers)))
        coverages = []
        for payer_name, payer_id, plan_name, plan_type in selected:
            eff = datetime.now() - timedelta(days=random.randint(30, 730))
            coverages.append({
                "payer_name": payer_name,
                "payer_id": payer_id,
                "plan_name": plan_name,
                "plan_type": plan_type,
                "member_id": f"MBR{random.randint(100000, 999999)}",
                "group_number": f"GRP{random.randint(1000, 9999)}",
                "group_name": "Employer Group",
                "coverage_status": "active",
                "effective_date": eff.strftime("%Y-%m-%d"),
                "termination_date": (eff + timedelta(days=365)).strftime("%Y-%m-%d"),
                "relationship": "self",
                "subscriber_name": f"{first_name} {last_name}",
            })

        return {
            "coverages": coverages,
            "count": len(coverages),
            "searched_at": datetime.now().isoformat(),
        }


# Singleton
insurance_discovery_service = InsuranceDiscoveryService()
