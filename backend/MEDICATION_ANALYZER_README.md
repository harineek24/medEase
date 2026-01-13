# Medication Analyzer - Phase 1 Features

## Overview

The Medication Analyzer is a comprehensive drug safety checking system integrated into MedEase. It provides real-time analysis of medication lists to identify potential safety concerns including drug interactions, duplicate therapies, cumulative side effects, and dosage issues.

## Features Implemented (Phase 1)

### 1. Drug Interaction Checker ✅

Identifies potentially dangerous interactions between medications using:
- **Curated interaction database**: 30+ common drug-drug interactions with severity levels
- **Class-level interactions**: Detects interactions between drug classes (e.g., anticoagulant + NSAID)
- **RxNorm API integration**: Enriches drug data with standardized nomenclature and classifications
- **Severity levels**: Categorizes interactions as severe, moderate, or mild

**Example interactions detected:**
- Warfarin + Aspirin (Severe) - Increased bleeding risk
- Warfarin + Ibuprofen (Severe) - NSAID with anticoagulant
- Lisinopril + Potassium (Moderate) - Hyperkalemia risk
- Metoprolol + Verapamil (Severe) - Bradycardia risk

### 2. Duplicate Therapy Detection ✅

Identifies when multiple medications serve the same therapeutic purpose:
- **Therapeutic class grouping**: Groups medications by purpose (cardiovascular, diabetes, pain, etc.)
- **Complementary combo detection**: Distinguishes intentional combinations from true duplicates
- **Smart filtering**: Recognizes common complementary combinations (e.g., metformin + insulin)
- **Warnings**: Alerts when multiple drugs in the same class may be unintentional

**Example detections:**
- Two different blood pressure medications (unless intentionally combined)
- Multiple NSAIDs for pain relief
- Duplicate antidepressants
- Multiple diabetes medications (with smart detection of complementary combinations)

### 3. Side Effect Aggregator ✅

Aggregates and analyzes side effects across all medications:
- **Comprehensive database**: 40+ common medications with known side effects
- **Common vs. serious**: Separates routine side effects from serious adverse events
- **Cumulative warnings**: Highlights when multiple drugs cause the same side effect
- **Risk amplification**: Identifies when side effect risk is increased by multiple medications

**Tracked effects include:**
- Common: nausea, dizziness, headache, drowsiness, etc.
- Serious: bleeding, liver damage, kidney problems, cardiac issues, etc.

### 4. Dosage Validation ✅

Validates medication dosages against established safe ranges:
- **Standard dosage ranges**: Database of typical and maximum safe doses for 60+ medications
- **Unit normalization**: Converts between mg, g, mcg for accurate comparison
- **Three-tier warnings**:
  - Below minimum dose (moderate severity)
  - Above typical maximum (moderate severity)
  - Exceeds maximum safe dose (severe severity)
- **Flexible parsing**: Handles various dosage formats (e.g., "10mg", "10 mg", "10mg twice daily")

## API Endpoint

### POST `/api/analyze-medications`

Analyzes a list of medications for safety concerns.

**Request Body:**
```json
{
  "medications": [
    {
      "name": "lisinopril",
      "dosage": "10mg",
      "frequency": "once daily",
      "purpose": "blood pressure"
    },
    {
      "name": "atorvastatin",
      "dosage": "20mg",
      "frequency": "once daily",
      "purpose": "cholesterol"
    }
  ]
}
```

