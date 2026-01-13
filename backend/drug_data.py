"""
Drug Interaction, Side Effects, and Dosage Reference Data

This module contains curated databases for:
- Common drug-drug interactions
- Drug class interactions
- Known side effects
- Standard dosage ranges
- Complementary drug combinations
"""

# Common Drug-Drug Interactions
# Format: "drug1|drug2": {"severity": "...", "description": "...", "recommendation": "..."}
DRUG_INTERACTIONS = {
    # Cardiovascular medications
    "warfarin|aspirin": {
        "severity": "severe",
        "description": "Increased risk of bleeding when combining anticoagulants",
        "recommendation": "Use together only under close medical supervision. Monitor INR frequently."
    },
    "warfarin|ibuprofen": {
        "severity": "severe",
        "description": "NSAIDs increase bleeding risk with anticoagulants",
        "recommendation": "Avoid combination if possible. Consider acetaminophen for pain."
    },
    "warfarin|naproxen": {
        "severity": "severe",
        "description": "NSAIDs increase bleeding risk with anticoagulants",
        "recommendation": "Avoid combination if possible. Use alternative pain relief."
    },
    "lisinopril|potassium": {
        "severity": "moderate",
        "description": "ACE inhibitors can increase potassium levels",
        "recommendation": "Monitor potassium levels regularly. Avoid potassium supplements unless prescribed."
    },
    "amlodipine|simvastatin": {
        "severity": "moderate",
        "description": "Amlodipine increases simvastatin levels, raising risk of muscle problems",
        "recommendation": "Limit simvastatin to 20mg daily when used with amlodipine."
    },
    "atorvastatin|gemfibrozil": {
        "severity": "severe",
        "description": "Increased risk of severe muscle damage (rhabdomyolysis)",
        "recommendation": "Avoid this combination. Consider alternative lipid-lowering therapy."
    },
    "metoprolol|verapamil": {
        "severity": "severe",
        "description": "Both drugs slow heart rate; combination may cause dangerous bradycardia",
        "recommendation": "Use together only under careful cardiac monitoring."
    },

    # Diabetes medications
    "metformin|alcohol": {
        "severity": "moderate",
        "description": "Alcohol increases risk of lactic acidosis with metformin",
        "recommendation": "Limit alcohol consumption. Avoid excessive drinking."
    },
    "insulin|metformin": {
        "severity": "mild",
        "description": "Complementary combination, but monitor for low blood sugar",
        "recommendation": "Monitor blood glucose closely, especially when initiating therapy."
    },
    "glipizide|metformin": {
        "severity": "mild",
        "description": "Combination increases risk of hypoglycemia",
        "recommendation": "Monitor blood glucose regularly and watch for signs of low blood sugar."
    },

    # Antibiotics
    "ciprofloxacin|tizanidine": {
        "severity": "severe",
        "description": "Ciprofloxacin significantly increases tizanidine levels, causing severe low blood pressure",
        "recommendation": "Contraindicated - do not use together."
    },
    "azithromycin|amiodarone": {
        "severity": "severe",
        "description": "Both can prolong QT interval, increasing risk of dangerous heart rhythm",
        "recommendation": "Avoid combination. Monitor ECG if must use together."
    },
    "rifampin|warfarin": {
        "severity": "moderate",
        "description": "Rifampin decreases warfarin effectiveness",
        "recommendation": "Monitor INR closely and adjust warfarin dose as needed."
    },

    # Antidepressants and psychiatric medications
    "sertraline|tramadol": {
        "severity": "moderate",
        "description": "Increased risk of serotonin syndrome",
        "recommendation": "Monitor for symptoms: confusion, agitation, rapid heart rate, high blood pressure."
    },
    "fluoxetine|tramadol": {
        "severity": "moderate",
        "description": "Increased risk of serotonin syndrome",
        "recommendation": "Use with caution. Watch for serotonin syndrome symptoms."
    },
    "citalopram|omeprazole": {
        "severity": "moderate",
        "description": "Omeprazole increases citalopram levels, may prolong QT interval",
        "recommendation": "Monitor for increased side effects. Consider ECG monitoring."
    },
    "lithium|lisinopril": {
        "severity": "moderate",
        "description": "ACE inhibitors can increase lithium levels to toxic range",
        "recommendation": "Monitor lithium levels closely. Watch for signs of lithium toxicity."
    },

    # Pain medications
    "tramadol|ondansetron": {
        "severity": "moderate",
        "description": "Both drugs can increase serotonin levels",
        "recommendation": "Monitor for serotonin syndrome symptoms."
    },
    "oxycodone|alcohol": {
        "severity": "severe",
        "description": "Increased risk of respiratory depression and overdose",
        "recommendation": "Avoid alcohol completely while taking opioid medications."
    },
    "acetaminophen|warfarin": {
        "severity": "moderate",
        "description": "Regular acetaminophen use may enhance warfarin's effect",
        "recommendation": "Monitor INR more frequently with regular acetaminophen use."
    },

    # Other common interactions
    "prednisone|ibuprofen": {
        "severity": "moderate",
        "description": "Increased risk of stomach ulcers and bleeding",
        "recommendation": "Use together only if necessary. Consider stomach protection with PPI."
    },
    "levothyroxine|calcium": {
        "severity": "moderate",
        "description": "Calcium can reduce absorption of thyroid medication",
        "recommendation": "Separate doses by at least 4 hours."
    },
    "levothyroxine|omeprazole": {
        "severity": "moderate",
        "description": "PPIs may reduce levothyroxine absorption",
        "recommendation": "Monitor TSH levels. May need to adjust thyroid dose."
    },
    "albuterol|propranolol": {
        "severity": "severe",
        "description": "Beta-blockers can reduce effectiveness of albuterol and worsen breathing",
        "recommendation": "Avoid non-selective beta-blockers in patients using albuterol."
    },
    "digoxin|furosemide": {
        "severity": "moderate",
        "description": "Furosemide can lower potassium, increasing risk of digoxin toxicity",
        "recommendation": "Monitor potassium and digoxin levels regularly."
    },
    "spironolactone|lisinopril": {
        "severity": "moderate",
        "description": "Both can increase potassium levels",
        "recommendation": "Monitor potassium levels closely. Watch for hyperkalemia symptoms."
    }
}

