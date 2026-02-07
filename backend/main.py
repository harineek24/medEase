import os
import base64
import json
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

import google.generativeai as genai
from fastapi import FastAPI, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Import medication analyzer
from medication_analyzer import analyzer

# Import database and chat handlers
import database as db
from chat_handler import patient_chat, general_chat, check_quick_response, doctor_consultation, generate_consultation_summary
from voice_service import voice_service, CONSULTATION_FIELDS, ConsultationConfig, DEFAULT_CONSULTATION_FIELDS, AVAILABLE_VOICES

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="MedEase - EHR Summarizer API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in environment variables")

genai.configure(api_key=GEMINI_API_KEY)

# Initialize Gemini model
model = genai.GenerativeModel('gemini-2.5-flash-preview-09-2025')

# Constants
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
OUTPUTS_DIR = Path("outputs/summaries")

# Ensure outputs directory exists
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

# Pydantic models
class SummaryResponse(BaseModel):
    summary: str
    markdown_path: str
    patient_name: Optional[str]
    date_processed: str


class Medication(BaseModel):
    name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    purpose: Optional[str] = None


class MedicationAnalysisRequest(BaseModel):
    medications: List[Medication]


class MedicationAnalysisResponse(BaseModel):
    medications_analyzed: int
    timestamp: str
    interactions: List[Dict[str, Any]]
    duplicate_therapies: List[Dict[str, Any]]
    side_effects: Dict[str, Any]
    dosage_warnings: List[Dict[str, Any]]
    overall_risk_level: str


class ExtractMedicationsRequest(BaseModel):
    summary: str


class MedicationDetailRequest(BaseModel):
    medication_name: str
    dosage: Optional[str] = None
    all_medications: List[Medication] = []


class PatientOverviewResponse(BaseModel):
    patient_name: Optional[str] = None
    visit_date: Optional[str] = None
    hospital: Optional[str] = None
    visit_type: Optional[str] = None


class TestResultResponse(BaseModel):
    name: str
    value: str
    status: str
    explanation: Optional[str] = None


# Chat request models
class PatientChatRequest(BaseModel):
    message: str
    session_id: str
    summary_id: Optional[int] = None
    summary_text: str
    medications: List[Dict[str, Any]] = []
    test_results: List[Dict[str, Any]] = []
    interactions: List[Dict[str, Any]] = []
    patient_id: Optional[int] = None


class GeneralChatRequest(BaseModel):
    message: str
    session_id: str


class ChatResponse(BaseModel):
    response: str
    session_id: str
    timestamp: str


class DoctorConsultRequest(BaseModel):
    message: str
    session_id: str
    patient_id: Optional[int] = None
    patient_name: Optional[str] = None
    chief_complaint: Optional[str] = None


class ConsultationSummaryRequest(BaseModel):
    session_id: str


# Patient record models
class CreatePatientRequest(BaseModel):
    name: str
    date_of_birth: Optional[str] = None


class SaveSummaryRequest(BaseModel):
    patient_name: str
    raw_summary: str
    file_path: Optional[str] = None
    original_filename: Optional[str] = None
    diagnosis: Optional[str] = None
    visit_date: Optional[str] = None
    visit_location: Optional[str] = None
    next_steps: Optional[str] = None
    warning_signs: Optional[str] = None
    medications: List[Dict[str, Any]] = []
    test_results: List[Dict[str, Any]] = []
    interactions: List[Dict[str, Any]] = []


def get_mime_type(filename: str) -> str:
    """Get MIME type based on file extension."""
    ext = Path(filename).suffix.lower()
    mime_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }
    return mime_types.get(ext, "application/octet-stream")


def create_ehr_prompt() -> str:
    """Create a detailed prompt for Gemini to generate patient-friendly summaries."""
    return """You are a compassionate medical interpreter helping patients understand their medical records.
Analyze the provided medical document and create a patient-friendly summary.

CRITICAL INSTRUCTIONS:
- Use simple, everyday language (avoid medical jargon)
- Be empathetic and reassuring in tone
- Organize information clearly with headers and sections
- Use emojis sparingly for visual cues only
- Be accurate but understandable
- Focus on what matters to the patient

FORMAT YOUR RESPONSE EXACTLY AS FOLLOWS:

## 📋 Quick Overview
[Extract: Patient name, date of visit/admission, hospital/clinic name, type of visit]

## ❤️ What Happened
[Explain the diagnosis, condition, or reason for visit in plain English. Avoid terms like "acute myocardial infarction" - say "heart attack" instead]

## 💊 Your Medications
[List each medication with:
- Name (brand name if available)
- What it's for in simple terms
- How to take it
Example: "Lisinopril (blood pressure pill) - Take one tablet every morning"]

## 🔬 Test Results
[Present test results in simple terms:
- Mark normal results with ✓
- Mark abnormal results with ⚠️
- Explain what each test measures
Example: "Blood sugar: 95 ✓ (Normal - good control!)"]

## 📅 What to Do Next
[List follow-up care instructions:
- Appointments to schedule
- Lifestyle changes
- Things to monitor at home
Be specific with timeframes]

## 🚨 When to Seek Immediate Help
[List warning signs that require emergency care:
- Specific symptoms to watch for
- When to call 911 vs. when to call the doctor
Be clear and direct]

---

**Important Notes:**
- If any information is unclear or missing from the document, indicate this
- Do not make up or assume medical information
- Focus on actionable guidance for the patient

Now, please analyze the provided medical document and create the summary following this exact format."""


def extract_patient_name(summary: str) -> Optional[str]:
    """Extract patient name from the summary."""
    try:
        # Look for patient name in Quick Overview section
        lines = summary.split('\n')
        for i, line in enumerate(lines):
            if 'Quick Overview' in line and i + 1 < len(lines):
                # Check next few lines for patient name
                for j in range(i + 1, min(i + 5, len(lines))):
                    if 'patient' in lines[j].lower() or 'name' in lines[j].lower():
                        # Extract name (simple heuristic)
                        parts = lines[j].split(':')
                        if len(parts) > 1:
                            name = parts[1].strip().split(',')[0].strip()
                            # Remove asterisks and extra formatting
                            name = name.replace('*', '').strip()
                            if name and len(name) > 2:
                                return name
        return "Patient"
    except Exception:
        return "Patient"


def save_markdown(summary: str, patient_name: str) -> str:
    """Save the summary as a markdown file."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # Clean patient name for filename
    safe_name = "".join(c for c in patient_name if c.isalnum() or c in (' ', '-', '_')).strip()
    safe_name = safe_name.replace(' ', '_')
    if not safe_name:
        safe_name = "Patient"

    filename = f"{safe_name}_{timestamp}.md"
    filepath = OUTPUTS_DIR / filename

    # Add metadata and disclaimer to the markdown file
    full_content = f"""# EHR Summary - {patient_name}