**Response:**
```json
{
  "medications_analyzed": 2,
  "timestamp": "2026-01-13T04:40:16.881122",
  "overall_risk_level": "low",
  "interactions": [
    {
      "drug1": "warfarin",
      "drug2": "aspirin",
      "severity": "severe",
      "description": "Increased risk of bleeding when combining anticoagulants",
      "recommendation": "Use together only under close medical supervision. Monitor INR frequently."
    }
  ],
  "duplicate_therapies": [
    {
      "therapeutic_class": "cardiovascular",
      "medications": ["lisinopril", "atorvastatin"],
      "severity": "moderate",
      "description": "Multiple medications for cardiovascular",
      "recommendation": "Verify if multiple drugs in this class are intentional"
    }
  ],
  "side_effects": {
    "common": {
      "dizziness": {
        "count": 2,
        "drugs": ["lisinopril", "atorvastatin"]
      }
    },
    "serious": {
      "liver_damage": {
        "count": 1,
        "drugs": ["atorvastatin"]
      }
    },
    "cumulative_warnings": [
      {
        "effect": "dizziness",
        "severity": "moderate",
        "description": "Multiple medications (2) may cause dizziness",
        "drugs": ["lisinopril", "atorvastatin"]
      }
    ]
  },
  "dosage_warnings": [
    {
      "medication": "lisinopril",
      "severity": "severe",
      "issue": "Exceeds maximum safe dose",
      "dosage_provided": "100mg",
      "expected_range": "2.5-40 mg",
      "recommendation": "Contact healthcare provider immediately"
    }
  ]
}
```

## Architecture

### Files

- **`medication_analyzer.py`**: Core analysis engine with main `MedicationAnalyzer` class
- **`drug_data.py`**: Curated database of interactions, side effects, dosages, and drug classes
- **`main.py`**: FastAPI endpoint integration

### Data Sources

1. **RxNorm API** (Primary):
   - Drug nomenclature and RxCUI codes
   - Drug classification and therapeutic classes
   - Fallback to local guessing if API unavailable

2. **Local Curated Database** (drug_data.py):
   - 30+ common drug interactions
   - 40+ medications with side effect profiles
   - 60+ medications with dosage ranges
   - Therapeutic class definitions
   - Known complementary combinations

### Key Classes and Methods

#### `MedicationAnalyzer`

Main analysis class with methods:

- `analyze_medications(medications)` - Main entry point for complete analysis
- `check_interactions(medications)` - Drug interaction checking
- `detect_duplicate_therapy(medications)` - Duplicate therapy detection
- `aggregate_side_effects(medications)` - Side effect aggregation
- `validate_dosages(medications)` - Dosage validation

### Risk Level Calculation

Overall risk level is calculated based on:
- **High**: Any severe interactions or severe dosage issues
- **Moderate**: Multiple moderate issues (3+) or some moderate issues (1-2)
- **Low**: No significant issues found

## Testing

Run the test suite:

```bash
cd backend
python test_medication_analyzer.py
```

The test suite validates:
- Drug interaction detection (including severe interactions)
- Duplicate therapy identification
- Side effect aggregation
- Dosage validation (including high dosage detection)

## Future Enhancements (Phase 2+)

Potential improvements for future phases:

1. **Enhanced Data Sources**:
   - FDA openFDA API integration for adverse events
   - DrugBank API for more comprehensive interactions
   - Real-time updates from pharmacovigilance databases

2. **Advanced Features**:
   - Allergy checking
   - Contraindication detection (age, pregnancy, conditions)
   - Drug-food interactions
   - Temporal analysis (timing of doses)
   - Renal/hepatic dose adjustments

3. **Machine Learning**:
   - Pattern recognition in medication lists
   - Personalized risk scoring
   - Adverse event prediction

4. **Integration**:
   - Extract medications from EHR summaries automatically
   - Connect to pharmacy databases
   - Integration with electronic prescribing systems

## Dependencies

New dependencies added in Phase 1:
- `requests==2.31.0` - For RxNorm API calls

Existing dependencies remain unchanged.

## Limitations

1. **Data Coverage**: Not all medications are in the local database (falls back to RxNorm API)
2. **Interaction Database**: Covers common interactions but not exhaustive
3. **Clinical Context**: Cannot assess patient-specific factors (age, weight, kidney function, etc.)
4. **Medical Disclaimer**: Tool is for informational purposes only, not a replacement for professional medical advice

## Medical Disclaimer

⚠️ **IMPORTANT**: This medication analyzer is a decision support tool and should NOT be used as a substitute for professional medical advice, diagnosis, or treatment. Healthcare providers should use their clinical judgment when interpreting results. Patients should consult their healthcare providers before making any changes to their medications.

## License

Part of the MedEase project. See main project LICENSE for details.

## Contributors

Developed as Phase 1 of the MedEase Drug Interaction Checker feature.