# Drug Class Interactions
# Format: "class1|class2": {"severity": "...", "description": "...", "recommendation": "..."}
CLASS_INTERACTIONS = {
    "anticoagulant|anticoagulant": {
        "severity": "severe",
        "description": "Multiple anticoagulants greatly increase bleeding risk",
        "recommendation": "Generally avoid unless specifically prescribed by specialist."
    },
    "cardiovascular|cardiovascular": {
        "severity": "moderate",
        "description": "Multiple blood pressure medications require monitoring",
        "recommendation": "Monitor blood pressure regularly for hypotension."
    },
    "diabetes|diabetes": {
        "severity": "moderate",
        "description": "Multiple diabetes medications increase hypoglycemia risk",
        "recommendation": "Monitor blood glucose closely. Have fast-acting glucose available."
    },
    "antidepressant|antidepressant": {
        "severity": "moderate",
        "description": "Multiple antidepressants may increase side effects",
        "recommendation": "Should only be used together under psychiatric supervision."
    },
    "pain_relief|pain_relief": {
        "severity": "moderate",
        "description": "Multiple pain medications may have additive effects and risks",
        "recommendation": "Use lowest effective doses. Monitor for side effects."
    },
    "anticoagulant|pain_relief": {
        "severity": "severe",
        "description": "NSAIDs increase bleeding risk with anticoagulants",
        "recommendation": "Avoid NSAIDs with anticoagulants. Use acetaminophen instead."
    }
}

