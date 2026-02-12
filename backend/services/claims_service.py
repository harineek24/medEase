"""
Claims Submission & Status Service (Stedi 837P / 276-277).

Modes:
  1. **Live** – submits professional claims via Stedi's 837P JSON API and
     checks claim status via the 276/277 API.  Requires STEDI_API_KEY.
  2. **Simulated** – returns realistic mock responses when no key is set.

Uses the same API key / provider config as eligibility_service.
"""

import os
import logging
import requests
from datetime import datetime
from typing import Dict, Optional, List

log = logging.getLogger(__name__)

# Stedi API endpoints
STEDI_CLAIMS_URL = (
    "https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/"
    "professionalclaims/v3/submission"
)
STEDI_CLAIM_STATUS_URL = (
    "https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/"
    "professionalclaims/v3/claimstatus"
)


class ClaimsService:
    """Submit 837P claims and check 276/277 status via Stedi."""

    def __init__(self):
        self._api_key: Optional[str] = os.getenv("STEDI_API_KEY")
        self._provider_npi: str = os.getenv("STEDI_PROVIDER_NPI", "1234567893")
        self._provider_name: str = os.getenv("STEDI_PROVIDER_NAME", "MedEase Clinic")
        self._provider_org: str = os.getenv("STEDI_PROVIDER_ORG", "MedEase Health")
        self._provider_tax_id: str = os.getenv("STEDI_PROVIDER_TAX_ID", "123456789")

    # ------------------------------------------------------------------
    # Config helpers (shared with eligibility_service)
    # ------------------------------------------------------------------

    @property
    def is_live(self) -> bool:
        return bool(self._api_key)

    def set_api_key(self, key: str):
        self._api_key = key if key else None

    def set_provider_info(self, npi: str = None, name: str = None,
                          org: str = None, tax_id: str = None):
        if npi:
            self._provider_npi = npi
        if name:
            self._provider_name = name
        if org:
            self._provider_org = org
        if tax_id:
            self._provider_tax_id = tax_id

    # ------------------------------------------------------------------
    # Submit 837P Professional Claim
    # ------------------------------------------------------------------

    def submit_claim(self, claim: Dict) -> Dict:
        """
        Submit a professional claim (CMS-1500 / 837P).
        If Stedi key is set, sends via API; otherwise returns simulated response.
        """
        if self._api_key:
            try:
                return self._submit_via_stedi(claim)
            except Exception as exc:
                log.warning("Stedi claim submission failed: %s", exc)
                return {
                    "success": False,
                    "source": "stedi_error",
                    "error": str(exc),
                }
        return self._simulate_submission(claim)

    def _submit_via_stedi(self, claim: Dict) -> Dict:
        """Build and send 837P JSON to Stedi."""
        payload = self._build_837p_payload(claim)

        resp = requests.post(
            STEDI_CLAIMS_URL,
            json=payload,
            headers={
                "Authorization": self._api_key,
                "Content-Type": "application/json",
            },
            timeout=60,
        )

        if not resp.ok:
            try:
                err = resp.json()
            except Exception:
                err = resp.text
            log.warning("Stedi claims %d: %s", resp.status_code, err)
            return {
                "success": False,
                "source": "stedi_live",
                "status_code": resp.status_code,
                "error": str(err),
            }

        data = resp.json()
        return self._parse_submission_response(data)

    def _build_837p_payload(self, claim: Dict) -> Dict:
        """Convert our internal claim dict into Stedi 837P JSON format."""
        # Patient / subscriber info
        patient_name = claim.get("patient_name", "Unknown Patient")
        parts = patient_name.strip().split()
        first_name = parts[0] if parts else "Unknown"
        last_name = parts[-1] if len(parts) > 1 else "Unknown"

        # Insurance / payer
        insurance_name = claim.get("insurance_name", "")
        # Try to look up Stedi payer ID
        from services.eligibility_service import PAYER_PROFILES
        payer_id = insurance_name
        for name, profile in PAYER_PROFILES.items():
            if name.lower() in insurance_name.lower():
                payer_id = profile.get("stedi_payer_id", insurance_name)
                break

        # Date of service
        dos = claim.get("date_of_service", "")
        if dos:
            dos = dos.replace("-", "")
        else:
            dos = datetime.now().strftime("%Y%m%d")

        # Diagnosis codes
        diag_codes = []
        for code in (claim.get("diagnosis_codes", "") or "").split(","):
            code = code.strip()
            if code:
                diag_codes.append(code)

        diagnosis_list = []
        for i, code in enumerate(diag_codes[:12]):
            qualifier = "ABK" if i == 0 else "ABF"
            diagnosis_list.append({
                "diagnosisTypeCode": qualifier,
                "diagnosisCode": code.replace(".", ""),
            })

        # Service lines from claim_lines
        service_lines = []
        for line in claim.get("lines", []):
            service_line = {
                "serviceDate": dos,
                "professionalService": {
                    "procedureCode": line.get("cpt_code", "99213"),
                    "lineItemChargeAmount": str(
                        round(line.get("charge_amount", 0) * line.get("units", 1), 2)
                    ),
                    "measurementUnit": "UN",
                    "serviceUnitCount": str(line.get("units", 1)),
                    "compositeDiagnosisCodePointers": {
                        "diagnosisCodePointers": ["1"],
                    },
                },
                "placeOfServiceCode": claim.get("place_of_service", "11"),
            }
            if line.get("modifier"):
                service_line["professionalService"]["procedureModifiers"] = [
                    line["modifier"]
                ]
            service_lines.append(service_line)

        # If no service lines, create a default
        if not service_lines:
            service_lines.append({
                "serviceDate": dos,
                "professionalService": {
                    "procedureCode": "99213",
                    "lineItemChargeAmount": str(claim.get("total_charge", 0)),
                    "measurementUnit": "UN",
                    "serviceUnitCount": "1",
                    "compositeDiagnosisCodePointers": {
                        "diagnosisCodePointers": ["1"],
                    },
                },
                "placeOfServiceCode": claim.get("place_of_service", "11"),
            })

        if not diagnosis_list:
            diagnosis_list.append({
                "diagnosisTypeCode": "ABK",
                "diagnosisCode": "Z0000",
            })

        payload = {
            "tradingPartnerServiceId": payer_id,
            "submitter": {
                "organizationName": self._provider_org,
                "contactInformation": {
                    "name": self._provider_name,
                    "phoneNumber": "5555555555",
                },
            },
            "receiver": {
                "organizationName": insurance_name or payer_id,
            },
            "subscriber": {
                "memberId": claim.get("policy_number", ""),
                "paymentResponsibilityLevelCode": "P",
                "firstName": first_name,
                "lastName": last_name,
                "gender": "U",
                "address": {
                    "address1": "123 Main St",
                    "city": "Anytown",
                    "state": "TX",
                    "postalCode": "75001",
                },
            },
            "claimInformation": {
                "claimFilingCode": "CI",
                "patientControlNumber": claim.get("claim_number", "CLM-00000001"),
                "claimChargeAmount": str(claim.get("total_charge", 0)),
                "placeOfServiceCode": claim.get("place_of_service", "11"),
                "claimFrequencyCode": "1",
                "signatureIndicator": "Y",
                "planParticipationCode": "A",
                "releaseInformationCode": "Y",
                "benefitsAssignmentCertificationIndicator": "Y",
                "healthCareCodeInformation": diagnosis_list,
                "serviceFacilityLocation": {
                    "organizationName": self._provider_org,
                    "address": {
                        "address1": "123 Clinic Way",
                        "city": "Anytown",
                        "state": "TX",
                        "postalCode": "75001",
                    },
                },
                "serviceLines": service_lines,
            },
            "billing": {
                "providerType": "BillingProvider",
                "npi": self._provider_npi,
                "organizationName": self._provider_org,
                "address": {
                    "address1": "123 Clinic Way",
                    "city": "Anytown",
                    "state": "TX",
                    "postalCode": "75001",
                },
                "taxId": self._provider_tax_id,
            },
            "rendering": {
                "providerType": "RenderingProvider",
                "npi": self._provider_npi,
                "firstName": self._provider_name.split()[0] if self._provider_name else "Provider",
                "lastName": self._provider_name.split()[-1] if self._provider_name and len(self._provider_name.split()) > 1 else "Name",
            },
        }

        return payload

    def _parse_submission_response(self, data: Dict) -> Dict:
        """Parse Stedi's 837P submission response."""
        status = data.get("status", "unknown")
        claim_ref = data.get("claimReference", data.get("controlNumber", ""))

        return {
            "success": status.lower() in ("accepted", "success", "a"),
            "source": "stedi_live",
            "status": status,
            "claim_reference": claim_ref,
            "control_number": data.get("controlNumber", ""),
            "trading_partner": data.get("tradingPartnerServiceId", ""),
            "message": data.get("message", "Claim submitted successfully"),
            "raw_response": data,
        }

    def _simulate_submission(self, claim: Dict) -> Dict:
        """Return a simulated claim submission response."""
        import random
        import uuid
        control = f"CTL{uuid.uuid4().hex[:8].upper()}"
        return {
            "success": random.random() < 0.9,
            "source": "simulated",
            "status": "accepted" if random.random() < 0.9 else "rejected",
            "claim_reference": control,
            "control_number": control,
            "trading_partner": claim.get("insurance_name", "SIM-PAYER"),
            "message": "Claim accepted for processing (simulated)",
        }

    # ------------------------------------------------------------------
    # Claim Status Inquiry (276/277)
    # ------------------------------------------------------------------

    def check_claim_status(self, claim: Dict) -> Dict:
        """
        Check status of a submitted claim via 276/277.
        Uses Stedi if key set, otherwise simulated.
        """
        if self._api_key:
            try:
                return self._check_status_via_stedi(claim)
            except Exception as exc:
                log.warning("Stedi claim status failed: %s", exc)
                return {
                    "success": False,
                    "source": "stedi_error",
                    "error": str(exc),
                }
        return self._simulate_status(claim)

    def _check_status_via_stedi(self, claim: Dict) -> Dict:
        """Send 276 claim status inquiry to Stedi."""
        patient_name = claim.get("patient_name", "Unknown Patient")
        parts = patient_name.strip().split()
        first_name = parts[0] if parts else "Unknown"
        last_name = parts[-1] if len(parts) > 1 else "Unknown"

        insurance_name = claim.get("insurance_name", "")
        from services.eligibility_service import PAYER_PROFILES
        payer_id = insurance_name
        for name, profile in PAYER_PROFILES.items():
            if name.lower() in insurance_name.lower():
                payer_id = profile.get("stedi_payer_id", insurance_name)
                break

        dos = (claim.get("date_of_service", "") or "").replace("-", "")

        payload = {
            "tradingPartnerServiceId": payer_id,
            "provider": {
                "organizationName": self._provider_org,
                "npi": self._provider_npi,
            },
            "subscriber": {
                "firstName": first_name,
                "lastName": last_name,
                "memberId": claim.get("policy_number", ""),
            },
            "claimStatusTrackingNumber": claim.get("claim_number", ""),
            "tradingPartnerClaimNumber": claim.get("claim_number", ""),
            "referencedServiceDates": {
                "beginDate": dos,
                "endDate": dos,
            },
        }

        resp = requests.post(
            STEDI_CLAIM_STATUS_URL,
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
            return {
                "success": False,
                "source": "stedi_live",
                "status_code": resp.status_code,
                "error": str(err),
            }

        data = resp.json()
        return self._parse_status_response(data)

    def _parse_status_response(self, data: Dict) -> Dict:
        """Parse Stedi's 277 claim status response."""
        claims_info = data.get("claimStatusDetails", [])
        statuses = []
        for ci in claims_info:
            status_info = ci.get("claimStatusInformation", [])
            for si in status_info:
                statuses.append({
                    "category": si.get("statusCategoryCode", ""),
                    "category_description": si.get("statusCategoryCodeValue", ""),
                    "status_code": si.get("statusCode", ""),
                    "status_description": si.get("statusCodeValue", ""),
                    "effective_date": si.get("statusInformationEffectiveDate", ""),
                    "total_charge": si.get("totalClaimChargeAmount", ""),
                    "claim_payment_amount": si.get("claimPaymentAmount", ""),
                })

        overall_status = "unknown"
        overall_description = "Status not available"
        if statuses:
            cat = statuses[0].get("category", "")
            if cat in ("F1", "F2"):
                overall_status = "finalized"
                overall_description = "Claim finalized"
            elif cat in ("A0", "A1", "A2", "A3", "A4"):
                overall_status = "acknowledged"
                overall_description = "Claim acknowledged/received"
            elif cat == "P0":
                overall_status = "pending"
                overall_description = "Claim pending"
            elif cat in ("R0", "R1", "R2", "R3", "R4"):
                overall_status = "rejected"
                overall_description = "Claim rejected/returned"
            elif cat in ("E0", "E1", "E2"):
                overall_status = "error"
                overall_description = "Request error"
            else:
                overall_description = statuses[0].get("category_description", "")

        return {
            "success": True,
            "source": "stedi_live",
            "overall_status": overall_status,
            "overall_description": overall_description,
            "statuses": statuses,
            "payer_claim_number": data.get("payerClaimControlNumber", ""),
            "patient_account_number": data.get("patientAccountNumber", ""),
            "raw_response": data,
        }

    def _simulate_status(self, claim: Dict) -> Dict:
        """Return simulated claim status."""
        import random
        status = claim.get("status", "submitted")
        status_map = {
            "submitted": ("acknowledged", "Claim acknowledged by payer"),
            "acknowledged": ("pending", "Claim pending adjudication"),
            "adjudicated": ("finalized", "Claim finalized - payment issued"),
            "paid": ("finalized", "Claim paid"),
            "denied": ("rejected", "Claim denied"),
        }
        simulated = status_map.get(status, ("pending", "Claim in review"))
        return {
            "success": True,
            "source": "simulated",
            "overall_status": simulated[0],
            "overall_description": simulated[1],
            "statuses": [{
                "category": "A1",
                "category_description": simulated[1],
                "status_code": "20",
                "status_description": "Accepted for processing",
                "effective_date": datetime.now().strftime("%Y%m%d"),
                "total_charge": str(claim.get("total_charge", 0)),
                "claim_payment_amount": str(claim.get("total_paid", 0)),
            }],
            "payer_claim_number": f"SIM-{claim.get('claim_number', 'N/A')}",
        }

    def get_status(self) -> Dict:
        """Return service configuration status."""
        return {
            "mode": "live" if self.is_live else "simulated",
            "api_key_set": bool(self._api_key),
            "provider_npi": self._provider_npi,
        }


# Singleton
claims_service = ClaimsService()
