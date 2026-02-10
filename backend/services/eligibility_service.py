"""
Eligibility Verification Service - Simulates real-time insurance eligibility checks.
In production, this would connect to payer APIs or a clearinghouse.
"""

import random
from datetime import datetime, timedelta
from typing import Dict, Optional


# Simulated payer profiles
PAYER_PROFILES = {
    "Aetna": {
        "plan_names": ["Aetna Choice POS II", "Aetna Open Access HMO", "Aetna PPO"],
        "copay_range": (20, 50),
        "deductible_range": (500, 3000),
        "coinsurance": [80, 70, 90],
        "oop_max_range": (4000, 8000),
    },
    "Blue Cross": {
        "plan_names": ["Blue Cross PPO", "Blue Shield HMO", "Blue Cross Bronze"],
        "copay_range": (15, 45),
        "deductible_range": (500, 5000),
        "coinsurance": [80, 70, 60],
        "oop_max_range": (5000, 10000),
    },
    "Cigna": {
        "plan_names": ["Cigna Connect", "Cigna Open Access Plus", "Cigna PPO"],
        "copay_range": (25, 60),
        "deductible_range": (1000, 4000),
        "coinsurance": [80, 70, 90],
        "oop_max_range": (5000, 9000),
    },
    "United Healthcare": {
        "plan_names": ["UHC Choice Plus", "UHC Navigate", "UHC Options PPO"],
        "copay_range": (20, 55),
        "deductible_range": (750, 3500),
        "coinsurance": [80, 70, 85],
        "oop_max_range": (4500, 8500),
    },
    "Kaiser": {
        "plan_names": ["Kaiser HMO", "Kaiser Platinum HMO", "Kaiser Gold HMO"],
        "copay_range": (10, 35),
        "deductible_range": (0, 1500),
        "coinsurance": [90, 80, 100],
        "oop_max_range": (3000, 6000),
    },
    "Humana": {
        "plan_names": ["Humana Gold Plus", "Humana PPO", "Humana HMO"],
        "copay_range": (20, 50),
        "deductible_range": (500, 3000),
        "coinsurance": [80, 70, 85],
        "oop_max_range": (4000, 7500),
    },
    "Medicaid": {
        "plan_names": ["Medi-Cal", "Medi-Cal Managed Care"],
        "copay_range": (0, 5),
        "deductible_range": (0, 0),
        "coinsurance": [100],
        "oop_max_range": (0, 0),
    },
}


class EligibilityService:
    """Simulates real-time eligibility verification."""

    def verify_eligibility(self, patient_name: str, payer_name: str,
                           policy_number: str = None,
                           date_of_service: str = None) -> Dict:
        """Simulate an eligibility check against a payer."""
        profile = PAYER_PROFILES.get(payer_name)
        if not profile:
            # Use a generic profile for unknown payers
            profile = {
                "plan_names": [f"{payer_name} Standard Plan"],
                "copay_range": (20, 50),
                "deductible_range": (500, 3000),
                "coinsurance": [80],
                "oop_max_range": (4000, 8000),
            }

        # 90% chance of being eligible (simulated)
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
                    "Policy number mismatch"
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