# Common Side Effects by Drug
# Format: "drug_name": {"common": [...], "serious": [...]}
SIDE_EFFECTS = {
    # Cardiovascular
    "lisinopril": {
        "common": ["dry cough", "dizziness", "headache", "fatigue"],
        "serious": ["angioedema", "severe hypotension", "kidney problems", "high potassium"]
    },
    "losartan": {
        "common": ["dizziness", "back pain", "nasal congestion"],
        "serious": ["kidney problems", "high potassium", "angioedema"]
    },
    "amlodipine": {
        "common": ["swelling in ankles/feet", "flushing", "dizziness", "palpitations"],
        "serious": ["severe hypotension", "heart attack", "irregular heartbeat"]
    },
    "metoprolol": {
        "common": ["tiredness", "dizziness", "slow heartbeat", "diarrhea"],
        "serious": ["severe bradycardia", "heart block", "bronchospasm", "severe hypotension"]
    },
    "atorvastatin": {
        "common": ["muscle pain", "joint pain", "diarrhea", "nausea"],
        "serious": ["rhabdomyolysis", "liver damage", "kidney damage", "severe muscle pain"]
    },
    "simvastatin": {
        "common": ["headache", "nausea", "constipation", "muscle pain"],
        "serious": ["rhabdomyolysis", "liver damage", "severe muscle weakness"]
    },
    "warfarin": {
        "common": ["easy bruising", "minor bleeding", "hair loss"],
        "serious": ["major bleeding", "hemorrhagic stroke", "skin necrosis"]
    },

    # Diabetes
    "metformin": {
        "common": ["nausea", "diarrhea", "stomach upset", "metallic taste"],
        "serious": ["lactic acidosis", "vitamin B12 deficiency", "severe kidney problems"]
    },
    "insulin": {
        "common": ["low blood sugar", "weight gain", "injection site reactions"],
        "serious": ["severe hypoglycemia", "hypokalemia", "severe allergic reaction"]
    },
    "glipizide": {
        "common": ["low blood sugar", "nausea", "diarrhea", "dizziness"],
        "serious": ["severe hypoglycemia", "liver problems", "severe allergic reaction"]
    },
    "empagliflozin": {
        "common": ["urinary tract infections", "increased urination", "yeast infections"],
        "serious": ["diabetic ketoacidosis", "kidney problems", "severe UTI", "gangrene"]
    },

    # Antibiotics
    "amoxicillin": {
        "common": ["diarrhea", "nausea", "rash", "vomiting"],
        "serious": ["severe allergic reaction", "C. difficile infection", "liver problems"]
    },
    "azithromycin": {
        "common": ["diarrhea", "nausea", "stomach pain", "vomiting"],
        "serious": ["QT prolongation", "liver damage", "severe allergic reaction"]
    },
    "ciprofloxacin": {
        "common": ["nausea", "diarrhea", "dizziness", "headache"],
        "serious": ["tendon rupture", "QT prolongation", "nerve damage", "aortic aneurysm"]
    },
    "doxycycline": {
        "common": ["nausea", "sun sensitivity", "upset stomach", "diarrhea"],
        "serious": ["esophageal ulceration", "severe skin reaction", "liver damage"]
    },

    # Pain medications
    "ibuprofen": {
        "common": ["stomach upset", "heartburn", "dizziness", "rash"],
        "serious": ["stomach bleeding", "kidney damage", "heart attack", "stroke"]
    },
    "naproxen": {
        "common": ["stomach upset", "heartburn", "dizziness", "headache"],
        "serious": ["stomach bleeding", "kidney damage", "heart problems", "liver damage"]
    },
    "acetaminophen": {
        "common": ["nausea", "rash", "headache"],
        "serious": ["liver damage", "severe skin reactions", "severe allergic reaction"]
    },
    "tramadol": {
        "common": ["dizziness", "nausea", "constipation", "headache", "drowsiness"],
        "serious": ["seizures", "serotonin syndrome", "respiratory depression", "addiction"]
    },
    "oxycodone": {
        "common": ["constipation", "nausea", "drowsiness", "dizziness"],
        "serious": ["respiratory depression", "addiction", "overdose", "severe hypotension"]
    },

    # Antidepressants
    "sertraline": {
        "common": ["nausea", "diarrhea", "insomnia", "drowsiness", "sexual dysfunction"],
        "serious": ["serotonin syndrome", "bleeding problems", "suicidal thoughts", "mania"]
    },
    "fluoxetine": {
        "common": ["nausea", "insomnia", "anxiety", "drowsiness", "decreased appetite"],
        "serious": ["serotonin syndrome", "suicidal thoughts", "mania", "seizures"]
    },
    "citalopram": {
        "common": ["nausea", "dry mouth", "drowsiness", "insomnia", "sweating"],
        "serious": ["QT prolongation", "serotonin syndrome", "suicidal thoughts", "mania"]
    },
    "venlafaxine": {
        "common": ["nausea", "dizziness", "insomnia", "sweating", "constipation"],
        "serious": ["serotonin syndrome", "severe hypertension", "suicidal thoughts", "seizures"]
    },

    # Other common medications
    "prednisone": {
        "common": ["increased appetite", "weight gain", "insomnia", "mood changes"],
        "serious": ["osteoporosis", "infections", "adrenal suppression", "diabetes", "stomach ulcers"]
    },
    "omeprazole": {
        "common": ["headache", "nausea", "diarrhea", "stomach pain"],
        "serious": ["bone fractures", "kidney damage", "vitamin B12 deficiency", "C. difficile infection"]
    },
    "levothyroxine": {
        "common": ["hair loss", "weight changes", "nervousness"],
        "serious": ["heart problems", "osteoporosis", "severe hyperthyroidism"]
    },
    "albuterol": {
        "common": ["tremor", "nervousness", "headache", "rapid heartbeat"],
        "serious": ["severe allergic reaction", "chest pain", "irregular heartbeat", "severe hypokalemia"]
    },
    "gabapentin": {
        "common": ["drowsiness", "dizziness", "coordination problems", "fatigue"],
        "serious": ["respiratory depression", "severe allergic reaction", "suicidal thoughts"]
    },
    "furosemide": {
        "common": ["increased urination", "dizziness", "headache", "dehydration"],
        "serious": ["severe dehydration", "electrolyte imbalance", "kidney damage", "hearing loss"]
    }
}