**Generated:** {datetime.now().strftime("%B %d, %Y at %I:%M %p")}
**System:** MedEase EHR Summarizer

---

⚠️ **MEDICAL DISCLAIMER**
This summary was generated by an AI system and is intended for informational purposes only.
It is NOT a substitute for professional medical advice, diagnosis, or treatment.
Always consult with your healthcare provider about your medical conditions and treatment options.

---

{summary}

---

*Generated by MedEase - Making Healthcare Understandable*
"""

    filepath.write_text(full_content, encoding='utf-8')
    return str(filepath)


@app.get("/")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "MedEase EHR Summarizer API",
        "version": "1.0.0",
        "gemini_configured": bool(GEMINI_API_KEY)
    }


@app.get("/api/summaries")
async def list_summaries():
    """List all saved summaries."""
    try:
        summaries = []
        for filepath in sorted(OUTPUTS_DIR.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True):
            summaries.append({
                "filename": filepath.name,
                "path": str(filepath),
                "created": datetime.fromtimestamp(filepath.stat().st_mtime).isoformat(),
                "size": filepath.stat().st_size
            })
        return {"summaries": summaries, "count": len(summaries)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing summaries: {str(e)}")


@app.post("/api/summarize")
async def summarize_ehr(file: UploadFile = File(...)):
    """
    Process an EHR document and generate a patient-friendly summary.

    Accepts: PDF, PNG, JPG files (max 25MB)
    Returns: Summary text, markdown file path, patient name, processing date
    """
    try:
        # Validate file extension
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
            )

        # Read file content
        file_content = await file.read()

        # Validate file size
        if len(file_content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.0f}MB"
            )

        # Convert to base64
        file_base64 = base64.b64encode(file_content).decode('utf-8')
        mime_type = get_mime_type(file.filename)

        # Prepare the file data for Gemini
        file_data = {
            'mime_type': mime_type,
            'data': file_base64
        }

        # Generate summary using Gemini
        prompt = create_ehr_prompt()

        try:
            response = model.generate_content([prompt, file_data])
            summary = response.text
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error generating summary with Gemini API: {str(e)}"
            )

        # Extract patient name from summary
        patient_name = extract_patient_name(summary)

        # Save markdown file
        markdown_path = save_markdown(summary, patient_name)

        # Return response
        return JSONResponse(content={
            "summary": summary,
            "markdown_path": markdown_path,
            "patient_name": patient_name,
            "date_processed": datetime.now().isoformat()
        })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )


@app.post("/api/analyze-medications")
async def analyze_medications(request: MedicationAnalysisRequest):
    """
    Analyze medications for interactions, duplicates, side effects, and dosage issues.

    Accepts: List of medications with name, dosage, frequency, and purpose
    Returns: Comprehensive analysis including:
        - Drug-drug interactions
        - Duplicate therapy detection
        - Aggregated side effects
        - Dosage validation warnings
    """
    try:
        # Validate input
        if not request.medications:
            raise HTTPException(
                status_code=400,
                detail="No medications provided for analysis"
            )

        if len(request.medications) > 50:
            raise HTTPException(
                status_code=400,
                detail="Too many medications. Maximum 50 medications can be analyzed at once."
            )

        # Convert Pydantic models to dictionaries
        medications = [med.model_dump() for med in request.medications]

        # Perform analysis
        try:
            results = analyzer.analyze_medications(medications)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error during medication analysis: {str(e)}"
            )

        # Return results
        return JSONResponse(content=results)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )


@app.post("/api/extract-medications")
async def extract_medications(request: ExtractMedicationsRequest):
    """
    Extract medications from EHR summary text using Gemini AI.

    Returns: List of medications with name, dosage, frequency, and purpose
    """
    try:
        prompt = """Analyze the following medical summary and extract ALL medications mentioned.

For each medication, extract:
- name: The medication name (generic or brand name)
- dosage: The dosage amount (e.g., "10mg", "500mg")
- frequency: How often it's taken (e.g., "once daily", "twice daily", "as needed")
- purpose: What it's for (e.g., "blood pressure", "diabetes", "pain relief")

Return ONLY a JSON array with no additional text. Format:
[
  {"name": "Medication Name", "dosage": "10mg", "frequency": "once daily", "purpose": "condition"},
  ...
]

If no medications are found, return an empty array: []

Medical Summary:
""" + request.summary

        try:
            response = model.generate_content(prompt)
            medications_text = response.text.strip()

            # Clean up the response - remove markdown code blocks if present
            if medications_text.startswith("```json"):
                medications_text = medications_text.replace("```json", "").replace("```", "").strip()
            elif medications_text.startswith("```"):
                medications_text = medications_text.replace("```", "").strip()

            # Parse JSON
            import json
            medications = json.loads(medications_text)

            return JSONResponse(content={
                "medications": medications,
                "count": len(medications)
            })

        except json.JSONDecodeError as e:
            # If JSON parsing fails, return empty list
            print(f"JSON decode error: {e}, Response was: {medications_text}")
            return JSONResponse(content={
                "medications": [],
                "count": 0,
                "error": "Failed to parse medications from summary"
            })

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error extracting medications: {str(e)}"
        )


@app.post("/api/extract-patient-overview")
async def extract_patient_overview(request: ExtractMedicationsRequest):
    """
    Extract patient overview information from EHR summary using Gemini AI.

    Returns: Patient name, visit date, hospital, and visit type
    """
    try:
        prompt = """Analyze the following medical summary and extract patient overview information.

Extract the following fields if present:
- patient_name: The patient's full name
- visit_date: Date of visit or admission
- hospital: Hospital or clinic name
- visit_type: Type of visit (e.g., "Annual Checkup", "Emergency Visit", "Follow-up")

Return ONLY a JSON object with no additional text. Format:
{
  "patient_name": "name or null",
  "visit_date": "date or null",
  "hospital": "hospital name or null",
  "visit_type": "visit type or null"
}

Use null for any fields not found in the summary.

Medical Summary:
""" + request.summary

        try:
            response = model.generate_content(prompt)
            overview_text = response.text.strip()

            # Clean up the response
            if overview_text.startswith("```json"):
                overview_text = overview_text.replace("```json", "").replace("```", "").strip()
            elif overview_text.startswith("```"):
                overview_text = overview_text.replace("```", "").strip()

            overview_data = json.loads(overview_text)

            return JSONResponse(content=overview_data)

        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}, Response was: {overview_text}")
            return JSONResponse(content={
                "patient_name": None,
                "visit_date": None,
                "hospital": None,
                "visit_type": None
            })

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error extracting patient overview: {str(e)}"
        )


@app.post("/api/extract-test-results")
async def extract_test_results(request: ExtractMedicationsRequest):
    """
    Extract test results from EHR summary using Gemini AI.

    Returns: List of test results with name, value, status, and explanation
    """
    try:
        prompt = """Analyze the following medical summary and extract ALL test results mentioned.

