"""
Claims Edit Engine - Pre-submission claims scrubbing service.
Validates claims against common billing rules before clearinghouse submission.
"""

from typing import Dict, List, Any
from datetime import datetime, date


# Common ICD-10 gender-specific codes
MALE_ONLY_ICD = {"N40", "N41", "N42", "N43", "N44", "N45", "N46", "N47", "N48", "N49", "N50", "C61", "C62", "C63"}
FEMALE_ONLY_ICD = {"N70", "N71", "N72", "N73", "N74", "N75", "N76", "N77", "O00", "O01", "O02", "O03", "O04",
                   "C51", "C52", "C53", "C54", "C55", "C56", "C57", "C58"}

# Common bundled CPT code pairs
BUNDLED_PAIRS = {
    ("99213", "99214"), ("99213", "99215"), ("99214", "99215"),
    ("36415", "36416"), ("80053", "80048"), ("85025", "85027"),
}

# Valid place of service codes
VALID_POS = {"11", "12", "21", "22", "23", "24", "31", "32", "33", "41", "42", "51", "52", "53", "54", "55", "56", "61", "62", "65", "71", "72", "81", "99"}


class ClaimsEditEngine:
    """Scrubs claims for common errors before submission."""

    def scrub_claim(self, claim: Dict[str, Any]) -> Dict[str, Any]:
        """Run all edit checks on a claim. Returns scrub results."""
        errors = []
        warnings = []

        self._check_required_fields(claim, errors)
        self._check_diagnosis_codes(claim, errors, warnings)
        self._check_procedure_codes(claim, errors, warnings)
        self._check_date_logic(claim, errors, warnings)
        self._check_charge_validation(claim, errors, warnings)
        self._check_place_of_service(claim, errors, warnings)
        self._check_duplicate_lines(claim, warnings)
        self._check_bundling(claim, warnings)
        self._check_modifier_rules(claim, warnings)

        passed = len(errors) == 0
        return {
            "passed": passed,
            "error_count": len(errors),
            "warning_count": len(warnings),
            "errors": errors,
            "warnings": warnings,
            "scrubbed_at": datetime.now().isoformat(),
        }

    def _check_required_fields(self, claim: Dict, errors: List):
        required = ["patient_id", "diagnosis_codes", "date_of_service"]
        for field in required:
            if not claim.get(field):
                errors.append({
                    "category": "required_field",
                    "field": field,
                    "message": f"Required field '{field}' is missing"
                })
        lines = claim.get("lines", [])
        if not lines:
            errors.append({
                "category": "required_field",
                "field": "lines",
                "message": "Claim must have at least one line item"
            })
        for i, line in enumerate(lines):
            if not line.get("cpt_code"):
                errors.append({
                    "category": "required_field",
                    "field": f"line_{i+1}_cpt_code",
                    "message": f"Line {i+1}: CPT code is required"
                })
            if not line.get("charge_amount") or line.get("charge_amount", 0) <= 0:
                errors.append({
                    "category": "required_field",
                    "field": f"line_{i+1}_charge",
                    "message": f"Line {i+1}: Charge amount must be greater than 0"
                })

    def _check_diagnosis_codes(self, claim: Dict, errors: List, warnings: List):
        codes_str = claim.get("diagnosis_codes", "")
        if not codes_str:
            return
        codes = [c.strip() for c in codes_str.split(",") if c.strip()]
        for code in codes:
            if not (code[0].isalpha() and len(code) >= 3):
                errors.append({
                    "category": "diagnosis_code",
                    "code": code,
                    "message": f"Invalid ICD-10 format: '{code}'"
                })
        if len(codes) > 12:
            warnings.append({
                "category": "diagnosis_code",
                "message": f"Claim has {len(codes)} diagnosis codes (max recommended: 12)"
            })

    def _check_procedure_codes(self, claim: Dict, errors: List, warnings: List):
        for i, line in enumerate(claim.get("lines", [])):
            cpt = line.get("cpt_code", "")
            if cpt and (len(cpt) != 5 or not cpt.isdigit()):
                if not (len(cpt) == 5 and cpt[0].isalpha()):
                    errors.append({
                        "category": "procedure_code",
                        "line": i + 1,
                        "code": cpt,
                        "message": f"Line {i+1}: Invalid CPT code format '{cpt}'"
                    })

    def _check_date_logic(self, claim: Dict, errors: List, warnings: List):
        dos = claim.get("date_of_service")
        if dos:
            try:
                dos_date = datetime.strptime(dos, "%Y-%m-%d").date()
                if dos_date > date.today():
                    errors.append({
                        "category": "date_logic",
                        "message": "Date of service cannot be in the future"
                    })
                days_old = (date.today() - dos_date).days
                if days_old > 365:
                    warnings.append({
                        "category": "date_logic",
                        "message": f"Date of service is {days_old} days old (timely filing risk)"
                    })
            except ValueError:
                errors.append({
                    "category": "date_logic",
                    "message": f"Invalid date format: '{dos}'. Expected YYYY-MM-DD"
                })

    def _check_charge_validation(self, claim: Dict, errors: List, warnings: List):
        for i, line in enumerate(claim.get("lines", [])):
            charge = line.get("charge_amount", 0)
            if charge > 10000:
                warnings.append({
                    "category": "charge_validation",
                    "line": i + 1,
                    "message": f"Line {i+1}: Unusually high charge (${charge:,.2f}). Please verify."
                })
            units = line.get("units", 1)
            if units > 10:
                warnings.append({
                    "category": "charge_validation",
                    "line": i + 1,
                    "message": f"Line {i+1}: High unit count ({units}). Please verify."
                })

    def _check_place_of_service(self, claim: Dict, errors: List, warnings: List):
        pos = claim.get("place_of_service", "")
        if pos and pos not in VALID_POS:
            errors.append({
                "category": "place_of_service",
                "code": pos,
                "message": f"Invalid place of service code: '{pos}'"
            })

    def _check_duplicate_lines(self, claim: Dict, warnings: List):
        lines = claim.get("lines", [])
        seen = set()
        for i, line in enumerate(lines):
            key = (line.get("cpt_code"), line.get("modifier", ""))
            if key in seen:
                warnings.append({
                    "category": "duplicate",
                    "line": i + 1,
                    "message": f"Line {i+1}: Possible duplicate CPT {key[0]}"
                })
            seen.add(key)

    def _check_bundling(self, claim: Dict, warnings: List):
        lines = claim.get("lines", [])
        cpts = [line.get("cpt_code", "") for line in lines]
        for i, c1 in enumerate(cpts):
            for j, c2 in enumerate(cpts):
                if i < j and (c1, c2) in BUNDLED_PAIRS or (c2, c1) in BUNDLED_PAIRS:
                    warnings.append({
                        "category": "bundling",
                        "message": f"CPT {c1} and {c2} may be bundled - review for correct billing"
                    })

    def _check_modifier_rules(self, claim: Dict, warnings: List):
        lines = claim.get("lines", [])
        for i, line in enumerate(lines):
            mod = line.get("modifier", "")
            if mod and mod not in {"25", "26", "59", "76", "77", "91", "TC", "XE", "XP", "XS", "XU", ""}:
                warnings.append({
                    "category": "modifier",
                    "line": i + 1,
                    "message": f"Line {i+1}: Uncommon modifier '{mod}' - verify documentation supports usage"
                })


# Singleton
edit_engine = ClaimsEditEngine()