# Standard Dosage Ranges
# Format: "drug_name": {"unit": "mg", "min": X, "max": Y, "typical_max": Z}
DOSAGE_RANGES = {
    # Cardiovascular
    "lisinopril": {"unit": "mg", "min": 2.5, "typical_max": 40, "max": 80},
    "losartan": {"unit": "mg", "min": 25, "typical_max": 100, "max": 100},
    "amlodipine": {"unit": "mg", "min": 2.5, "typical_max": 10, "max": 10},
    "metoprolol": {"unit": "mg", "min": 25, "typical_max": 200, "max": 400},
    "atenolol": {"unit": "mg", "min": 25, "typical_max": 100, "max": 100},
    "atorvastatin": {"unit": "mg", "min": 10, "typical_max": 80, "max": 80},
    "simvastatin": {"unit": "mg", "min": 5, "typical_max": 40, "max": 80},
    "rosuvastatin": {"unit": "mg", "min": 5, "typical_max": 20, "max": 40},
    "warfarin": {"unit": "mg", "min": 1, "typical_max": 10, "max": 20},
    "apixaban": {"unit": "mg", "min": 2.5, "typical_max": 5, "max": 10},
    "furosemide": {"unit": "mg", "min": 20, "typical_max": 80, "max": 600},
    "hydrochlorothiazide": {"unit": "mg", "min": 12.5, "typical_max": 50, "max": 100},
    "spironolactone": {"unit": "mg", "min": 12.5, "typical_max": 100, "max": 400},

    # Diabetes
    "metformin": {"unit": "mg", "min": 500, "typical_max": 2000, "max": 2550},
    "glipizide": {"unit": "mg", "min": 2.5, "typical_max": 20, "max": 40},
    "glyburide": {"unit": "mg", "min": 1.25, "typical_max": 10, "max": 20},
    "empagliflozin": {"unit": "mg", "min": 10, "typical_max": 25, "max": 25},
    "sitagliptin": {"unit": "mg", "min": 25, "typical_max": 100, "max": 100},

    # Pain medications
    "ibuprofen": {"unit": "mg", "min": 200, "typical_max": 800, "max": 3200},
    "naproxen": {"unit": "mg", "min": 220, "typical_max": 500, "max": 1500},
    "acetaminophen": {"unit": "mg", "min": 325, "typical_max": 1000, "max": 4000},
    "tramadol": {"unit": "mg", "min": 25, "typical_max": 100, "max": 400},
    "oxycodone": {"unit": "mg", "min": 5, "typical_max": 30, "max": 160},
    "gabapentin": {"unit": "mg", "min": 100, "typical_max": 1200, "max": 3600},

    # Antibiotics (daily dose)
    "amoxicillin": {"unit": "mg", "min": 250, "typical_max": 500, "max": 1000},
    "azithromycin": {"unit": "mg", "min": 250, "typical_max": 500, "max": 500},
    "ciprofloxacin": {"unit": "mg", "min": 250, "typical_max": 750, "max": 1500},
    "doxycycline": {"unit": "mg", "min": 50, "typical_max": 200, "max": 200},
    "cephalexin": {"unit": "mg", "min": 250, "typical_max": 500, "max": 1000},

    # Antidepressants
    "sertraline": {"unit": "mg", "min": 25, "typical_max": 200, "max": 200},
    "fluoxetine": {"unit": "mg", "min": 10, "typical_max": 80, "max": 80},
    "citalopram": {"unit": "mg", "min": 10, "typical_max": 40, "max": 40},
    "escitalopram": {"unit": "mg", "min": 5, "typical_max": 20, "max": 20},
    "venlafaxine": {"unit": "mg", "min": 37.5, "typical_max": 225, "max": 375},
    "bupropion": {"unit": "mg", "min": 75, "typical_max": 300, "max": 450},

    # Other common medications
    "prednisone": {"unit": "mg", "min": 2.5, "typical_max": 60, "max": 100},
    "omeprazole": {"unit": "mg", "min": 10, "typical_max": 40, "max": 120},
    "pantoprazole": {"unit": "mg", "min": 20, "typical_max": 40, "max": 80},
    "levothyroxine": {"unit": "mg", "min": 0.025, "typical_max": 0.2, "max": 0.3},
    "albuterol": {"unit": "mg", "min": 2, "typical_max": 4, "max": 8},
    "montelukast": {"unit": "mg", "min": 4, "typical_max": 10, "max": 10},
    "alprazolam": {"unit": "mg", "min": 0.25, "typical_max": 2, "max": 4},
    "lorazepam": {"unit": "mg", "min": 0.5, "typical_max": 3, "max": 10}
}

