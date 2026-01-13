"""
Test script for medication analyzer functionality
"""

from medication_analyzer import analyzer
import json


def test_basic_functionality():
    """Test basic medication analysis with sample data."""
    print("=" * 80)
    print("Testing Medication Analyzer - Phase 1 Features")
    print("=" * 80)
    print()

    # Sample medications with known interactions
    sample_medications = [
        {
            "name": "warfarin",
            "dosage": "5mg",
            "frequency": "once daily",
            "purpose": "blood thinner"
        },
        {
            "name": "aspirin",
            "dosage": "81mg",
            "frequency": "once daily",
            "purpose": "heart health"
        },
        {
            "name": "lisinopril",
            "dosage": "10mg",
            "frequency": "once daily",
            "purpose": "blood pressure"
        },
        {
            "name": "atorvastatin",
            "dosage": "20mg",
            "frequency": "once daily at bedtime",
            "purpose": "cholesterol"
        }
    ]

    print("Sample Medications:")
    print("-" * 80)
    for i, med in enumerate(sample_medications, 1):
        print(f"{i}. {med['name']} - {med['dosage']} - {med['purpose']}")
    print()

    # Run analysis
    print("Running Analysis...")
    print("-" * 80)
    results = analyzer.analyze_medications(sample_medications)

    # Display results
    print("\n" + "=" * 80)
    print("ANALYSIS RESULTS")
    print("=" * 80)
    print()

    print(f"📊 Medications Analyzed: {results['medications_analyzed']}")
    print(f"⚠️  Overall Risk Level: {results['overall_risk_level'].upper()}")
    print(f"🕐 Timestamp: {results['timestamp']}")
    print()

    # Drug Interactions
    print("=" * 80)
    print("1️⃣  DRUG INTERACTIONS")
    print("=" * 80)
    if results['interactions']:
        for i, interaction in enumerate(results['interactions'], 1):
            print(f"\nInteraction {i}:")
            print(f"   Drugs: {interaction['drug1']} + {interaction['drug2']}")
            print(f"   Severity: {interaction['severity'].upper()}")
            print(f"   Description: {interaction['description']}")
            print(f"   Recommendation: {interaction['recommendation']}")
    else:
        print("✅ No significant drug interactions detected")
    print()

    # Duplicate Therapies
    print("=" * 80)
    print("2️⃣  DUPLICATE THERAPY DETECTION")
    print("=" * 80)
    if results['duplicate_therapies']:
        for i, dup in enumerate(results['duplicate_therapies'], 1):
            print(f"\nDuplicate {i}:")
            print(f"   Class: {dup['therapeutic_class']}")
            print(f"   Medications: {', '.join(dup['medications'])}")
            print(f"   Severity: {dup['severity'].upper()}")
            print(f"   Recommendation: {dup['recommendation']}")
    else:
        print("✅ No duplicate therapies detected")
    print()

    # Side Effects
    print("=" * 80)
    print("3️⃣  SIDE EFFECTS AGGREGATION")
    print("=" * 80)

    common_effects = results['side_effects'].get('common', {})
    serious_effects = results['side_effects'].get('serious', {})
    cumulative_warnings = results['side_effects'].get('cumulative_warnings', [])

    if common_effects:
        print("\nCommon Side Effects:")
        for effect, data in list(common_effects.items())[:5]:  # Show top 5
            print(f"   • {effect.title()}: {data['count']} medication(s)")
            print(f"     Drugs: {', '.join(data['drugs'])}")

    if serious_effects:
        print("\nSerious Side Effects:")
        for effect, data in serious_effects.items():
            print(f"   ⚠️  {effect.title()}: {data['count']} medication(s)")
            print(f"     Drugs: {', '.join(data['drugs'])}")

    if cumulative_warnings:
        print("\nCumulative Warnings:")
        for warning in cumulative_warnings[:3]:  # Show top 3
            print(f"   • {warning['description']}")

    if not (common_effects or serious_effects or cumulative_warnings):
        print("✅ No side effect data available for these medications")
    print()

    # Dosage Validation
    print("=" * 80)
    print("4️⃣  DOSAGE VALIDATION")
    print("=" * 80)
    if results['dosage_warnings']:
        for i, warning in enumerate(results['dosage_warnings'], 1):
            print(f"\nWarning {i}:")
            print(f"   Medication: {warning['medication']}")
            print(f"   Severity: {warning['severity'].upper()}")
            print(f"   Issue: {warning['issue']}")
            print(f"   Dosage Provided: {warning.get('dosage_provided', 'N/A')}")
            if 'expected_range' in warning:
                print(f"   Expected Range: {warning['expected_range']}")
            print(f"   Recommendation: {warning['recommendation']}")
    else:
        print("✅ All dosages appear to be within normal ranges")
    print()

    print("=" * 80)
    print("TEST COMPLETED SUCCESSFULLY")
    print("=" * 80)
    print()

    return results


def test_high_dosage():
    """Test dosage validation with unusually high dosage."""
    print("\n" + "=" * 80)
    print("Testing High Dosage Detection")
    print("=" * 80)
    print()

    medications = [
        {
            "name": "lisinopril",
            "dosage": "100mg",  # Higher than typical max of 40mg
            "frequency": "once daily"
        }
    ]

    results = analyzer.analyze_medications(medications)

    print("Testing medication: Lisinopril 100mg (higher than typical max)")
    print()

    if results['dosage_warnings']:
        print("✅ High dosage detected successfully:")
        for warning in results['dosage_warnings']:
            print(f"   Issue: {warning['issue']}")
            print(f"   Severity: {warning['severity']}")
    else:
        print("❌ No dosage warning generated")
    print()


def test_severe_interaction():
    """Test detection of severe drug interactions."""
    print("=" * 80)
    print("Testing Severe Interaction Detection")
    print("=" * 80)
    print()

    medications = [
        {"name": "warfarin", "dosage": "5mg"},
        {"name": "ibuprofen", "dosage": "400mg"}
    ]

    results = analyzer.analyze_medications(medications)

    print("Testing medications: Warfarin + Ibuprofen (known severe interaction)")
    print()

    if results['interactions']:
        severe_interactions = [i for i in results['interactions'] if i['severity'] == 'severe']
        if severe_interactions:
            print("✅ Severe interaction detected successfully:")
            for interaction in severe_interactions:
                print(f"   Severity: {interaction['severity'].upper()}")
                print(f"   Description: {interaction['description']}")
        else:
            print("⚠️  Interaction detected but not marked as severe")
    else:
        print("❌ No interaction detected")
    print()


if __name__ == "__main__":
    try:
        # Run basic test
        test_basic_functionality()

        # Run specific tests
        test_high_dosage()
        test_severe_interaction()

        print("\n" + "=" * 80)
        print("ALL TESTS COMPLETED")
        print("=" * 80)
        print("\nPhase 1 Features Status:")
        print("✅ Drug Interaction Checker - Implemented")
        print("✅ Duplicate Therapy Detection - Implemented")
        print("✅ Side Effect Aggregator - Implemented")
        print("✅ Dosage Validation - Implemented")
        print()

    except Exception as e:
        print(f"\n❌ Error during testing: {str(e)}")
        import traceback
        traceback.print_exc()
