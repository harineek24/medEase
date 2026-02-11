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
        "stedi_payer_id": "84980",  # BCBS of Texas – BCBS is regional, change to your state's ID
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
        "stedi_payer_id": "CMS",  # Federal CMS/HETS for Medicare & Medicaid
    },
}

# Stedi API endpoints
STEDI_ELIGIBILITY_URL = "https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3"
STEDI_PAYER_SEARCH_URL = "https://healthcare.us.stedi.com/2024-04-01/payers/search"

# Stedi sandbox mock test cases — test keys ONLY accept these exact values.
# From https://www.stedi.com/docs/healthcare/api-reference/mock-requests-eligibility-checks
STEDI_MOCK_CASES = {
    # Subscriber-only test cases
    "60054": {  # Aetna
        "tradingPartnerServiceId": "60054",
        "provider": {"organizationName": "Provider Name", "npi": "1999999984"},
        "subscriber": {"firstName": "Jane", "lastName": "Doe", "dateOfBirth": "20040404", "memberId": "AETNA12345"},
        "encounter": {"serviceTypeCodes": ["30"]},
    },
    "G84980": {  # BCBS of Texas (sandbox uses G84980, not 84980)
        "tradingPartnerServiceId": "G84980",
        "provider": {"organizationName": "Provider Name", "npi": "1999999984"},
        "subscriber": {"firstName": "John", "lastName": "Doe", "memberId": "A2CBCBSTX123"},
        "dependents": [{"firstName": "Jane", "lastName": "Doe", "dateOfBirth": "20150101"}],
        "encounter": {"serviceTypeCodes": ["30"]},
    },
    "62308": {  # Cigna
        "tradingPartnerServiceId": "62308",
        "provider": {"organizationName": "Provider Name", "npi": "1999999984"},
        "subscriber": {"firstName": "John", "lastName": "Doe", "memberId": "CIGNAJTUxNm"},
        "dependents": [{"firstName": "Jordan", "lastName": "Doe", "dateOfBirth": "20150920"}],
        "encounter": {"serviceTypeCodes": ["30"]},
    },
    "87726": {  # UnitedHealthcare
        "tradingPartnerServiceId": "87726",
        "provider": {"organizationName": "Provider Name", "npi": "1999999984"},
        "subscriber": {"firstName": "John", "lastName": "Doe", "memberId": "UHC202649"},
        "dependents": [{"firstName": "Jane", "lastName": "Doe", "dateOfBirth": "19521121"}],
        "encounter": {"serviceTypeCodes": ["30"]},
    },
    "68069": {  # Ambetter
        "tradingPartnerServiceId": "68069",
        "provider": {"organizationName": "Provider Name", "npi": "1999999984"},
        "subscriber": {"firstName": "John", "lastName": "Doe", "dateOfBirth": "19940404", "memberId": "AMBETTER123"},
        "encounter": {"serviceTypeCodes": ["30"]},
    },
    "040": {  # Anthem BCBS CA
        "tradingPartnerServiceId": "040",
        "provider": {"organizationName": "Provider Name", "npi": "1999999984"},
        "subscriber": {"firstName": "Jane", "lastName": "Doe", "memberId": "CGMBCBSCA123"},
        "dependents": [{"firstName": "John", "lastName": "Doe", "dateOfBirth": "19750101"}],
        "encounter": {"serviceTypeCodes": ["30"]},
    },
    "OSCAR": {  # Oscar Health
        "tradingPartnerServiceId": "OSCAR",
        "provider": {"organizationName": "Provider Name", "npi": "1999999984"},
        "subscriber": {"firstName": "John", "lastName": "Doe", "memberId": "OSCAR123456"},
        "dependents": [{"firstName": "Jane", "lastName": "Doe", "dateOfBirth": "20010101"}],
        "encounter": {"serviceTypeCodes": ["30"]},
    },
    # Generic test case (for Test Connection)
    "AHS": {
        "tradingPartnerServiceId": "AHS",
        "provider": {"npi": "1999999984", "organizationName": "ACME Health Services"},
        "subscriber": {"dateOfBirth": "19000101", "firstName": "Jane", "lastName": "Doe", "memberId": "123456789"},
        "encounter": {"serviceTypeCodes": ["MH"]},
    },
}

# Map our payer names to sandbox mock case keys
PAYER_TO_MOCK_KEY = {
    "Aetna": "60054",
    "Blue Cross": "G84980",
    "Cigna": "62308",
    "United Healthcare": "87726",
    "Kaiser": None,       # No sandbox mock available
    "Humana": None,       # No sandbox mock available
    "Medicaid": None,     # No sandbox mock available
}