For each test result, extract:
- name: The test name (e.g., "Blood Sugar", "Cholesterol", "Blood Pressure")
- value: The test value with units (e.g., "95 mg/dL", "120/80 mmHg")
- status: One of "normal", "borderline", or "abnormal"
- explanation: Brief explanation if provided (e.g., "Good control", "Slightly elevated")

Return ONLY a JSON array with no additional text. Format:
[
  {"name": "Test Name", "value": "value with units", "status": "normal", "explanation": "optional explanation"},
  ...
]

If no test results are found, return an empty array: []

Medical Summary:
""" + request.summary

        try:
            response = model.generate_content(prompt)
            tests_text = response.text.strip()

            # Clean up the response
            if tests_text.startswith("```json"):
                tests_text = tests_text.replace("```json", "").replace("```", "").strip()
            elif tests_text.startswith("```"):
                tests_text = tests_text.replace("```", "").strip()

            test_results = json.loads(tests_text)

            return JSONResponse(content={
                "test_results": test_results,
                "count": len(test_results)
            })

        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}, Response was: {tests_text}")
            return JSONResponse(content={
                "test_results": [],
                "count": 0,
                "error": "Failed to parse test results from summary"
            })

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error extracting test results: {str(e)}"
        )


@app.post("/api/medication-details")
async def get_medication_details(request: MedicationDetailRequest):
    """
    Get detailed information about a specific medication including:
    - Drug profile (FDA approval, developer, usage statistics)
    - Natural dietary sources and recommendations
    - Interactions with other medications in the patient's list
    - Side effects
    - How it works (mechanism of action)
    """
    try:
        medication_name = request.medication_name
        dosage = request.dosage or "standard dose"
        all_meds = request.all_medications

        # Build prompt for Gemini to get comprehensive medication information
        other_meds = [m.name for m in all_meds if m.name.lower() != medication_name.lower()]
        other_meds_text = ", ".join(other_meds) if other_meds else "none"

        prompt = f"""Provide comprehensive information about the medication: {medication_name}

Please structure your response as a JSON object with the following sections:

{{
  "drug_profile": {{
    "generic_name": "generic name",
    "brand_names": ["brand name 1", "brand name 2"],
    "fda_approval_year": "year or 'Unknown'",
    "developer": "pharmaceutical company",
    "usage_level": "Very Common/Common/Moderate/Rare"
  }},
  "dietary_recommendations": {{
    "beneficial_foods": ["food 1 with brief explanation", "food 2 with brief explanation"],
    "foods_to_avoid": ["food 1 with reason", "food 2 with reason"],
    "nutritional_support": "brief advice on diet to support this medication's effects"
  }},
  "how_it_works": "Plain English explanation of mechanism of action (2-3 sentences)",
  "common_side_effects": [
    {{"effect": "side effect name", "frequency": "percentage or 'common/uncommon'"}}
  ],
  "serious_side_effects": ["serious effect 1", "serious effect 2"],
  "therapeutic_class": "drug class category"
}}

Additional context:
- Patient's dosage: {dosage}
- Other medications patient is taking: {other_meds_text}

