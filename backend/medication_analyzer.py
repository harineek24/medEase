"""
MedEase - Medication Analysis Module
Provides drug interaction checking, duplicate therapy detection,
side effect aggregation, and dosage validation.
"""

import re
from typing import List, Dict, Any, Optional, Tuple
import requests
from datetime import datetime


class MedicationAnalyzer:
    """Main class for analyzing medications and detecting potential issues."""

    RXNORM_BASE_URL = "https://rxnav.nlm.nih.gov/REST"

    def __init__(self):
        """Initialize the medication analyzer."""
        self.drug_cache = {}

    def analyze_medications(self, medications: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Perform comprehensive medication analysis.

        Args:
            medications: List of medication dictionaries with 'name', 'dosage', etc.

        Returns:
            Dictionary containing analysis results for all features
        """
        # Normalize and enrich medication data
        enriched_meds = []
        for med in medications:
            enriched = self._enrich_medication(med)
            if enriched:
                enriched_meds.append(enriched)

        # Perform all analyses
        results = {
            "medications_analyzed": len(enriched_meds),
            "timestamp": datetime.utcnow().isoformat(),
            "interactions": self.check_interactions(enriched_meds),
            "duplicate_therapies": self.detect_duplicate_therapy(enriched_meds),
            "side_effects": self.aggregate_side_effects(enriched_meds),
            "dosage_warnings": self.validate_dosages(enriched_meds),
            "overall_risk_level": "low"  # Will be calculated based on findings
        }

        # Calculate overall risk level
        results["overall_risk_level"] = self._calculate_risk_level(results)

        return results

    def _enrich_medication(self, medication: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Enrich medication data with additional information from RxNorm.

        Args:
            medication: Basic medication info (name, dosage, etc.)

        Returns:
            Enriched medication dictionary or None if drug not found
        """
        drug_name = medication.get("name", "").strip()
        if not drug_name:
            return None

        # Check cache first
        if drug_name.lower() in self.drug_cache:
            cached_data = self.drug_cache[drug_name.lower()].copy()
            cached_data.update(medication)
            return cached_data

        # Get RxCUI from RxNorm
        try:
            rxcui = self._get_rxcui(drug_name)
            if rxcui:
                drug_info = self._get_drug_info(rxcui)
                enriched = {
                    **medication,
                    "rxcui": rxcui,
                    "generic_name": drug_info.get("generic_name", drug_name),
                    "drug_class": drug_info.get("drug_class", []),
                    "therapeutic_class": drug_info.get("therapeutic_class", "unknown")
                }

                # Cache the enriched data
                self.drug_cache[drug_name.lower()] = enriched.copy()
                return enriched
        except Exception as e:
            print(f"Error enriching medication {drug_name}: {e}")

        # Return basic info if enrichment fails
        return {
            **medication,
            "rxcui": None,
            "generic_name": drug_name,
            "drug_class": [],
            "therapeutic_class": self._guess_therapeutic_class(drug_name)
        }

    def _get_rxcui(self, drug_name: str) -> Optional[str]:
        """Get RxCUI code for a drug name using RxNorm API."""
        try:
            # Try exact match first
            url = f"{self.RXNORM_BASE_URL}/rxcui.json"
            params = {"name": drug_name, "search": 2}  # 2 = normalized search

            response = requests.get(url, params=params, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if "idGroup" in data and "rxnormId" in data["idGroup"]:
                    rxnorm_ids = data["idGroup"]["rxnormId"]
                    if rxnorm_ids and len(rxnorm_ids) > 0:
                        return rxnorm_ids[0]
        except Exception as e:
            print(f"Error getting RxCUI for {drug_name}: {e}")

        return None

    def _get_drug_info(self, rxcui: str) -> Dict[str, Any]:
        """Get drug information from RxNorm using RxCUI."""
        try:
            # Get drug properties
            url = f"{self.RXNORM_BASE_URL}/rxcui/{rxcui}/properties.json"
            response = requests.get(url, timeout=5)

            if response.status_code == 200:
                data = response.json()
                properties = data.get("properties", {})

                return {
                    "generic_name": properties.get("name", ""),
                    "drug_class": self._get_drug_classes(rxcui),
                    "therapeutic_class": self._get_therapeutic_class(rxcui)
                }
        except Exception as e:
            print(f"Error getting drug info for RxCUI {rxcui}: {e}")

        return {}

    def _get_drug_classes(self, rxcui: str) -> List[str]:
        """Get drug classes for a given RxCUI."""
        try:
            url = f"{self.RXNORM_BASE_URL}/rxclass/class/byRxcui.json"
            params = {"rxcui": rxcui}

            response = requests.get(url, params=params, timeout=5)
            if response.status_code == 200:
                data = response.json()
                classes = []
                if "rxclassMinConceptList" in data:
                    for item in data["rxclassMinConceptList"].get("rxclassMinConcept", []):
                        classes.append(item.get("className", ""))
                return classes
        except Exception as e:
            print(f"Error getting drug classes for RxCUI {rxcui}: {e}")

        return []

    def _get_therapeutic_class(self, rxcui: str) -> str:
        """Get primary therapeutic class for a drug."""
        classes = self._get_drug_classes(rxcui)
        if classes:
            return classes[0]
        return "unknown"

    def _guess_therapeutic_class(self, drug_name: str) -> str:
        """Guess therapeutic class based on drug name patterns."""
        drug_lower = drug_name.lower()

        # Common patterns
        class_patterns = {
            "cardiovascular": ["pril", "sartan", "olol", "dipine", "statin"],
            "diabetes": ["formin", "gliflozin", "gliptin", "glitazone"],
            "antibiotic": ["cillin", "mycin", "cycline", "floxacin"],
            "pain_relief": ["phen", "codone", "gesic"],
            "antidepressant": ["pram", "traline", "venlafaxine"],
            "anticoagulant": ["warfarin", "xaban", "parin"]
        }

        for class_name, patterns in class_patterns.items():
            if any(pattern in drug_lower for pattern in patterns):
                return class_name

        return "unknown"

    def check_interactions(self, medications: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Check for drug-drug interactions.

        Returns:
            List of interaction warnings with severity levels
        """
        from drug_data import DRUG_INTERACTIONS

        interactions = []

        # Check each pair of medications
        for i, med1 in enumerate(medications):
            for med2 in medications[i+1:]:
                interaction = self._check_pair_interaction(med1, med2, DRUG_INTERACTIONS)
                if interaction:
                    interactions.append(interaction)

        # Sort by severity
        severity_order = {"severe": 0, "moderate": 1, "mild": 2}
        interactions.sort(key=lambda x: severity_order.get(x["severity"], 3))

        return interactions

    def _check_pair_interaction(self, med1: Dict, med2: Dict,
                                 interactions_db: Dict) -> Optional[Dict[str, Any]]:
        """Check if two specific medications interact."""
        name1 = med1.get("generic_name", med1.get("name", "")).lower()
        name2 = med2.get("generic_name", med2.get("name", "")).lower()

        # Check both orderings
        key1 = f"{name1}|{name2}"
        key2 = f"{name2}|{name1}"

        for key in [key1, key2]:
            if key in interactions_db:
                interaction_data = interactions_db[key]
                return {
                    "drug1": med1.get("name"),
                    "drug2": med2.get("name"),
                    "severity": interaction_data["severity"],
                    "description": interaction_data["description"],
                    "recommendation": interaction_data.get("recommendation",
                                                          "Consult your healthcare provider")
                }

        # Check for class-level interactions
        class_interaction = self._check_class_interaction(med1, med2)
        if class_interaction:
            return class_interaction

        return None

    def _check_class_interaction(self, med1: Dict, med2: Dict) -> Optional[Dict[str, Any]]:
        """Check for interactions based on drug classes."""
        from drug_data import CLASS_INTERACTIONS

        classes1 = med1.get("drug_class", [])
        classes2 = med2.get("drug_class", [])
        therapeutic1 = med1.get("therapeutic_class", "")
        therapeutic2 = med2.get("therapeutic_class", "")

        # Check therapeutic class interactions
        for class1 in [therapeutic1] + classes1:
            for class2 in [therapeutic2] + classes2:
                key = f"{class1}|{class2}"
                key_reverse = f"{class2}|{class1}"

                if key in CLASS_INTERACTIONS:
                    interaction = CLASS_INTERACTIONS[key]
                    return {
                        "drug1": med1.get("name"),
                        "drug2": med2.get("name"),
                        "severity": interaction["severity"],
                        "description": f"Class interaction: {interaction['description']}",
                        "recommendation": interaction.get("recommendation",
                                                         "Monitor closely")
                    }
                elif key_reverse in CLASS_INTERACTIONS:
                    interaction = CLASS_INTERACTIONS[key_reverse]
                    return {
                        "drug1": med1.get("name"),
                        "drug2": med2.get("name"),
                        "severity": interaction["severity"],
                        "description": f"Class interaction: {interaction['description']}",
                        "recommendation": interaction.get("recommendation",
                                                         "Monitor closely")
                    }

        return None

    def detect_duplicate_therapy(self, medications: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Detect when multiple drugs serve the same therapeutic purpose.

        Returns:
            List of duplicate therapy warnings
        """
        duplicates = []

        # Group medications by therapeutic class
        class_groups = {}
        for med in medications:
            therapeutic_class = med.get("therapeutic_class", "unknown")
            if therapeutic_class != "unknown":
                if therapeutic_class not in class_groups:
                    class_groups[therapeutic_class] = []
                class_groups[therapeutic_class].append(med)

        # Check for duplicates in each class
        for class_name, meds in class_groups.items():
            if len(meds) > 1:
                # Check if they're actually duplicates or complementary
                if self._is_duplicate_therapy(meds, class_name):
                    duplicates.append({
                        "therapeutic_class": class_name,
                        "medications": [m.get("name") for m in meds],
                        "severity": "moderate",
                        "description": f"Multiple medications for {class_name.replace('_', ' ')}",
                        "recommendation": "Verify if multiple drugs in this class are intentional"
                    })

        return duplicates

    def _is_duplicate_therapy(self, medications: List[Dict], class_name: str) -> bool:
        """Determine if medications are duplicate therapy or complementary."""
        from drug_data import COMPLEMENTARY_COMBOS

        # Check if this is a known complementary combination
        med_names = set(m.get("generic_name", m.get("name", "")).lower()
                       for m in medications)

        for combo in COMPLEMENTARY_COMBOS.get(class_name, []):
            combo_set = set(c.lower() for c in combo)
            if combo_set.issubset(med_names):
                return False  # It's a complementary combo, not duplicate

        # If not complementary, consider it duplicate
        return True

    def aggregate_side_effects(self, medications: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Aggregate side effects across all medications.

        Returns:
            Dictionary with common, serious, and cumulative side effects
        """
        from drug_data import SIDE_EFFECTS

        all_effects = {
            "common": {},
            "serious": {},
            "cumulative_warnings": []
        }

        for med in medications:
            drug_name = med.get("generic_name", med.get("name", "")).lower()

            # Get side effects from database
            effects = SIDE_EFFECTS.get(drug_name, {})

            # Aggregate common side effects
            for effect in effects.get("common", []):
                if effect in all_effects["common"]:
                    all_effects["common"][effect]["count"] += 1
                    all_effects["common"][effect]["drugs"].append(med.get("name"))
                else:
                    all_effects["common"][effect] = {
                        "count": 1,
                        "drugs": [med.get("name")]
                    }

            # Aggregate serious side effects
            for effect in effects.get("serious", []):
                if effect in all_effects["serious"]:
                    all_effects["serious"][effect]["count"] += 1
                    all_effects["serious"][effect]["drugs"].append(med.get("name"))
                else:
                    all_effects["serious"][effect] = {
                        "count": 1,
                        "drugs": [med.get("name")]
                    }

        # Identify cumulative warnings (effects from multiple drugs)
        for effect, data in all_effects["common"].items():
            if data["count"] >= 2:
                all_effects["cumulative_warnings"].append({
                    "effect": effect,
                    "severity": "moderate",
                    "description": f"Multiple medications ({data['count']}) may cause {effect}",
                    "drugs": data["drugs"]
                })

        for effect, data in all_effects["serious"].items():
            if data["count"] >= 1:
                all_effects["cumulative_warnings"].append({
                    "effect": effect,
                    "severity": "high",
                    "description": f"Serious side effect: {effect}",
                    "drugs": data["drugs"]
                })

        return all_effects

    def validate_dosages(self, medications: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Validate medication dosages against standard ranges.

        Returns:
            List of dosage warnings for unusual amounts
        """
        from drug_data import DOSAGE_RANGES

        warnings = []

        for med in medications:
            drug_name = med.get("generic_name", med.get("name", "")).lower()
            dosage_str = med.get("dosage", "")

            # Parse dosage
            dosage_info = self._parse_dosage(dosage_str)
            if not dosage_info:
                warnings.append({
                    "medication": med.get("name"),
                    "severity": "mild",
                    "issue": "Unable to parse dosage",
                    "dosage_provided": dosage_str,
                    "recommendation": "Verify dosage format"
                })
                continue

            # Check against known ranges
            if drug_name in DOSAGE_RANGES:
                range_info = DOSAGE_RANGES[drug_name]
                warning = self._check_dosage_range(med, dosage_info, range_info)
                if warning:
                    warnings.append(warning)

        return warnings

    def _parse_dosage(self, dosage_str: str) -> Optional[Dict[str, Any]]:
        """Parse dosage string into structured format."""
        if not dosage_str:
            return None

        # Common patterns: "10mg", "10 mg", "10mg twice daily", "500 mg/day"
        patterns = [
            r'(\d+(?:\.\d+)?)\s*(mg|g|mcg|ml|units?)',
            r'(\d+(?:\.\d+)?)\s*(mg|g|mcg|ml|units?)/day',
        ]

        for pattern in patterns:
            match = re.search(pattern, dosage_str.lower())
            if match:
                amount = float(match.group(1))
                unit = match.group(2)

                # Normalize units
                if unit in ["mcg", "μg"]:
                    amount = amount / 1000  # Convert to mg
                    unit = "mg"
                elif unit == "g":
                    amount = amount * 1000  # Convert to mg
                    unit = "mg"

                return {
                    "amount": amount,
                    "unit": unit,
                    "original": dosage_str
                }

        return None

    def _check_dosage_range(self, medication: Dict, dosage_info: Dict,
                           range_info: Dict) -> Optional[Dict[str, Any]]:
        """Check if dosage is within normal range."""
        amount = dosage_info["amount"]
        unit = dosage_info["unit"]

        # Check if units match
        if unit != range_info.get("unit", "mg"):
            return None

        min_dose = range_info.get("min", 0)
        max_dose = range_info.get("max", float('inf'))
        typical_max = range_info.get("typical_max", max_dose)

        if amount < min_dose:
            return {
                "medication": medication.get("name"),
                "severity": "moderate",
                "issue": "Below minimum recommended dose",
                "dosage_provided": dosage_info["original"],
                "expected_range": f"{min_dose}-{typical_max} {unit}",
                "recommendation": "Verify dosage is correct"
            }
        elif amount > max_dose:
            return {
                "medication": medication.get("name"),
                "severity": "severe",
                "issue": "Exceeds maximum safe dose",
                "dosage_provided": dosage_info["original"],
                "expected_range": f"{min_dose}-{typical_max} {unit}",
                "recommendation": "Contact healthcare provider immediately"
            }
        elif amount > typical_max:
            return {
                "medication": medication.get("name"),
                "severity": "moderate",
                "issue": "Higher than typical maximum dose",
                "dosage_provided": dosage_info["original"],
                "expected_range": f"{min_dose}-{typical_max} {unit}",
                "recommendation": "Verify if high dose is intentional"
            }

        return None

    def _calculate_risk_level(self, results: Dict[str, Any]) -> str:
        """Calculate overall risk level based on all findings."""
        severe_count = 0
        moderate_count = 0

        # Count severe interactions
        for interaction in results.get("interactions", []):
            if interaction.get("severity") == "severe":
                severe_count += 1
            elif interaction.get("severity") == "moderate":
                moderate_count += 1

        # Count dosage warnings
        for warning in results.get("dosage_warnings", []):
            if warning.get("severity") == "severe":
                severe_count += 1
            elif warning.get("severity") == "moderate":
                moderate_count += 1

        # Determine overall risk
        if severe_count > 0:
            return "high"
        elif moderate_count > 2:
            return "moderate"
        elif moderate_count > 0:
            return "moderate"
        else:
            return "low"


# Singleton instance
analyzer = MedicationAnalyzer()