# Complementary Drug Combinations (not duplicates)
# Format: "therapeutic_class": [["drug1", "drug2"], ...]
COMPLEMENTARY_COMBOS = {
    "cardiovascular": [
        ["lisinopril", "amlodipine"],  # ACE + CCB for BP
        ["lisinopril", "hydrochlorothiazide"],  # ACE + diuretic
        ["metoprolol", "amlodipine"],  # Beta-blocker + CCB
        ["atorvastatin", "ezetimibe"],  # Statin + cholesterol absorption inhibitor
    ],
    "diabetes": [
        ["metformin", "insulin"],  # Complementary mechanisms
        ["metformin", "glipizide"],  # Metformin + sulfonylurea
        ["metformin", "empagliflozin"],  # Metformin + SGLT2 inhibitor
        ["insulin", "metformin"],  # Often used together
    ],
    "pain_relief": [
        ["acetaminophen", "ibuprofen"],  # Different mechanisms for pain
    ]
}

# Therapeutic Class Definitions
THERAPEUTIC_CLASSES = {
    "ace_inhibitors": ["lisinopril", "enalapril", "ramipril", "captopril"],
    "arbs": ["losartan", "valsartan", "irbesartan", "olmesartan"],
    "beta_blockers": ["metoprolol", "atenolol", "carvedilol", "propranolol"],
    "calcium_channel_blockers": ["amlodipine", "diltiazem", "verapamil", "nifedipine"],
    "statins": ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin"],
    "diuretics": ["furosemide", "hydrochlorothiazide", "spironolactone", "chlorthalidone"],
    "anticoagulants": ["warfarin", "apixaban", "rivaroxaban", "dabigatran"],
    "sulfonylureas": ["glipizide", "glyburide", "glimepiride"],
    "biguanides": ["metformin"],
    "sglt2_inhibitors": ["empagliflozin", "dapagliflozin", "canagliflozin"],
    "dpp4_inhibitors": ["sitagliptin", "linagliptin", "saxagliptin"],
    "ssri": ["sertraline", "fluoxetine", "citalopram", "escitalopram", "paroxetine"],
    "snri": ["venlafaxine", "duloxetine", "desvenlafaxine"],
    "nsaids": ["ibuprofen", "naproxen", "diclofenac", "celecoxib"],
    "opioids": ["oxycodone", "hydrocodone", "tramadol", "morphine", "codeine"],
    "proton_pump_inhibitors": ["omeprazole", "pantoprazole", "lansoprazole", "esomeprazole"]
}
