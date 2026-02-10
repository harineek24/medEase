"""
Eligibility Verification Service.

Supports two modes:
  1. **Live** – calls the Stedi Healthcare Eligibility API (EDI 270/271 over REST/JSON).
     Requires STEDI_API_KEY env var.  Free sandbox + 100 free prod txns/month.
     Sign up: https://www.stedi.com
  2. **Simulated** – returns realistic randomised data from hardcoded payer profiles.
     Used automatically when no API key is configured.

The return dict shape is identical in both modes so the frontend needs zero changes.
"""

import os
import random
import logging
import requests
from datetime import datetime, timedelta
from typing import Dict, Optional

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Simulated payer profiles (fallback when no API key)
# ---------------------------------------------------------------------------
PAYER_PROFILES = {
    "Aetna": {
        "plan_names": ["Aetna Choice POS II", "Aetna Open Access HMO", "Aetna PPO"],
        "copay_range": (20, 50),
        "deductible_range": (500, 3000),
        "coinsurance": [80, 70, 90],
        "oop_max_range": (4000, 8000),
        "stedi_payer_id": "60054",
    },
    "Blue Cross": {
        "plan_names": ["Blue Cross PPO", "Blue Shield HMO", "Blue Cross Bronze"],
        "copay_range": (15, 45),
        "deductible_range": (500, 5000),
        "coinsurance": [80, 70, 60],
        "oop_max_range": (5000, 10000),
        "stedi_payer_id": "BCBS1",
    },
    "Cigna": {
        "plan_names": ["Cigna Connect", "Cigna Open Access Plus", "Cigna PPO"],
        "copay_range": (25, 60),
        "deductible_range": (1000, 4000),
        "coinsurance": [80, 70, 90],
        "oop_max_range": (5000, 9000),
        "stedi_payer_id": "62308",
    },
    "United Healthcare": {
        "plan_names": ["UHC Choice Plus", "UHC Navigate", "UHC Options PPO"],
        "copay_range": (20, 55),
        "deductible_range": (750, 3500),
        "coinsurance": [80, 70, 85],
        "oop_max_range": (4500, 8500),
        "stedi_payer_id": "87726",
    },
    "Kaiser": {
        "plan_names": ["Kaiser HMO", "Kaiser Platinum HMO", "Kaiser Gold HMO"],
        "copay_range": (10, 35),
        "deductible_range": (0, 1500),
        "coinsurance": [90, 80, 100],
        "oop_max_range": (3000, 6000),
        "stedi_payer_id": "94135",
    },
    "Humana": {
        "plan_names": ["Humana Gold Plus", "Humana PPO", "Humana HMO"],
        "copay_range": (20, 50),
        "deductible_range": (500, 3000),
        "coinsurance": [80, 70, 85],
        "oop_max_range": (4000, 7500),
        "stedi_payer_id": "61101",
    },
    "Medicaid": {
        "plan_names": ["Medi-Cal", "Medi-Cal Managed Care"],
        "copay_range": (0, 5),
        "deductible_range": (0, 0),
        "coinsurance": [100],
        "oop_max_range": (0, 0),
        "stedi_payer_id": "CAIDM",
    },
}

# Stedi API endpoint
STEDI_ELIGIBILITY_URL = "https://healthcare.us.stedi.com/2024-04-01/change/medicaleligibility/v3"