Please be accurate, patient-friendly, and concise. Return ONLY the JSON object with no additional text."""

        try:
            response = model.generate_content(prompt)
            details_text = response.text.strip()

            # Clean up response
            if details_text.startswith("```json"):
                details_text = details_text.replace("```json", "").replace("```", "").strip()
            elif details_text.startswith("```"):
                details_text = details_text.replace("```", "").strip()

            import json
            medication_details = json.loads(details_text)

            # Now analyze interactions with other medications
            if all_meds:
                # Convert request medications to dict format
                meds_for_analysis = [med.model_dump() for med in all_meds]
                analysis_results = analyzer.analyze_medications(meds_for_analysis)

                # Filter interactions relevant to this specific medication
                relevant_interactions = [
                    interaction for interaction in analysis_results["interactions"]
                    if medication_name.lower() in interaction["drug1"].lower()
                    or medication_name.lower() in interaction["drug2"].lower()
                ]

                # Filter dosage warnings for this medication
                relevant_dosage_warnings = [
                    warning for warning in analysis_results["dosage_warnings"]
                    if medication_name.lower() in warning["medication"].lower()
                ]

                medication_details["your_analysis"] = {
                    "dosage_status": relevant_dosage_warnings[0] if relevant_dosage_warnings else {
                        "medication": medication_name,
                        "severity": "normal",
                        "issue": "Dosage within normal range",
                        "dosage_provided": dosage
                    },
                    "interactions": relevant_interactions,
                    "overall_risk": analysis_results["overall_risk_level"]
                }
            else:
                medication_details["your_analysis"] = {
                    "dosage_status": {"medication": medication_name, "severity": "normal", "issue": "No analysis performed"},
                    "interactions": [],
                    "overall_risk": "low"
                }

            return JSONResponse(content=medication_details)

        except json.JSONDecodeError as e:
            print(f"JSON decode error for medication details: {e}, Response was: {details_text}")
            raise HTTPException(
                status_code=500,
                detail="Failed to parse medication details from AI response"
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error getting medication details: {str(e)}"
        )


# =============================================================================
# Database & Patient Endpoints
# =============================================================================

@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics for analytics view."""
    try:
        stats = db.get_dashboard_stats()
        return JSONResponse(content=stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting dashboard stats: {str(e)}")


@app.get("/api/patients")
async def get_patients(search: Optional[str] = None):
    """Get all patients or search by name."""
    try:
        if search:
            patients = db.search_patients(search)
        else:
            patients = db.get_all_patients()
        return JSONResponse(content={"patients": patients, "count": len(patients)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting patients: {str(e)}")


@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: int):
    """Get a specific patient by ID."""
    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        # Get patient's summaries
        summaries = db.get_patient_summaries(patient_id)
        patient["summaries"] = summaries

        return JSONResponse(content=patient)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting patient: {str(e)}")


@app.post("/api/patients")
async def create_patient(request: CreatePatientRequest):
    """Create a new patient."""
    try:
        patient_id = db.create_patient(request.name, request.date_of_birth)
        return JSONResponse(content={"id": patient_id, "name": request.name})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating patient: {str(e)}")


@app.get("/api/history")
async def get_history(limit: int = 50):
    """Get all summaries with patient info for history view."""
    try:
        summaries = db.get_all_summaries(limit)
        return JSONResponse(content={"summaries": summaries, "count": len(summaries)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting history: {str(e)}")


@app.get("/api/history/{summary_id}")
async def get_summary_detail(summary_id: int):
    """Get detailed summary with medications, test results, and interactions."""
    try:
        summary = db.get_summary(summary_id)
        if not summary:
            raise HTTPException(status_code=404, detail="Summary not found")
        return JSONResponse(content=summary)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting summary: {str(e)}")


@app.post("/api/save-summary")
async def save_summary(request: SaveSummaryRequest):
    """Save a summary to the database with all related data."""
    try:
        # Find or create patient
        patient = db.get_patient_by_name(request.patient_name)
        if patient:
            patient_id = patient["id"]
        else:
            patient_id = db.create_patient(request.patient_name)

        # Create summary
        summary_id = db.create_summary(
            patient_id=patient_id,
            raw_summary=request.raw_summary,
            file_path=request.file_path,
            original_filename=request.original_filename,
            diagnosis=request.diagnosis,
            visit_date=request.visit_date,
            visit_location=request.visit_location,
            next_steps=request.next_steps,
            warning_signs=request.warning_signs
        )

        # Add medications
        for med in request.medications:
            db.add_medication(
                summary_id=summary_id,
                name=med.get("name", ""),
                dosage=med.get("dosage"),
                frequency=med.get("frequency"),
                purpose=med.get("purpose"),
                rxcui=med.get("rxcui"),
                drug_class=med.get("drug_class")
            )

        # Add test results
        for test in request.test_results:
            db.add_test_result(
                summary_id=summary_id,
                test_name=test.get("name", ""),
                value=test.get("value"),
                unit=test.get("unit"),
                reference_range=test.get("reference_range"),
                status=test.get("status")
            )

        # Add interactions
        for interaction in request.interactions:
            db.add_drug_interaction(
                summary_id=summary_id,
                drug1=interaction.get("drug1", ""),
                drug2=interaction.get("drug2", ""),
                severity=interaction.get("severity"),
                description=interaction.get("description"),
                recommendation=interaction.get("recommendation")
            )

        # Log analytics event
        db.log_analytics_event("summary_saved", json.dumps({"summary_id": summary_id, "patient_id": patient_id}))

        return JSONResponse(content={
            "success": True,
            "summary_id": summary_id,
            "patient_id": patient_id,
            "message": "Summary saved successfully"
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving summary: {str(e)}")


# =============================================================================
# Chat Endpoints
# =============================================================================

@app.post("/api/chat/patient")
async def patient_chat_endpoint(request: PatientChatRequest):
    """
    Patient-specific chat - asks questions about a specific patient's summary.
    Used by the small chat button next to download in results view.
    """
    try:
        # Check for quick response first
        quick = check_quick_response(request.message)
        if quick:
            return JSONResponse(content={
                "response": quick,
                "session_id": request.session_id,
                "timestamp": datetime.now().isoformat()
            })

        # Get AI response with patient context
        response = await patient_chat(
            message=request.message,
            session_id=request.session_id,
            summary_id=request.summary_id or 0,
            summary_text=request.summary_text,
            medications=request.medications,
            test_results=request.test_results,
            interactions=request.interactions,
            patient_id=request.patient_id
        )

        return JSONResponse(content={
            "response": response,
            "session_id": request.session_id,
            "timestamp": datetime.now().isoformat()
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in patient chat: {str(e)}")


@app.post("/api/chat/general")
async def general_chat_endpoint(request: GeneralChatRequest):
    """
    General chat - search across all patients, general health questions.
    Used by the dedicated chat view.
    """
    try:
        # Check for quick response first
        quick = check_quick_response(request.message)
        if quick:
            return JSONResponse(content={
                "response": quick,
                "session_id": request.session_id,
                "timestamp": datetime.now().isoformat()
            })

        # Get AI response with database context
        response = await general_chat(
            message=request.message,
            session_id=request.session_id
        )

        return JSONResponse(content={
            "response": response,
            "session_id": request.session_id,
            "timestamp": datetime.now().isoformat()
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in general chat: {str(e)}")


@app.get("/api/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    """Get chat history for a session."""
    try:
        history = db.get_chat_history(session_id)
        return JSONResponse(content={"messages": history, "count": len(history)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting chat history: {str(e)}")


# =============================================================================
# Live Doctor Consultation Endpoints
# =============================================================================

@app.post("/api/consult/chat")
async def doctor_consult_endpoint(request: DoctorConsultRequest):
    """
    Live doctor consultation chat - conducts a structured medical consultation.
    Returns response, consultation stage, emergency status, and whether to suggest summary.
    """
    try:
        result = await doctor_consultation(
            message=request.message,
            session_id=request.session_id,
            patient_id=request.patient_id,
            patient_name=request.patient_name,
            chief_complaint=request.chief_complaint
        )

        return JSONResponse(content={
            "response": result["response"],
            "session_id": request.session_id,
            "stage": result["stage"],
            "is_emergency": result["is_emergency"],
            "should_summarize": result["should_summarize"],
            "message_count": result["message_count"],
            "timestamp": datetime.now().isoformat()
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in doctor consultation: {str(e)}")


@app.post("/api/consult/summary")
async def get_consultation_summary(request: ConsultationSummaryRequest):
    """
    Generate a printable summary of the consultation session.
    """
    try:
        summary = await generate_consultation_summary(request.session_id)

        return JSONResponse(content={
            "summary": summary,
            "session_id": request.session_id,
            "timestamp": datetime.now().isoformat()
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating consultation summary: {str(e)}")


@app.post("/api/consult/start")
async def start_consultation():
    """
    Start a new consultation session - generates a unique session ID.
    """
    import uuid
    session_id = f"consult_{uuid.uuid4().hex[:12]}"

    # Create session in database
    db.create_consultation_session(session_id)

    # Create session in voice service
    voice_service.create_session(session_id)

    return JSONResponse(content={
        "session_id": session_id,
        "fields": CONSULTATION_FIELDS,
        "message": "Consultation session started",
        "timestamp": datetime.now().isoformat()
    })


@app.get("/api/consult/session/{session_id}")
async def get_consultation_session(session_id: str):
    """Get consultation session with all collected fields."""
    try:
        session = db.get_consultation_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        return JSONResponse(content=session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/consult/field/confirm")
async def confirm_field(session_id: str, field_name: str):
    """Confirm a field value."""
    try:
        success = db.confirm_consultation_field(session_id, field_name)
        return JSONResponse(content={"success": success})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/consult/field/update")
async def update_field(session_id: str, field_name: str, new_value: str):
    """Update a field value."""
    try:
        # Update in database
        db.update_consultation_field(session_id, field_name, new_value)

        # Update in voice service session
        session = voice_service.get_session(session_id)
        if session:
            session.update_field(field_name, new_value)

        return JSONResponse(content={"success": True, "field_name": field_name, "value": new_value})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Consultation Configuration Admin Endpoints
# =============================================================================

class ConsultationConfigCreate(BaseModel):
    """Request model for creating a consultation config"""
    config_id: str
    name: str
    description: Optional[str] = None
    fields: Optional[List[Dict]] = None
    ai_prompt: Optional[str] = None
    system_instruction: Optional[str] = None
    voice_name: Optional[str] = "Aoede"
    success_message: Optional[str] = None
    emergency_message: Optional[str] = None
    settings: Optional[Dict] = None


class ConsultationConfigUpdate(BaseModel):
    """Request model for updating a consultation config"""
    name: Optional[str] = None
    description: Optional[str] = None
    fields: Optional[List[Dict]] = None
    ai_prompt: Optional[str] = None
    system_instruction: Optional[str] = None
    voice_name: Optional[str] = None
    success_message: Optional[str] = None
    emergency_message: Optional[str] = None
    settings: Optional[Dict] = None


@app.get("/api/admin/consult/configs")
async def list_consultation_configs():
    """
    List all consultation configurations.
    Admin endpoint to view all available consultation templates.
    """
    try:
        configs = voice_service.list_configs()
        return JSONResponse(content={
            "success": True,
            "configs": configs,
            "available_voices": AVAILABLE_VOICES
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/consult/configs/{config_id}")
async def get_consultation_config(config_id: str):
    """
    Get a specific consultation configuration.
    """
    try:
        config = voice_service.get_config(config_id)
        if not config:
            raise HTTPException(status_code=404, detail="Configuration not found")
        return JSONResponse(content={
            "success": True,
            "config": config.to_dict()
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/consult/configs")
async def create_consultation_config(request: ConsultationConfigCreate):
    """
    Create a new consultation configuration.
    Admin endpoint to create custom consultation templates.
    """
    try:
        # Check if config_id already exists
        existing = voice_service.get_config(request.config_id)
        if existing:
            raise HTTPException(status_code=400, detail="Configuration ID already exists")

        config = ConsultationConfig(
            config_id=request.config_id,
            name=request.name,
            description=request.description or "",
            fields=request.fields or DEFAULT_CONSULTATION_FIELDS,
            ai_prompt=request.ai_prompt or "",
            system_instruction=request.system_instruction,
            voice_name=request.voice_name or "Aoede",
            success_message=request.success_message or "Thank you for completing the consultation!",
            emergency_message=request.emergency_message or "This appears to be an emergency. Please call 911 immediately.",
            settings=request.settings or {}
        )

        voice_service.create_config(config)

        # Also save to database for persistence
        db.create_consultation_config(
            config_id=request.config_id,
            name=request.name,
            fields=request.fields or DEFAULT_CONSULTATION_FIELDS,
            description=request.description,
            ai_prompt=request.ai_prompt,
            system_instruction=request.system_instruction,
            voice_name=request.voice_name or "Aoede",
            success_message=request.success_message,
            emergency_message=request.emergency_message,
            settings=request.settings
        )

        return JSONResponse(content={
            "success": True,
            "config": config.to_dict(),
            "message": "Configuration created successfully"
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/admin/consult/configs/{config_id}")
async def update_consultation_config(config_id: str, request: ConsultationConfigUpdate):
    """
    Update an existing consultation configuration.
    """
    try:
        config = voice_service.get_config(config_id)
        if not config:
            raise HTTPException(status_code=404, detail="Configuration not found")

        # Build updates dict with only provided fields
        updates = {}
        if request.name is not None:
            updates['name'] = request.name
        if request.description is not None:
            updates['description'] = request.description
        if request.fields is not None:
            updates['fields'] = request.fields
        if request.ai_prompt is not None:
            updates['ai_prompt'] = request.ai_prompt
        if request.system_instruction is not None:
            updates['system_instruction'] = request.system_instruction
        if request.voice_name is not None:
            updates['voice_name'] = request.voice_name
        if request.success_message is not None:
            updates['success_message'] = request.success_message
        if request.emergency_message is not None:
            updates['emergency_message'] = request.emergency_message
        if request.settings is not None:
            updates['settings'] = request.settings

        # Update in memory
        updated_config = voice_service.update_config(config_id, updates)

        # Update in database
        db.update_consultation_config(config_id, **updates)

        return JSONResponse(content={
            "success": True,
            "config": updated_config.to_dict(),
            "message": "Configuration updated successfully"
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/admin/consult/configs/{config_id}")
async def delete_consultation_config(config_id: str):
    """
    Delete a consultation configuration (cannot delete 'default').
    """
    try:
        if config_id == "default":
            raise HTTPException(status_code=400, detail="Cannot delete the default configuration")

        deleted = voice_service.delete_config(config_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Configuration not found")

        # Also delete from database
        db.delete_consultation_config(config_id)

        return JSONResponse(content={
            "success": True,
            "message": "Configuration deleted successfully"
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/consult/default-fields")
async def get_default_consultation_fields():
    """
    Get the default consultation fields template.
    Useful for creating new configurations.
    """
    return JSONResponse(content={
        "success": True,
        "fields": DEFAULT_CONSULTATION_FIELDS,
        "available_voices": AVAILABLE_VOICES
    })


# =============================================================================
# Voice WebSocket Endpoint
# =============================================================================

@app.websocket("/ws/voice/{session_id}")
async def voice_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time voice consultation.
    Handles bidirectional audio streaming with Gemini Live API.
    """
    await websocket.accept()

    # Get or create session
    session = voice_service.get_session(session_id)
    if not session:
        session = voice_service.create_session(session_id)
        db.create_consultation_session(session_id)

    async def on_audio(audio_bytes: bytes):
        """Send audio back to client as binary (matching voicegen pattern)"""
        try:
            await websocket.send_bytes(audio_bytes)
        except Exception as e:
            print(f"Error sending audio: {e}")

    async def on_text(text: str):
        """Send text transcript to client"""
        try:
            await websocket.send_json({
                "type": "transcript",
                "text": text,
                "role": "assistant"
            })
        except Exception as e:
            print(f"Error sending text: {e}")

    async def on_field_extracted(field_name: str, label: str, value: str):
        """Send field extraction notification to client"""
        try:
            print(f"📋 [WS] Field extracted: {field_name} = {value}")
            # Save to database (auto-confirmed since we removed popup)
            db.save_consultation_field(session_id, field_name, label, value, confirmed=True)

            await websocket.send_json({
                "type": "field_extracted",
                "field_name": field_name,
                "label": label,
                "value": value
            })
        except Exception as e:
            print(f"❌ [WS] Error sending field: {e}")

    async def on_emergency(reason: str):
        """Send emergency alert to client"""
        try:
            db.update_consultation_session(session_id, is_emergency=True)
            await websocket.send_json({
                "type": "emergency",
                "reason": reason
            })
        except Exception as e:
            print(f"Error sending emergency: {e}")

    # Start the audio processing in background
    audio_task = asyncio.create_task(
        voice_service.process_audio_stream(
            session, on_audio, on_text, on_field_extracted, on_emergency
        )
    )

    try:
        # Send ready message with session info
        existing_fields = db.get_consultation_fields(session_id)
        await websocket.send_json({
            "type": "ready",
            "session_id": session_id,
            "fields": existing_fields,
            "message": "Connected to Dr. MedAssist"
        })

        # Handle incoming messages
        while True:
            try:
                message = await websocket.receive()

                if message["type"] == "websocket.disconnect":
                    break

                # Handle binary audio data
                if "bytes" in message:
                    await voice_service.send_audio(session_id, message["bytes"])

                # Handle JSON messages
                elif "text" in message:
                    data = json.loads(message["text"])

                    if data.get("type") == "audio":
                        # Base64 encoded audio
                        audio_bytes = base64.b64decode(data["data"])
                        await voice_service.send_audio(session_id, audio_bytes)

                    elif data.get("type") == "confirm_field":
                        # User confirmed a field
                        field_name = data.get("field_name")
                        db.confirm_consultation_field(session_id, field_name)
                        await websocket.send_json({
                            "type": "field_confirmed",
                            "field_name": field_name
                        })

                    elif data.get("type") == "edit_field":
                        # User edited a field
                        field_name = data.get("field_name")
                        new_value = data.get("value")
                        label = data.get("label", field_name)
                        db.save_consultation_field(session_id, field_name, label, new_value, confirmed=True)
                        session.save_field(field_name, new_value)
                        await websocket.send_json({
                            "type": "field_updated",
                            "field_name": field_name,
                            "value": new_value
                        })

                    elif data.get("type") == "end_session":
                        db.update_consultation_session(session_id, status="completed")
                        session.is_active = False
                        break

            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"WebSocket error: {e}")
                break

    finally:
        # Cleanup
        session.is_active = False
        audio_task.cancel()
        try:
            await audio_task
        except asyncio.CancelledError:
            pass


# =============================================================================
# Clinic & Doctor Endpoints
# =============================================================================

@app.get("/api/clinics")
async def get_clinics():
    """Get all active clinics."""
    try:
        clinics = db.get_all_clinics()
        return JSONResponse(content={"clinics": clinics, "count": len(clinics)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinics/{clinic_id}")
async def get_clinic(clinic_id: int):
    """Get a specific clinic with doctors and services."""
    try:
        clinic = db.get_clinic(clinic_id)
        if not clinic:
            raise HTTPException(status_code=404, detail="Clinic not found")
        return JSONResponse(content=clinic)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/doctors")
async def get_doctors(specialty: Optional[str] = None):
    """Get all doctors, optionally filtered by specialty."""
    try:
        if specialty:
            doctors = db.get_doctors_by_specialty(specialty)
        else:
            doctors = db.get_all_doctors()
        return JSONResponse(content={"doctors": doctors, "count": len(doctors)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/doctors/{doctor_id}")
async def get_doctor(doctor_id: int):
    """Get a specific doctor."""
    try:
        doctor = db.get_doctor(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        return JSONResponse(content=doctor)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinics/{clinic_id}/services")
async def get_clinic_services(clinic_id: int):
    """Get services for a specific clinic."""
    try:
        services = db.get_clinic_services(clinic_id)
        return JSONResponse(content={"services": services, "count": len(services)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Admin Authentication
# =============================================================================

class AdminLoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/admin/login")
async def admin_login(request: AdminLoginRequest):
    """Admin login endpoint."""
    try:
        user = db.verify_admin_login(request.username, request.password)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return JSONResponse(content={
            "success": True,
            "user": user,
            "message": "Login successful"
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Pydantic Models for New Endpoints
# =============================================================================

class CreateAppointmentRequest(BaseModel):
    patient_id: int
    doctor_id: int
    clinic_id: int
    appointment_date: str
    appointment_time: str
    service_id: Optional[int] = None
    duration_minutes: int = 30
    notes: Optional[str] = None


class UpdateAppointmentStatusRequest(BaseModel):
    status: str  # scheduled, completed, no_show, cancelled


class CreateBillingRequest(BaseModel):
    patient_id: int
    description: str
    amount: float
    insurance_covered: float = 0
    patient_responsibility: float = 0
    appointment_id: Optional[int] = None
    status: str = "pending"


class CreateDoctorNoteRequest(BaseModel):
    doctor_id: int
    patient_id: int
    content: Optional[str] = None
    audio_url: Optional[str] = None
    note_type: str = "text"


class CreatePrescriptionRequest(BaseModel):
    patient_id: int
    medication_name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    quantity: Optional[int] = None
    refills: int = 0
    instructions: Optional[str] = None
    pharmacy: Optional[str] = None


class RecordVitalsRequest(BaseModel):
    patient_id: int
    heart_rate: Optional[float] = None
    systolic_bp: Optional[float] = None
    diastolic_bp: Optional[float] = None
    oxygen_level: Optional[float] = None
    temperature: Optional[float] = None
    respiratory_rate: Optional[float] = None
    weight: Optional[float] = None
    notes: Optional[str] = None


class CreateJournalEntryRequest(BaseModel):
    entry_text: Optional[str] = None
    mood: Optional[str] = None
    pain_level: Optional[int] = None
    symptoms: Optional[str] = None


class MarkNotesReadRequest(BaseModel):
    pass  # No body needed, patient_id comes from path


# =============================================================================
# ClinicAdmin Endpoints (/api/clinicadmin/)
# =============================================================================

@app.get("/api/clinicadmin/stats")
async def clinicadmin_stats():
    """Clinic admin dashboard stats."""
    try:
        stats = db.get_clinic_admin_stats()
        return JSONResponse(content=stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting clinic admin stats: {str(e)}")


@app.get("/api/clinicadmin/appointments")
async def clinicadmin_appointments(
    status: Optional[str] = None,
    doctor_id: Optional[int] = None,
    limit: int = 100
):
    """All appointments with optional filters."""
    try:
        with db.get_db() as conn:
            cursor = conn.cursor()
            query = """
                SELECT a.*, p.name as patient_name, cs.service_name,
                       d.first_name || ' ' || d.last_name as doctor_name,
                       c.name as clinic_name
                FROM appointments a
                LEFT JOIN patients p ON a.patient_id = p.id
                LEFT JOIN clinic_services cs ON a.service_id = cs.id
                LEFT JOIN doctors d ON a.doctor_id = d.id
                LEFT JOIN clinics c ON a.clinic_id = c.id
                WHERE 1=1
            """
            params = []
            if status:
                query += " AND a.status = ?"
                params.append(status)
            if doctor_id:
                query += " AND a.doctor_id = ?"
                params.append(doctor_id)
            query += " ORDER BY a.appointment_date DESC, a.appointment_time ASC LIMIT ?"
            params.append(limit)
            cursor.execute(query, params)
            appointments = [dict(row) for row in cursor.fetchall()]
        return JSONResponse(content={"appointments": appointments, "count": len(appointments)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting appointments: {str(e)}")


@app.get("/api/clinicadmin/appointments/today")
async def clinicadmin_today_appointments():
    """Today's appointments."""
    try:
        appointments = db.get_today_appointments()
        return JSONResponse(content={"appointments": appointments, "count": len(appointments)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting today's appointments: {str(e)}")


@app.post("/api/clinicadmin/appointments")
async def clinicadmin_create_appointment(request: CreateAppointmentRequest):
    """Create a new appointment."""
    try:
        appointment_id = db.create_appointment(
            patient_id=request.patient_id,
            doctor_id=request.doctor_id,
            clinic_id=request.clinic_id,
            appointment_date=request.appointment_date,
            appointment_time=request.appointment_time,
            service_id=request.service_id,
            duration_minutes=request.duration_minutes,
            notes=request.notes
        )
        return JSONResponse(content={
            "success": True,
            "appointment_id": appointment_id,
            "message": "Appointment created successfully"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating appointment: {str(e)}")


@app.put("/api/clinicadmin/appointments/{appointment_id}/status")
async def clinicadmin_update_appointment_status(appointment_id: int, request: UpdateAppointmentStatusRequest):
    """Update appointment status."""
    try:
        valid_statuses = ["scheduled", "completed", "no_show", "cancelled"]
        if request.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        success = db.update_appointment_status(appointment_id, request.status)
        if not success:
            raise HTTPException(status_code=404, detail="Appointment not found")
        return JSONResponse(content={"success": True, "message": f"Appointment status updated to {request.status}"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating appointment status: {str(e)}")


@app.get("/api/clinicadmin/billing")
async def clinicadmin_billing(status: Optional[str] = None, limit: int = 100):
    """All billing records with optional status filter."""
    try:
        records = db.get_all_billing(status=status, limit=limit)
        return JSONResponse(content={"billing": records, "count": len(records)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting billing records: {str(e)}")


@app.get("/api/clinicadmin/billing/summary")
async def clinicadmin_billing_summary():
    """Billing summary stats."""
    try:
        summary = db.get_billing_summary()
        return JSONResponse(content=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting billing summary: {str(e)}")


@app.post("/api/clinicadmin/billing")
async def clinicadmin_create_billing(request: CreateBillingRequest):
    """Create a new billing record."""
    try:
        billing_id = db.create_billing(
            patient_id=request.patient_id,
            description=request.description,
            amount=request.amount,
            insurance_covered=request.insurance_covered,
            patient_responsibility=request.patient_responsibility,
            appointment_id=request.appointment_id,
            status=request.status
        )
        return JSONResponse(content={
            "success": True,
            "billing_id": billing_id,
            "message": "Billing record created successfully"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating billing record: {str(e)}")


@app.get("/api/clinicadmin/insurance/{patient_id}")
async def clinicadmin_patient_insurance(patient_id: int):
    """Get patient insurance information."""
    try:
        insurance = db.get_patient_insurance(patient_id)
        return JSONResponse(content={"insurance": insurance, "count": len(insurance)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting insurance: {str(e)}")


@app.post("/api/clinicadmin/notes")
async def clinicadmin_create_note(request: CreateDoctorNoteRequest):
    """Create a doctor note for a patient (text or voice)."""
    try:
        note_id = db.create_doctor_note(
            doctor_id=request.doctor_id,
            patient_id=request.patient_id,
            content=request.content,
            audio_url=request.audio_url,
            note_type=request.note_type
        )
        return JSONResponse(content={
            "success": True,
            "note_id": note_id,
            "message": "Doctor note created successfully"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating doctor note: {str(e)}")


# =============================================================================
# Doctor Endpoints (/api/doctor/)
# =============================================================================

@app.get("/api/doctor/{doctor_id}/feed/stories")
async def doctor_feed_stories(doctor_id: int):
    """Get patient stories for today (Instagram-style stories bar)."""
    try:
        doctor = db.get_doctor(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        stories = db.get_doctor_patient_stories(doctor_id)
        return JSONResponse(content={"stories": stories, "count": len(stories)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting stories: {str(e)}")


@app.get("/api/doctor/{doctor_id}/feed/appointments")
async def doctor_feed_appointments(doctor_id: int):
    """Get today's appointments for the doctor."""
    try:
        doctor = db.get_doctor(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        appointments = db.get_today_appointments(doctor_id=doctor_id)
        return JSONResponse(content={"appointments": appointments, "count": len(appointments)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting doctor appointments: {str(e)}")


@app.get("/api/doctor/{doctor_id}/feed/summaries")
async def doctor_feed_summaries(doctor_id: int):
    """Get all patient summaries for the doctor, alphabetical."""
    try:
        doctor = db.get_doctor(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        summaries = db.get_doctor_feed_summaries(doctor_id)
        return JSONResponse(content={"summaries": summaries, "count": len(summaries)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting summaries: {str(e)}")


@app.get("/api/doctor/{doctor_id}/patients")
async def doctor_patients(doctor_id: int):
    """Get all patients for a doctor."""
    try:
        doctor = db.get_doctor(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        patients = db.get_all_patients_for_doctor(doctor_id)
        return JSONResponse(content={"patients": patients, "count": len(patients)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting doctor patients: {str(e)}")


@app.get("/api/doctor/{doctor_id}/patients/{patient_id}/detail")
async def doctor_patient_detail(doctor_id: int, patient_id: int):
    """Full patient detail: vitals, meds, labs, prescriptions, notes, appointments."""
    try:
        doctor = db.get_doctor(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")

        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        # Gather all patient data
        vitals = db.get_patient_vitals(patient_id)
        latest_vitals = db.get_latest_vitals(patient_id)
        prescriptions = db.get_patient_prescriptions(patient_id, active_only=False)
        labs = db.get_patient_labs(patient_id)
        notes = db.get_patient_doctor_notes(patient_id)
        appointments = db.get_patient_appointments(patient_id)
        journal = db.get_patient_journal(patient_id)
        insurance = db.get_patient_insurance(patient_id)
        summaries = db.get_patient_summaries(patient_id)
        billing = db.get_patient_billing(patient_id)

        return JSONResponse(content={
            "patient": patient,
            "vitals": vitals,
            "latest_vitals": latest_vitals,
            "prescriptions": prescriptions,
            "lab_results": labs,
            "doctor_notes": notes,
            "appointments": appointments,
            "journal_entries": journal,
            "insurance": insurance,
            "summaries": summaries,
            "billing": billing
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting patient detail: {str(e)}")


@app.post("/api/doctor/{doctor_id}/notes")
async def doctor_create_note(doctor_id: int, request: CreateDoctorNoteRequest):
    """Create a note for a patient from a specific doctor."""
    try:
        doctor = db.get_doctor(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")

        note_id = db.create_doctor_note(
            doctor_id=doctor_id,
            patient_id=request.patient_id,
            content=request.content,
            audio_url=request.audio_url,
            note_type=request.note_type
        )
        return JSONResponse(content={
            "success": True,
            "note_id": note_id,
            "message": "Note created successfully"
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating note: {str(e)}")


@app.post("/api/doctor/{doctor_id}/prescriptions")
async def doctor_create_prescription(doctor_id: int, request: CreatePrescriptionRequest):
    """Create a prescription for a patient."""
    try:
        doctor = db.get_doctor(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")

        prescription_id = db.create_prescription(
            patient_id=request.patient_id,
            doctor_id=doctor_id,
            medication_name=request.medication_name,
            dosage=request.dosage,
            frequency=request.frequency,
            quantity=request.quantity,
            refills=request.refills,
            instructions=request.instructions,
            pharmacy=request.pharmacy
        )
        return JSONResponse(content={
            "success": True,
            "prescription_id": prescription_id,
            "message": "Prescription created successfully"
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating prescription: {str(e)}")


@app.post("/api/doctor/{doctor_id}/vitals")
async def doctor_record_vitals(doctor_id: int, request: RecordVitalsRequest):
    """Record vitals for a patient."""
    try:
        doctor = db.get_doctor(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")

        vitals_id = db.add_vitals(
            patient_id=request.patient_id,
            recorded_by=doctor_id,
            heart_rate=request.heart_rate,
            systolic_bp=request.systolic_bp,
            diastolic_bp=request.diastolic_bp,
            oxygen_level=request.oxygen_level,
            temperature=request.temperature,
            respiratory_rate=request.respiratory_rate,
            weight=request.weight,
            notes=request.notes
        )
        return JSONResponse(content={
            "success": True,
            "vitals_id": vitals_id,
            "message": "Vitals recorded successfully"
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error recording vitals: {str(e)}")


# =============================================================================
# Patient Portal Endpoints (/api/portal/)
# =============================================================================

@app.get("/api/portal/patient/{patient_id}/vitals")
async def portal_patient_vitals(patient_id: int):
    """Get patient's vitals history."""
    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        vitals = db.get_patient_vitals(patient_id)
        latest = db.get_latest_vitals(patient_id)
        return JSONResponse(content={"vitals": vitals, "latest": latest, "count": len(vitals)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting vitals: {str(e)}")


@app.get("/api/portal/patient/{patient_id}/notes")
async def portal_patient_notes(patient_id: int):
    """Get doctor notes for a patient (updates portal)."""
    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        notes = db.get_patient_doctor_notes(patient_id)
        unread_count = db.get_unread_notes_count(patient_id)
        return JSONResponse(content={"notes": notes, "unread_count": unread_count, "count": len(notes)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting notes: {str(e)}")


@app.post("/api/portal/patient/{patient_id}/notes/read")
async def portal_mark_notes_read(patient_id: int):
    """Mark all notes as read for a patient."""
    try:
        db.mark_notes_read(patient_id)
        return JSONResponse(content={"success": True, "message": "Notes marked as read"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error marking notes as read: {str(e)}")


@app.get("/api/portal/patient/{patient_id}/journal")
async def portal_patient_journal(patient_id: int, limit: int = 50):
    """Get patient journal entries."""
    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        entries = db.get_patient_journal(patient_id, limit=limit)
        today_entry = db.get_today_journal(patient_id)
        return JSONResponse(content={
            "entries": entries,
            "today_entry": today_entry,
            "count": len(entries)
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting journal: {str(e)}")


@app.post("/api/portal/patient/{patient_id}/journal")
async def portal_create_journal_entry(patient_id: int, request: CreateJournalEntryRequest):
    """Create a journal entry for a patient."""
    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        entry_id = db.create_journal_entry(
            patient_id=patient_id,
            entry_text=request.entry_text,
            mood=request.mood,
            pain_level=request.pain_level,
            symptoms=request.symptoms
        )
        return JSONResponse(content={
            "success": True,
            "entry_id": entry_id,
            "message": "Journal entry created successfully"
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating journal entry: {str(e)}")


@app.get("/api/portal/patient/{patient_id}/prescriptions")
async def portal_patient_prescriptions(patient_id: int, active_only: bool = True):
    """Get patient prescriptions."""
    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        prescriptions = db.get_patient_prescriptions(patient_id, active_only=active_only)
        return JSONResponse(content={"prescriptions": prescriptions, "count": len(prescriptions)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting prescriptions: {str(e)}")


@app.get("/api/portal/patient/{patient_id}/appointments")
async def portal_patient_appointments(patient_id: int, limit: int = 20):
    """Get patient appointments."""
    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        appointments = db.get_patient_appointments(patient_id, limit=limit)
        return JSONResponse(content={"appointments": appointments, "count": len(appointments)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting appointments: {str(e)}")


@app.get("/api/portal/patient/{patient_id}/labs")
async def portal_patient_labs(patient_id: int, lab_type: Optional[str] = None):
    """Get patient lab results."""
    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        labs = db.get_patient_labs(patient_id, lab_type=lab_type)
        return JSONResponse(content={"lab_results": labs, "count": len(labs)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting lab results: {str(e)}")


@app.get("/api/portal/patient/{patient_id}/insurance")
async def portal_patient_insurance(patient_id: int):
    """Get patient insurance information."""
    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        insurance = db.get_patient_insurance(patient_id)
        return JSONResponse(content={"insurance": insurance, "count": len(insurance)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting insurance: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