class EligibilityService:
    """Eligibility verification via Stedi API with simulated fallback."""

    def __init__(self):
        self._api_key: Optional[str] = os.getenv("STEDI_API_KEY")
        self._is_sandbox: Optional[bool] = None  # detected on first test
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
        self._is_sandbox = None  # reset detection

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
        is_sandbox = self._is_sandbox
        if self.is_live and is_sandbox is True:
            note = ("Sandbox mode — using Stedi mock test data. "
                    "Supported payers: Aetna, Blue Cross (TX), Cigna, United Healthcare. "
                    "For real patient lookups, switch to a production API key.")
        elif self.is_live and is_sandbox is False:
            note = "Production mode — real-time eligibility checks enabled."
        elif self.is_live:
            note = "API key set. Click 'Test Connection' in Settings to detect sandbox vs production mode."
        else:
            note = "Add a Stedi API key to enable live eligibility checks."
        return {
            "mode": "live" if self.is_live else "simulated",
            "is_sandbox": is_sandbox,
            "api_key_set": bool(self._api_key),
            "provider_npi": self._provider_npi,
            "provider_name": self._provider_name,
            "provider_org": self._provider_org_name,
            "note": note,
        }

    def search_payers(self, query: str) -> list:
        """Search Stedi's payer directory. Requires an API key."""
        if not self._api_key:
            return []
        try:
            resp = requests.get(
                STEDI_PAYER_SEARCH_URL,
                params={"query": query},
                headers={"Authorization": self._api_key},
                timeout=15,
            )
            if not resp.ok:
                log.warning("Stedi payer search %d: %s", resp.status_code, resp.text[:200])
                return []
            data = resp.json()
            results = []
            for p in data.get("payers", []):
                results.append({
                    "stedi_id": p.get("stediId", ""),
                    "name": p.get("payerName", ""),
                    "payer_id": p.get("primaryPayerId", ""),
                    "aliases": p.get("aliases", [])[:5],
                })
            return results
        except Exception as exc:
            log.warning("Stedi payer search failed: %s", exc)
            return []

    def test_connection(self) -> Dict:
        """
        Send a known-good mock request to verify the Stedi API key works.
        Uses Stedi's predefined sandbox test case.  Also detects sandbox vs production.
        """
        if not self._api_key:
            return {"success": False, "error": "No API key configured"}

        try:
            mock_case = STEDI_MOCK_CASES["AHS"]
            resp = requests.post(
                STEDI_ELIGIBILITY_URL,
                json=mock_case,
                headers={
                    "Authorization": self._api_key,
                    "Content-Type": "application/json",
                },
                timeout=30,
            )
            if resp.ok:
                data = resp.json()
                # Mock request succeeded → this is a sandbox/test key
                self._is_sandbox = True
                return {
                    "success": True,
                    "is_sandbox": True,
                    "message": "API key is valid (sandbox/test mode). Use mock payers like Aetna, BCBS TX, Cigna, or UHC to test.",
                    "response_status": data.get("status"),
                }
            elif resp.status_code == 400:
                # Mock request got 400 → likely a production key (mock cases rejected)
                self._is_sandbox = False
                return {
                    "success": True,
                    "is_sandbox": False,
                    "message": "API key is valid (production mode). Real patient eligibility checks are enabled.",
                }
            else:
                try:
                    err = resp.json()
                except Exception:
                    err = resp.text
                return {"success": False, "error": f"Stedi returned {resp.status_code}", "details": err}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

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

        # Check if we should use a sandbox mock case
        mock_key = PAYER_TO_MOCK_KEY.get(payer_name)
        use_sandbox = self._is_sandbox is True or (self._is_sandbox is None)

        if use_sandbox and mock_key and mock_key in STEDI_MOCK_CASES:
            # Use the predefined mock case for this payer
            payload = STEDI_MOCK_CASES[mock_key]
            log.info("Stedi sandbox request for %s using mock case %s", payer_name, mock_key)
        elif use_sandbox and mock_key is None:
            # No mock case for this payer in sandbox
            raise ValueError(
                f"No sandbox test case for '{payer_name}'. "
                f"In sandbox mode, try: Aetna, Blue Cross, Cigna, or United Healthcare."
            )
        else:
            # Production mode — build real request
            profile = PAYER_PROFILES.get(payer_name, {})
            payer_id = profile.get("stedi_payer_id", payer_name)

            parts = patient_name.strip().split()
            first_name = parts[0] if parts else "Unknown"
            last_name = parts[-1] if len(parts) > 1 else "Unknown"

            if date_of_service:
                dos = date_of_service.replace("-", "")
            else:
                dos = datetime.now().strftime("%Y%m%d")

            subscriber = {
                "firstName": first_name,
                "lastName": last_name,
            }
            if policy_number:
                subscriber["memberId"] = policy_number

            encounter: Dict = {
                "serviceTypeCodes": ["30"],
            }
            if dos:
                encounter["beginningDateOfService"] = dos
                encounter["endDateOfService"] = dos

            payload = {
                "tradingPartnerServiceId": payer_id,
                "provider": {
                    "organizationName": self._provider_org_name,
                    "npi": self._provider_npi,
                },
                "subscriber": subscriber,
                "encounter": encounter,
            }
            log.info("Stedi production request to %s: %s", payer_id, payload)

        headers = {
            "Authorization": self._api_key,
            "Content-Type": "application/json",
        }

        resp = requests.post(
            STEDI_ELIGIBILITY_URL,
            json=payload,
            headers=headers,
            timeout=30,
        )

        # Include the response body in errors for debugging
        if not resp.ok:
            try:
                error_body = resp.json()
            except Exception:
                error_body = resp.text
            log.warning("Stedi API %d: %s", resp.status_code, error_body)

            # If this was a sandbox attempt that failed, auto-detect sandbox mode
            errors = error_body if isinstance(error_body, dict) else {}
            err_list = errors.get("errors", [])
            if err_list and "test case" in str(err_list).lower():
                self._is_sandbox = True

            raise ValueError(f"Stedi API {resp.status_code}: {error_body}")

        data = resp.json()

        # If sandbox mock case worked, mark as sandbox
        if mock_key and mock_key in STEDI_MOCK_CASES:
            self._is_sandbox = True

        result = self._parse_stedi_response(data, payer_name)
        if self._is_sandbox:
            result["_source"] = "stedi_sandbox"
        return result

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
