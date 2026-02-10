"""
Medical Coding Service - ICD-10 and CPT code lookup database.
Provides searchable code databases for claims entry.
"""

from typing import List, Dict


# Common ICD-10 codes
ICD10_CODES = [
    {"code": "A09", "description": "Infectious gastroenteritis and colitis, unspecified"},
    {"code": "B34.9", "description": "Viral infection, unspecified"},
    {"code": "D64.9", "description": "Anemia, unspecified"},
    {"code": "E11.9", "description": "Type 2 diabetes mellitus without complications"},
    {"code": "E11.65", "description": "Type 2 diabetes mellitus with hyperglycemia"},
    {"code": "E55.9", "description": "Vitamin D deficiency, unspecified"},
    {"code": "E78.5", "description": "Hyperlipidemia, unspecified"},
    {"code": "F32.9", "description": "Major depressive disorder, single episode, unspecified"},
    {"code": "F41.1", "description": "Generalized anxiety disorder"},
    {"code": "G43.909", "description": "Migraine, unspecified, not intractable"},
    {"code": "G47.00", "description": "Insomnia, unspecified"},
    {"code": "I10", "description": "Essential (primary) hypertension"},
    {"code": "I25.10", "description": "Atherosclerotic heart disease of native coronary artery"},
    {"code": "I48.91", "description": "Unspecified atrial fibrillation"},
    {"code": "I50.9", "description": "Heart failure, unspecified"},
    {"code": "J06.9", "description": "Acute upper respiratory infection, unspecified"},
    {"code": "J18.9", "description": "Pneumonia, unspecified organism"},
    {"code": "J20.9", "description": "Acute bronchitis, unspecified"},
    {"code": "J45.909", "description": "Unspecified asthma, uncomplicated"},
    {"code": "K21.0", "description": "Gastro-esophageal reflux disease with esophagitis"},
    {"code": "K58.9", "description": "Irritable bowel syndrome without diarrhea"},
    {"code": "L30.9", "description": "Dermatitis, unspecified"},
    {"code": "M25.50", "description": "Pain in unspecified joint"},
    {"code": "M54.5", "description": "Low back pain"},
    {"code": "M79.3", "description": "Panniculitis, unspecified"},
    {"code": "N39.0", "description": "Urinary tract infection, site not specified"},
    {"code": "R05.9", "description": "Cough, unspecified"},
    {"code": "R10.9", "description": "Unspecified abdominal pain"},
    {"code": "R50.9", "description": "Fever, unspecified"},
    {"code": "R51.9", "description": "Headache, unspecified"},
    {"code": "R53.83", "description": "Other fatigue"},
    {"code": "R73.09", "description": "Other abnormal glucose"},
    {"code": "Z00.00", "description": "Encounter for general adult medical examination without abnormal findings"},
    {"code": "Z12.31", "description": "Encounter for screening mammogram for malignant neoplasm of breast"},
    {"code": "Z23", "description": "Encounter for immunization"},
]

# Common CPT codes
CPT_CODES = [
    {"code": "99201", "description": "Office visit, new patient, minimal", "category": "E&M", "default_charge": 45},
    {"code": "99202", "description": "Office visit, new patient, low", "category": "E&M", "default_charge": 75},
    {"code": "99203", "description": "Office visit, new patient, moderate", "category": "E&M", "default_charge": 125},
    {"code": "99204", "description": "Office visit, new patient, moderate-high", "category": "E&M", "default_charge": 185},
    {"code": "99205", "description": "Office visit, new patient, high", "category": "E&M", "default_charge": 250},
    {"code": "99211", "description": "Office visit, established patient, minimal", "category": "E&M", "default_charge": 25},
    {"code": "99212", "description": "Office visit, established patient, low", "category": "E&M", "default_charge": 50},
    {"code": "99213", "description": "Office visit, established patient, moderate", "category": "E&M", "default_charge": 95},
    {"code": "99214", "description": "Office visit, established patient, moderate-high", "category": "E&M", "default_charge": 145},
    {"code": "99215", "description": "Office visit, established patient, high", "category": "E&M", "default_charge": 210},
    {"code": "99381", "description": "Preventive visit, new patient, infant", "category": "Preventive", "default_charge": 130},
    {"code": "99391", "description": "Preventive visit, established patient, infant", "category": "Preventive", "default_charge": 110},
    {"code": "99395", "description": "Preventive visit, established patient, 18-39", "category": "Preventive", "default_charge": 150},
    {"code": "99396", "description": "Preventive visit, established patient, 40-64", "category": "Preventive", "default_charge": 160},
    {"code": "36415", "description": "Venipuncture (blood draw)", "category": "Lab", "default_charge": 12},
    {"code": "36416", "description": "Capillary blood collection (finger stick)", "category": "Lab", "default_charge": 8},
    {"code": "71046", "description": "Chest X-ray, 2 views", "category": "Radiology", "default_charge": 75},
    {"code": "73030", "description": "X-ray, shoulder, 2 views", "category": "Radiology", "default_charge": 65},
    {"code": "80048", "description": "Basic metabolic panel", "category": "Lab", "default_charge": 22},
    {"code": "80053", "description": "Comprehensive metabolic panel", "category": "Lab", "default_charge": 32},
    {"code": "80061", "description": "Lipid panel", "category": "Lab", "default_charge": 28},
    {"code": "81001", "description": "Urinalysis, automated with microscopy", "category": "Lab", "default_charge": 10},
    {"code": "83036", "description": "Hemoglobin A1c", "category": "Lab", "default_charge": 25},
    {"code": "85025", "description": "Complete blood count (CBC) with differential", "category": "Lab", "default_charge": 18},
    {"code": "85027", "description": "Complete blood count (CBC), automated", "category": "Lab", "default_charge": 14},
    {"code": "87880", "description": "Strep test, rapid", "category": "Lab", "default_charge": 20},
    {"code": "90471", "description": "Immunization administration", "category": "Immunization", "default_charge": 25},
    {"code": "90658", "description": "Influenza vaccine, 3 years and older", "category": "Immunization", "default_charge": 30},
    {"code": "90686", "description": "Influenza vaccine, quadrivalent", "category": "Immunization", "default_charge": 35},
    {"code": "93000", "description": "Electrocardiogram (ECG/EKG), 12-lead", "category": "Cardiology", "default_charge": 55},
    {"code": "93005", "description": "ECG, tracing only", "category": "Cardiology", "default_charge": 25},
    {"code": "96372", "description": "Therapeutic injection, subcutaneous/intramuscular", "category": "Injection", "default_charge": 30},
    {"code": "99000", "description": "Specimen handling", "category": "Lab", "default_charge": 10},
]


class CodingService:
    """Search and lookup medical codes."""

    def search_icd10(self, query: str, limit: int = 20) -> List[Dict]:
        if not query:
            return ICD10_CODES[:limit]
        q = query.lower()
        results = [c for c in ICD10_CODES
                   if q in c["code"].lower() or q in c["description"].lower()]
        return results[:limit]

    def search_cpt(self, query: str, limit: int = 20) -> List[Dict]:
        if not query:
            return CPT_CODES[:limit]
        q = query.lower()
        results = [c for c in CPT_CODES
                   if q in c["code"].lower() or q in c["description"].lower()
                   or q in c.get("category", "").lower()]
        return results[:limit]

    def get_cpt_details(self, code: str) -> Dict:
        for c in CPT_CODES:
            if c["code"] == code:
                return c
        return None


# Singleton
coding_service = CodingService()
