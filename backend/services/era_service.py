"""
ERA / Remittance Advice Service (835).

Retrieves Electronic Remittance Advice (ERA) data — the payer's explanation
of how a claim was adjudicated and how much was paid.

Stedi's ERA retrieval is typically SFTP/webhook-based. This service
provides a REST wrapper that:
  1. **Live** – calls Stedi's ERA report listing API.
  2. **Simulated** – returns realistic mock ERA data.
"""

import os
import logging
import random
import requests
from datetime import datetime, timedelta
from typing import Dict, Optional, List

log = logging.getLogger(__name__)

# Stedi ERA reports API
STEDI_ERA_LIST_URL = (
    "https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/"
    "era/v3/list"
)
STEDI_ERA_DETAIL_URL = (
    "https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/"
    "era/v3"
)


class ERAService:
    """Retrieve and parse 835 ERA / remittance advice."""

    def __init__(self):
        self._api_key: Optional[str] = os.getenv("STEDI_API_KEY")

    @property
    def is_live(self) -> bool:
        return bool(self._api_key)

    def set_api_key(self, key: str):
        self._api_key = key if key else None

    # ------------------------------------------------------------------
    # List ERAs
    # ------------------------------------------------------------------

    def list_eras(self, page: int = 1, per_page: int = 25) -> Dict:
        """List ERA reports. Uses Stedi if key set, else simulated."""
        if self._api_key:
            try:
                return self._list_via_stedi(page, per_page)
            except Exception as exc:
                log.warning("Stedi ERA list failed: %s", exc)
                result = self._simulate_list(page, per_page)
                result["_source"] = "simulated_fallback"
                result["_error"] = str(exc)
                return result
        return self._simulate_list(page, per_page)

    def _list_via_stedi(self, page: int, per_page: int) -> Dict:
        """Fetch ERA list from Stedi."""
        resp = requests.get(
            STEDI_ERA_LIST_URL,
            params={"page": page, "perPage": per_page},
            headers={"Authorization": self._api_key},
            timeout=30,
        )

        if not resp.ok:
            try:
                err = resp.json()
            except Exception:
                err = resp.text
            raise ValueError(f"Stedi ERA list {resp.status_code}: {err}")

        data = resp.json()
        eras = []
        for item in data.get("reports", data.get("eras", [])):
            eras.append(self._parse_era_summary(item))

        return {
            "_source": "stedi_live",
            "eras": eras,
            "count": len(eras),
            "page": page,
            "total": data.get("total", len(eras)),
        }

    def _parse_era_summary(self, item: Dict) -> Dict:
        """Parse a single ERA summary from list."""
        return {
            "id": item.get("id", item.get("reportId", "")),
            "check_number": item.get("checkNumber", item.get("traceNumber", "")),
            "payer_name": item.get("payerName", ""),
            "payer_id": item.get("payerId", ""),
            "payment_amount": item.get("totalPaymentAmount", 0),
            "claim_count": item.get("claimCount", 0),
            "payment_date": item.get("paymentDate", item.get("productionDate", "")),
            "payment_method": item.get("paymentMethodCode", ""),
            "status": item.get("status", "received"),
        }

    # ------------------------------------------------------------------
    # Get ERA detail
    # ------------------------------------------------------------------

    def get_era_detail(self, era_id: str) -> Dict:
        """Get detailed ERA with claim-level breakdown."""
        if self._api_key:
            try:
                return self._get_detail_via_stedi(era_id)
            except Exception as exc:
                log.warning("Stedi ERA detail failed: %s", exc)
                return self._simulate_detail(era_id)
        return self._simulate_detail(era_id)

    def _get_detail_via_stedi(self, era_id: str) -> Dict:
        """Fetch ERA detail from Stedi."""
        resp = requests.get(
            f"{STEDI_ERA_DETAIL_URL}/{era_id}",
            headers={"Authorization": self._api_key},
            timeout=30,
        )

        if not resp.ok:
            try:
                err = resp.json()
            except Exception:
                err = resp.text
            raise ValueError(f"Stedi ERA detail {resp.status_code}: {err}")

        data = resp.json()
        return self._parse_era_detail(data)

    def _parse_era_detail(self, data: Dict) -> Dict:
        """Parse full ERA detail response."""
        claims = []
        for claim in data.get("claimPayments", data.get("claims", [])):
            adjustments = []
            for adj in claim.get("adjustments", []):
                adjustments.append({
                    "group_code": adj.get("adjustmentGroupCode", ""),
                    "reason_code": adj.get("adjustmentReasonCode", ""),
                    "amount": adj.get("adjustmentAmount", 0),
                    "description": adj.get("description", ""),
                })

            service_lines = []
            for line in claim.get("serviceLines", []):
                service_lines.append({
                    "procedure_code": line.get("procedureCode", ""),
                    "charge_amount": line.get("lineItemChargeAmount", 0),
                    "paid_amount": line.get("lineItemProviderPaymentAmount", 0),
                    "units": line.get("serviceUnitCount", 1),
                    "adjustments": line.get("adjustments", []),
                })

            claims.append({
                "patient_name": claim.get("patientName", ""),
                "patient_control_number": claim.get("patientControlNumber", ""),
                "claim_status": claim.get("claimStatusCode", ""),
                "charge_amount": claim.get("totalClaimChargeAmount", 0),
                "paid_amount": claim.get("claimPaymentAmount", 0),
                "patient_responsibility": claim.get("patientResponsibilityAmount", 0),
                "payer_claim_number": claim.get("payerClaimControlNumber", ""),
                "service_date": claim.get("serviceDate", ""),
                "adjustments": adjustments,
                "service_lines": service_lines,
            })

        return {
            "_source": "stedi_live",
            "id": data.get("id", data.get("reportId", "")),
            "check_number": data.get("checkNumber", data.get("traceNumber", "")),
            "payer_name": data.get("payerName", ""),
            "payment_amount": data.get("totalPaymentAmount", 0),
            "payment_date": data.get("paymentDate", ""),
            "payment_method": data.get("paymentMethodCode", ""),
            "claims": claims,
            "claim_count": len(claims),
        }

    # ------------------------------------------------------------------
    # Simulation
    # ------------------------------------------------------------------

    def _simulate_list(self, page: int, per_page: int) -> Dict:
        """Generate simulated ERA list."""
        payers = ["Aetna", "Blue Cross", "Cigna", "United Healthcare", "Humana"]
        eras = []
        for i in range(min(per_page, 10)):
            days_ago = random.randint(1, 90)
            payment_date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
            eras.append({
                "id": f"ERA-{random.randint(100000, 999999)}",
                "check_number": f"CHK{random.randint(10000, 99999)}",
                "payer_name": random.choice(payers),
                "payer_id": "",
                "payment_amount": round(random.uniform(200, 15000), 2),
                "claim_count": random.randint(1, 8),
                "payment_date": payment_date,
                "payment_method": random.choice(["ACH", "CHK", "NON"]),
                "status": "received",
            })

        return {
            "_source": "simulated",
            "eras": eras,
            "count": len(eras),
            "page": page,
            "total": 25,
        }

    def _simulate_detail(self, era_id: str) -> Dict:
        """Generate simulated ERA detail."""
        payer = random.choice(["Aetna", "Blue Cross", "Cigna", "United Healthcare"])
        num_claims = random.randint(1, 5)
        claims = []
        total_paid = 0

        cpt_codes = ["99213", "99214", "99215", "99203", "99204", "36415", "85025"]
        adjustment_reasons = [
            ("CO", "45", "Charge exceeds fee schedule"),
            ("CO", "253", "Sequestration reduction"),
            ("PR", "1", "Deductible"),
            ("PR", "2", "Coinsurance"),
            ("PR", "3", "Copayment"),
        ]

        for i in range(num_claims):
            charge = round(random.uniform(100, 2000), 2)
            paid = round(charge * random.uniform(0.5, 0.95), 2)
            patient_resp = round(charge - paid, 2) if random.random() < 0.5 else 0
            total_paid += paid

            adj_count = random.randint(0, 2)
            adjs = []
            for _ in range(adj_count):
                grp, code, desc = random.choice(adjustment_reasons)
                adjs.append({
                    "group_code": grp,
                    "reason_code": code,
                    "amount": round(random.uniform(5, 200), 2),
                    "description": desc,
                })

            claims.append({
                "patient_name": f"Patient {chr(65 + i)}",
                "patient_control_number": f"CLM-{random.randint(10000, 99999)}",
                "claim_status": random.choice(["1", "2", "4"]),
                "charge_amount": charge,
                "paid_amount": paid,
                "patient_responsibility": patient_resp,
                "payer_claim_number": f"PCN{random.randint(100000, 999999)}",
                "service_date": (datetime.now() - timedelta(days=random.randint(14, 90))).strftime("%Y-%m-%d"),
                "adjustments": adjs,
                "service_lines": [{
                    "procedure_code": random.choice(cpt_codes),
                    "charge_amount": charge,
                    "paid_amount": paid,
                    "units": 1,
                    "adjustments": [],
                }],
            })

        return {
            "_source": "simulated",
            "id": era_id,
            "check_number": f"CHK{random.randint(10000, 99999)}",
            "payer_name": payer,
            "payment_amount": round(total_paid, 2),
            "payment_date": (datetime.now() - timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d"),
            "payment_method": "ACH",
            "claims": claims,
            "claim_count": len(claims),
        }

    def get_status(self) -> Dict:
        return {
            "mode": "live" if self.is_live else "simulated",
            "api_key_set": bool(self._api_key),
        }


# Singleton
era_service = ERAService()