class EligibilityService:
    """Eligibility verification via Stedi API with simulated fallback."""

    def __init__(self):
        self._api_key: Optional[str] = os.getenv("STEDI_API_KEY")
        # Provider NPI is needed for real calls – configurable via env
        self._provider_npi: str = os.getenv("STEDI_PROVIDER_NPI", "1234567893")
        self._provider_name: str = os.getenv("STEDI_PROVIDER_NAME", "MedEase Clinic")
        self._provider_org_name: str = os.getenv("STEDI_PROVIDER_ORG", "MedEase Health")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def is_live(self) -> bool:
        return bool(self._api_key)

    def set_api_key(self, key: str):
        """Allow runtime update of the Stedi API key (e.g. via admin settings)."""
        self._api_key = key if key else None

    def set_provider_info(self, npi: str = None, name: str = None, org: str = None):
        if npi:
            self._provider_npi = npi
        if name:
            self._provider_name = name
        if org:
            self._provider_org_name = org

    def verify_eligibility(
        self,
        patient_name: str,
        payer_name: str,
        policy_number: str = None,
        date_of_service: str = None,
    ) -> Dict:
        """
        Run an eligibility check.  Uses Stedi when an API key is set,
        otherwise falls back to simulated data.
        """
        if self._api_key:
            try:
                return self._verify_via_stedi(
                    patient_name=patient_name,
                    payer_name=payer_name,
                    policy_number=policy_number,
                    date_of_service=date_of_service,
                )
            except Exception as exc:
                log.warning("Stedi API call failed, falling back to simulation: %s", exc)
                result = self._simulate(patient_name, payer_name)
                result["_source"] = "simulated_fallback"
                result["_error"] = str(exc)
                return result
        else:
            result = self._simulate(patient_name, payer_name)
            result["_source"] = "simulated"
            return result

    def get_status(self) -> Dict:
        """Return current configuration status (safe to expose, no secrets)."""
        return {
            "mode": "live" if self.is_live else "simulated",
            "api_key_set": bool(self._api_key),
            "provider_npi": self._provider_npi,
            "provider_name": self._provider_name,
            "provider_org": self._provider_org_name,
        }

    # ------------------------------------------------------------------
    # Stedi live implementation
    # ------------------------------------------------------------------

    def _verify_via_stedi(
        self,
        patient_name: str,
        payer_name: str,
        policy_number: str = None,
        date_of_service: str = None,
    ) -> Dict:
        """Call Stedi Healthcare Eligibility API (270/271)."""

        # Resolve payer ID
        profile = PAYER_PROFILES.get(payer_name, {})
        payer_id = profile.get("stedi_payer_id", payer_name)

        # Split patient name
        parts = patient_name.strip().split()
        first_name = parts[0] if parts else "Unknown"
        last_name = parts[-1] if len(parts) > 1 else "Unknown"

        dos = date_of_service or datetime.now().strftime("%Y-%m-%d")

        # Build the Stedi 270 request
        payload = {
            "controlNumber": f"MEDEASE{int(datetime.now().timestamp())}",
            "tradingPartnerServiceId": payer_id,
            "provider": {
                "organizationName": self._provider_org_name,
                "npi": self._provider_npi,
            },
            "subscriber": {
                "memberId": policy_number or "",
                "firstName": first_name,
                "lastName": last_name,
                "dateOfBirth": "",  # Would be populated from patient record in production
            },
            "encounter": {
                "serviceTypeCodes": ["30"],  # 30 = Health Benefit Plan Coverage
                "dateRange": {
                    "startDate": dos,
                    "endDate": dos,
                },
            },
        }

        headers = {
            "Authorization": f"Key {self._api_key}",
            "Content-Type": "application/json",
        }

        resp = requests.post(
            STEDI_ELIGIBILITY_URL,
            json=payload,
            headers=headers,
            timeout=30,
        )

        if resp.status_code == 401:
            raise ValueError("Invalid Stedi API key")
        if resp.status_code == 404:
            raise ValueError(f"Payer '{payer_name}' (ID: {payer_id}) not found on Stedi")

        resp.raise_for_status()
        data = resp.json()

        return self._parse_stedi_response(data, payer_name)

    def _parse_stedi_response(self, data: Dict, payer_name: str) -> Dict:
        """
        Parse Stedi's 271 JSON response into our standard result format.
        The Stedi response structure follows the X12 271 layout.
        """
        now = datetime.now().isoformat()

        # Check for plan status (active/inactive)
        plan_status = data.get("planStatus", [])
        plan_date_info = data.get("planDateInformation", {})

        # Determine eligibility from planStatus
        is_eligible = False
        coverage_type = None
        plan_name = None
        denial_reason = None

        for status in plan_status:
            status_code = status.get("statusCode", "")
            if status_code == "1":  # Active Coverage
                is_eligible = True
                plan_name = status.get("planDetails", status.get("groupDescription", ""))
                coverage_type = status.get("insuranceTypeCode", "")
            elif status_code == "6":  # Inactive
                denial_reason = "Coverage inactive"
            elif status_code == "7":  # Unavailable
                denial_reason = "Coverage unavailable – contact payer"

        # If no planStatus, check top-level
        if not plan_status:
            # Check subscriber info
            subscriber = data.get("subscriber", {})
            if subscriber:
                is_eligible = True
                plan_name = data.get("planInformation", {}).get("planName", payer_name + " Plan")

        # Extract benefits info
        benefits = data.get("benefitsInformation", [])
        copay = None
        deductible = None
        deductible_met = None
        coinsurance = None
        oop_max = None
        oop_met = None

        for b in benefits:
            code = b.get("code", "")
            amount = b.get("benefitAmount")
            percent = b.get("benefitPercent")
            time_qualifier = b.get("timeQualifierCode", "")
            in_network = b.get("inPlanNetworkIndicatorCode", "") == "Y"

            if amount:
                try:
                    amount = float(amount)
                except (ValueError, TypeError):
                    amount = None

            if percent:
                try:
                    percent = float(percent)
                except (ValueError, TypeError):
                    percent = None

            # B = Co-Payment
            if code == "B" and amount is not None and copay is None:
                copay = amount

            # C = Deductible
            if code == "C" and time_qualifier == "23":  # Calendar Year
                if amount is not None:
                    if b.get("coverageLevelCode") == "IND":
                        deductible = amount

            # A = Co-Insurance
            if code == "A" and percent is not None and coinsurance is None:
                coinsurance = percent * 100 if percent <= 1 else percent

            # G = Out of Pocket Maximum
            if code == "G" and time_qualifier == "23":
                if amount is not None and oop_max is None:
                    oop_max = amount

            # Remaining deductible
            if code == "C" and b.get("quantityQualifierCode") == "LA":
                if amount is not None:
                    deductible_met = (deductible or 0) - amount if deductible else None

        # Dates
        effective_date = plan_date_info.get("planBegin", None)
        termination_date = plan_date_info.get("planEnd", None)

        # Check for errors in the response
        errors = data.get("errors", [])
        if errors and not is_eligible:
            denial_reason = "; ".join(e.get("description", str(e)) for e in errors)

        result = {
            "is_eligible": is_eligible,
            "coverage_type": coverage_type,
            "plan_name": plan_name,
            "copay": copay,
            "deductible": deductible,
            "deductible_met": deductible_met,
            "coinsurance_percent": coinsurance,
            "out_of_pocket_max": oop_max,
            "out_of_pocket_met": oop_met,
            "effective_date": effective_date,
            "termination_date": termination_date,
            "denial_reason": denial_reason,
            "checked_at": now,
            "_source": "stedi_live",
        }
        return result

    # ------------------------------------------------------------------
    # Simulation (unchanged from original)
    # ------------------------------------------------------------------

    def _simulate(self, patient_name: str, payer_name: str) -> Dict:
        """Return simulated eligibility data from hardcoded payer profiles."""
        profile = PAYER_PROFILES.get(payer_name)
        if not profile:
            profile = {
                "plan_names": [f"{payer_name} Standard Plan"],
                "copay_range": (20, 50),
                "deductible_range": (500, 3000),
                "coinsurance": [80],
                "oop_max_range": (4000, 8000),
            }

        # 90% chance of being eligible
        is_eligible = random.random() < 0.90

        if not is_eligible:
            return {
                "is_eligible": False,
                "coverage_type": None,
                "plan_name": None,
                "copay": None,
                "deductible": None,
                "deductible_met": None,
                "coinsurance_percent": None,
                "out_of_pocket_max": None,
                "out_of_pocket_met": None,
                "effective_date": None,
                "termination_date": None,
                "denial_reason": random.choice([
                    "Policy terminated",
                    "Coverage not active on date of service",
                    "Member not found in payer system",
                    "Policy number mismatch",
                ]),
                "checked_at": datetime.now().isoformat(),
            }

        plan = random.choice(profile["plan_names"])
        copay = random.randint(*profile["copay_range"])
        deductible = random.randint(*profile["deductible_range"])
        deductible_met = round(random.uniform(0, deductible), 2)
        coinsurance = random.choice(profile["coinsurance"])
        oop_max = random.randint(*profile["oop_max_range"])
        oop_met = round(random.uniform(0, oop_max * 0.6), 2)

        eff_date = datetime.now() - timedelta(days=random.randint(30, 365))
        term_date = eff_date + timedelta(days=365)

        coverage_types = ["HMO", "PPO", "EPO", "POS"]

        return {
            "is_eligible": True,
            "coverage_type": random.choice(coverage_types),
            "plan_name": plan,
            "copay": copay,
            "deductible": deductible,
            "deductible_met": deductible_met,
            "coinsurance_percent": coinsurance,
            "out_of_pocket_max": oop_max,
            "out_of_pocket_met": oop_met,
            "effective_date": eff_date.strftime("%Y-%m-%d"),
            "termination_date": term_date.strftime("%Y-%m-%d"),
            "denial_reason": None,
            "checked_at": datetime.now().isoformat(),
        }


# Singleton
eligibility_service = EligibilityService()
