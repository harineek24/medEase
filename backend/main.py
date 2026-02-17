import os
import base64
import json
import asyncio
from datetime import datetime, date
from decimal import Decimal
from pathlib import Path
from typing import Optional, List, Dict, Any

import google.generativeai as genai
from fastapi import FastAPI, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables BEFORE importing modules that read them
load_dotenv()

# Import medication analyzer
from medication_analyzer import analyzer

# Import database and chat handlers
import medatabase as db
from chat_handler import patient_chat, general_chat, check_quick_response, doctor_consultation, generate_consultation_summary
from voice_service import voice_service, CONSULTATION_FIELDS, ConsultationConfig, DEFAULT_CONSULTATION_FIELDS, AVAILABLE_VOICES

# Custom JSON encoder for PostgreSQL types (datetime, Decimal, etc.)
class DBJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


class DBJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(content, cls=DBJSONEncoder).encode("utf-8")


# Initialize FastAPI app
app = FastAPI(title="MedEase - EHR Summarizer API", default_response_class=DBJSONResponse)

# Configure CORS
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
]
if os.getenv("FRONTEND_URL"):
    allowed_origins.append(os.getenv("FRONTEND_URL"))

from fastapi.middleware.cors import CORSMiddleware as _CORSMiddleware

class VercelCORSMiddleware(_CORSMiddleware):
    """Extends CORS to allow Vercel preview deployment URLs."""
    def is_allowed_origin(self, origin: str) -> bool:
        if super().is_allowed_origin(origin):
            return True
        # Allow all Vercel preview deployments for this project
        if origin and ("vercel.app" in origin):
            return True
        return False

app.add_middleware(
    VercelCORSMiddleware,
    allow_origins=allowed_origins,
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


class StartConsultationRequest(BaseModel):
    patient_id: Optional[int] = None


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
[Present EVERY SINGLE test result INDIVIDUALLY with its value, units, and reference range.
CRITICAL: List each test on its own line. NEVER group tests together (e.g., do NOT write "Routine Blood Counts" or "CBC panel was normal"). Instead, list WBC, RBC, Hemoglobin, Hematocrit, Platelets, etc. as separate entries.
- Mark normal results with ✓
- Mark abnormal results with ⚠️
- Include the numeric value with units
- Include the normal/reference range from the document
- Explain what each test measures briefly
Format each result as: "- Test Name: value unit (Reference: range) ✓/⚠️ - brief explanation"
Example: "- WBC: 9.5 x10^9/L (Reference: 4.0-11.0 x10^9/L) ✓ - White blood cell count is normal"
Example: "- LDL Cholesterol: 101 mg/dL (Reference: < 100 mg/dL) ⚠️ - Slightly elevated"
Example: "- Troponin I: 2.25 ng/mL (Reference: < 0.04 ng/mL) ⚠️ - Elevated, may indicate heart damage"
IMPORTANT: Always include the reference/normal range if it appears in the document. List ALL tests individually - never summarize or group them.]

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

CRITICAL: Extract each test result as its OWN separate entry. NEVER combine or group tests.
For example, if the summary mentions WBC, RBC, Hemoglobin, Hematocrit, and Platelets, create 5 separate entries — one for each test. Do NOT create a single "CBC" or "Routine Blood Counts" entry.

For each individual test result, extract:
- name: The specific test name (e.g., "WBC", "Hemoglobin", "LDL Cholesterol", "Troponin I", "Glucose"). Use the individual test name, NOT the panel name.
- value: The numeric value as a string (e.g., "9.5", "14.2", "101"). Do NOT include units in the value.
- unit: The unit of measurement (e.g., "mg/dL", "x10^9/L", "%", "mmol/L"). Use null if not mentioned.
- reference_range: The normal/reference range (e.g., "4.0-11.0 x10^9/L", "< 100 mg/dL", "> 60 mL/min", "0.4-4.0 mIU/L"). Extract from text like "(Reference: ...)" or "(Normal: ...)". Use null if not mentioned.
- status: One of "normal", "borderline", or "abnormal"
- explanation: Brief explanation if provided (e.g., "Good control", "Slightly elevated")

Return ONLY a JSON array with no additional text. Format:
[
  {"name": "WBC", "value": "9.5", "unit": "x10^9/L", "reference_range": "4.0-11.0 x10^9/L", "status": "normal", "explanation": "White blood cell count is normal"},
  {"name": "Troponin I", "value": "2.25", "unit": "ng/mL", "reference_range": "< 0.04 ng/mL", "status": "abnormal", "explanation": "Elevated, may indicate heart damage"},
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
        return JSONResponse(content=patients)
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
    Generate a summary of the consultation session, save it to the database,
    and mark the session as completed.
    """
    try:
        summary = await generate_consultation_summary(request.session_id)

        # Look up consultation session and its fields
        session = db.get_consultation_session(request.session_id)
        if session:
            patient_id = session.get("patient_id")

            # Extract diagnosis from consultation fields
            fields = session.get("fields", [])
            diagnosis = None
            patient_name = None
            for f in fields:
                if f.get("field_name") == "chief_complaint":
                    diagnosis = f.get("field_value")
                if f.get("field_name") == "patient_name":
                    patient_name = f.get("field_value")

            # Save summary to summaries table if we have a patient link
            summary_id = None
            if patient_id:
                summary_id = db.create_summary(
                    patient_id=patient_id,
                    raw_summary=summary,
                    original_filename="Voice Consultation",
                    diagnosis=diagnosis,
                    visit_date=datetime.now().strftime("%Y-%m-%d"),
                )

            # Mark session as completed
            if session.get("status") != "completed":
                db.update_consultation_session(request.session_id, status="completed")

        return JSONResponse(content={
            "summary": summary,
            "session_id": request.session_id,
            "saved": summary_id is not None,
            "summary_id": summary_id,
            "timestamp": datetime.now().isoformat()
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating consultation summary: {str(e)}")


@app.post("/api/consult/start")
async def start_consultation(request: StartConsultationRequest = None):
    """
    Start a new consultation session - generates a unique session ID.
    """
    import uuid
    session_id = f"consult_{uuid.uuid4().hex[:12]}"

    patient_id = request.patient_id if request else None

    # Create session in database with patient link
    db.create_consultation_session(session_id, patient_id=patient_id)

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


# --- Advanced Doctor Search ---
@app.get("/api/doctors/search")
async def search_doctors(
    q: Optional[str] = None,
    specialty: Optional[str] = None,
    min_rating: Optional[float] = None,
    max_fee: Optional[float] = None,
    insurance: Optional[str] = None
):
    """Search doctors with advanced filters."""
    try:
        doctors = db.search_doctors_advanced(
            query=q, specialty=specialty,
            min_rating=min_rating, max_fee=max_fee,
            insurance=insurance
        )
        return JSONResponse(content={"doctors": doctors, "count": len(doctors)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/doctors/specialties")
async def get_specialties():
    """Get all available specialties."""
    try:
        specialties = db.get_all_specialties()
        return JSONResponse(content={"specialties": specialties})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/doctors/insurance-providers")
async def get_insurance_providers():
    """Get all accepted insurance providers."""
    try:
        providers = db.get_all_insurance_providers()
        return JSONResponse(content={"providers": providers})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/doctors/{doctor_id}/available-slots")
async def get_available_slots(doctor_id: int, date: str):
    """Get available time slots for a doctor on a given date."""
    try:
        import json
        doctor = db.get_doctor(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")

        # Parse available hours
        available_hours = json.loads(doctor.get('available_hours') or '{}')

        # Get day of week
        from datetime import datetime as dt
        day = dt.strptime(date, '%Y-%m-%d').strftime('%a')

        hours_str = available_hours.get(day)
        if not hours_str:
            return JSONResponse(content={"slots": [], "message": "Doctor not available on this day"})

        # Parse hours (e.g., "9:00-17:00")
        start_str, end_str = hours_str.split('-')
        start_h, start_m = map(int, start_str.split(':'))
        end_h, end_m = map(int, end_str.split(':'))

        # Generate 30-min slots
        slots = []
        current_h, current_m = start_h, start_m
        while (current_h * 60 + current_m) < (end_h * 60 + end_m):
            slots.append(f"{current_h:02d}:{current_m:02d}")
            current_m += 30
            if current_m >= 60:
                current_h += 1
                current_m = 0

        # Remove booked slots
        booked = db.get_doctor_appointments_for_date(doctor_id, date)
        booked_times = set()
        for apt in booked:
            t = apt['appointment_time']
            # Mark the slot and next slot (for 30-min appointments)
            booked_times.add(t[:5])  # e.g., "09:00"

        available_slots = [s for s in slots if s not in booked_times]

        return JSONResponse(content={"slots": available_slots, "date": date})
    except HTTPException:
        raise
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
# Patient Authentication
# =============================================================================

class PatientLoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/patient/login")
async def patient_login(request: PatientLoginRequest):
    """Patient login endpoint."""
    try:
        user = db.verify_patient_login(request.username, request.password)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")

        return JSONResponse(content={
            "success": True,
            "user": user,
            "message": "Login successful"
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class RegisterPatientRequest(BaseModel):
    name: str
    username: str
    password: str
    date_of_birth: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


@app.post("/api/clinicadmin/patients/register")
async def clinicadmin_register_patient(request: RegisterPatientRequest):
    """Register a new patient with login credentials (clinic admin only)."""
    try:
        # Check if username already taken
        existing = None
        with db.get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM patients WHERE username = ?", (request.username,))
            existing = cursor.fetchone()

        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")

        patient_id = db.register_patient(
            name=request.name,
            username=request.username,
            password=request.password,
            date_of_birth=request.date_of_birth,
            email=request.email,
            phone=request.phone,
            address=request.address
        )
        return JSONResponse(content={
            "success": True,
            "patient_id": patient_id,
            "message": f"Patient {request.name} registered successfully. Credentials: username={request.username}"
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


class CreateClaimRequest(BaseModel):
    patient_id: int
    provider_id: Optional[int] = None
    insurance_id: Optional[int] = None
    claim_type: str = "professional"
    diagnosis_codes: Optional[str] = None
    place_of_service: str = "11"
    date_of_service: Optional[str] = None
    notes: Optional[str] = None
    lines: Optional[List[Dict[str, Any]]] = []

class UpdateClaimStatusRequest(BaseModel):
    status: str
    details: Optional[str] = None

class RecordPaymentRequest(BaseModel):
    patient_id: int
    amount: float
    payment_method: str = "credit_card"
    payment_type: str = "patient"
    claim_id: Optional[int] = None
    billing_id: Optional[int] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None

class VerifyEligibilityRequest(BaseModel):
    patient_id: int
    insurance_id: Optional[int] = None
    payer_name: str
    policy_number: Optional[str] = None
    date_of_service: Optional[str] = None

class CreateStatementRequest(BaseModel):
    patient_id: int
    total_amount: float
    line_items: Optional[str] = None
    due_date: Optional[str] = None


class InsuranceDiscoveryRequest(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: str
    gender: str = "U"
    address1: str = ""
    city: str = ""
    state: str = ""
    postal_code: str = ""

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


class PatientUpdateRequest(BaseModel):
    patient_id: int = 1
    update_text: str
    audio_duration: Optional[int] = None
    audio_url: Optional[str] = None


class RegisterPatientFullRequest(BaseModel):
    name: str
    date_of_birth: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    insurance_provider: Optional[str] = None
    policy_number: Optional[str] = None
    group_number: Optional[str] = None


class BookAppointmentRequest(BaseModel):
    patient_id: int
    doctor_id: int
    appointment_date: str
    appointment_time: str
    duration_minutes: int = 30
    reason: Optional[str] = None


class UpdateAppointmentRequest(BaseModel):
    appointment_date: Optional[str] = None
    appointment_time: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    duration_minutes: Optional[int] = None


class CreateDoctorRequest(BaseModel):
    first_name: str
    last_name: str
    clinic_id: Optional[int] = None
    title: str = "MD"
    specialty: Optional[str] = None
    sub_specialty: Optional[str] = None
    npi_number: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    languages: str = "English"
    education: Optional[str] = None
    certifications: Optional[str] = None
    consultation_fee: Optional[float] = 150
    accepted_insurance: Optional[str] = None


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
        # Map fields to match frontend expectations
        mapped = []
        for r in records:
            mapped.append({
                "id": r["id"],
                "patient_name": r.get("patient_name", ""),
                "description": r.get("description", ""),
                "amount": r.get("amount", 0),
                "insurance_covered": r.get("insurance_covered", 0),
                "patient_owes": r.get("patient_responsibility", 0),
                "status": r.get("status", "pending"),
                "date": r.get("created_at", ""),
            })
        return JSONResponse(content=mapped)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting billing records: {str(e)}")


@app.get("/api/clinicadmin/billing/summary")
async def clinicadmin_billing_summary():
    """Billing summary stats."""
    try:
        summary = db.get_billing_summary()
        # Map to match frontend BillingDashboard field names
        return JSONResponse(content={
            "total_billed": summary.get("total_billed", 0),
            "insurance_covered": summary.get("total_insurance_covered", 0),
            "outstanding_balance": summary.get("outstanding_balance", 0),
            "pending_claims": summary.get("pending_claims", 0),
        })
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
        insurance_list = db.get_patient_insurance(patient_id)
        if not insurance_list:
            return JSONResponse(content=None)
        # Return the primary insurance as a flat object matching frontend InsuranceInfo
        ins = insurance_list[0]
        today = datetime.now().strftime("%Y-%m-%d")
        exp = ins.get("expiration_date")
        is_active = not exp or exp >= today
        return JSONResponse(content={
            "provider": ins.get("provider_name", ""),
            "policy_number": ins.get("policy_number", ""),
            "group_number": ins.get("group_number", ""),
            "copay": ins.get("copay", 0) or 0,
            "deductible": ins.get("deductible", 0) or 0,
            "status": "active" if is_active else "inactive",
            "effective_date": ins.get("effective_date"),
            "expiry_date": ins.get("expiration_date"),
        })
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
        consultations = db.get_patient_consultations(patient_id)

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
            "billing": billing,
            "consultations": consultations,
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


@app.put("/api/portal/patient/{patient_id}/appointments/{appointment_id}")
async def portal_patient_update_appointment(patient_id: int, appointment_id: int, request: UpdateAppointmentRequest):
    """Patient cancels or updates an appointment."""
    try:
        updates = {}
        if request.status:
            # Patients can only cancel their appointments
            if request.status not in ["cancelled"]:
                raise HTTPException(status_code=400, detail="Patients can only cancel appointments")
            updates['status'] = request.status
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")

        success = db.update_appointment(appointment_id, **updates)
        if not success:
            raise HTTPException(status_code=404, detail="Appointment not found")

        return JSONResponse(content={"success": True, "message": "Appointment updated"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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


@app.get("/api/medications/timeline")
async def get_medications_timeline():
    """Get all medications grouped by summary/visit for timeline comparison."""
    try:
        timeline = db.get_medications_timeline()
        return JSONResponse(content=timeline)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching medications timeline: {str(e)}")


@app.get("/api/test-results/history/{test_name}")
async def get_test_history(test_name: str):
    """Get historical readings for a specific test result across all uploads."""
    try:
        history = db.get_test_result_history(test_name)
        return JSONResponse(content=history)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching test history: {str(e)}")


@app.get("/api/test-results/names")
async def get_test_names():
    """Get all distinct test result names stored."""
    try:
        names = db.get_all_test_names()
        return JSONResponse(content=names)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching test names: {str(e)}")


# =============================================================================
# Patient Health Updates Endpoints
# =============================================================================

@app.post("/api/patient-updates")
async def create_patient_update(request: PatientUpdateRequest):
    """Create a patient health update with LLM summary."""
    try:
        # Generate bullet-point summary using Gemini
        prompt = f"""Analyze this patient health update and provide:
1. A concise bullet-point summary of the key health information
2. A list of any questions the patient is asking or concerns they're raising

Format your response EXACTLY as:
SUMMARY:
- bullet point 1
- bullet point 2
...

QUESTIONS:
- question 1
- question 2
...

If there are no questions, write "QUESTIONS:\n- None"

Patient update:
{request.update_text}"""

        response = model.generate_content(prompt)
        ai_response = response.text.strip()

        # Parse summary and questions
        summary = ""
        questions = ""
        if "QUESTIONS:" in ai_response:
            parts = ai_response.split("QUESTIONS:")
            summary = parts[0].replace("SUMMARY:", "").strip()
            questions = parts[1].strip()
        else:
            summary = ai_response.replace("SUMMARY:", "").strip()
            questions = "- None"

        # Save to database
        update_id = db.add_patient_update(
            patient_id=request.patient_id,
            update_text=request.update_text,
            audio_url=request.audio_url,
            audio_duration=request.audio_duration,
            summary=summary,
            questions=questions
        )

        return JSONResponse(content={
            "id": update_id,
            "summary": summary,
            "questions": questions,
            "created_at": datetime.now().isoformat()
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating update: {str(e)}")


@app.get("/api/patient-updates/{patient_id}")
async def get_patient_updates_endpoint(patient_id: int, limit: int = 50):
    """Get patient health updates."""
    try:
        updates = db.get_patient_updates(patient_id, limit)
        return JSONResponse(content=updates)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching updates: {str(e)}")


@app.post("/api/patient-updates/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe audio to text using Gemini and save the audio file."""
    try:
        file_content = await file.read()
        file_base64 = base64.b64encode(file_content).decode('utf-8')

        # Save audio file to disk
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        audio_filename = f"update_audio_{timestamp}.webm"
        audio_dir = OUTPUTS_DIR / "audio"
        audio_dir.mkdir(exist_ok=True)
        audio_path = audio_dir / audio_filename
        audio_path.write_bytes(file_content)

        response = model.generate_content([
            "Transcribe this audio recording exactly. Return only the transcription text, nothing else.",
            {"mime_type": "audio/webm", "data": file_base64}
        ])

        return JSONResponse(content={
            "text": response.text.strip(),
            "audio_url": f"/api/audio/{audio_filename}"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error transcribing: {str(e)}")


@app.get("/api/audio/{filename}")
async def serve_audio(filename: str):
    """Serve a saved audio file."""
    from fastapi.responses import FileResponse
    audio_path = OUTPUTS_DIR / "audio" / filename
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(str(audio_path), media_type="audio/webm")


# =============================================================================
# Doctor Feed & Replies
# =============================================================================

@app.get("/api/doctor/{doctor_id}/feed/patient-updates")
async def get_doctor_feed_patient_updates(doctor_id: int, days: int = 7):
    """Get patient health updates for a doctor's patients (last N days)."""
    try:
        updates = db.get_patient_updates_for_doctor(doctor_id, days=days)
        return JSONResponse(content={"updates": updates})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/patient-updates/{update_id}/detail")
async def get_patient_update_detail(update_id: int):
    """Get a single patient update with its doctor replies."""
    try:
        update = db.get_patient_update_by_id(update_id)
        if not update:
            raise HTTPException(status_code=404, detail="Update not found")
        replies = db.get_replies_for_update(update_id)
        return JSONResponse(content={"update": update, "replies": replies})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class DoctorReplyRequest(BaseModel):
    patient_id: int
    update_id: int
    reply_text: str
    audio_url: Optional[str] = None
    audio_duration: Optional[int] = None


@app.post("/api/doctor/{doctor_id}/reply")
async def post_doctor_reply(doctor_id: int, request: DoctorReplyRequest):
    """Doctor replies to a patient health update."""
    try:
        reply_id = db.add_doctor_reply(
            doctor_id=doctor_id,
            patient_id=request.patient_id,
            update_id=request.update_id,
            reply_text=request.reply_text,
            audio_url=request.audio_url,
            audio_duration=request.audio_duration,
        )
        return JSONResponse(content={"id": reply_id, "success": True, "created_at": datetime.now().isoformat()})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/doctor/{doctor_id}/patient/{patient_id}/communications")
async def get_doctor_patient_comms(doctor_id: int, patient_id: int):
    """Get all doctor replies to a specific patient (for history view)."""
    try:
        comms = db.get_doctor_patient_communications(doctor_id, patient_id)
        return JSONResponse(content={"communications": comms})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/patient/{patient_id}/doctor-replies")
async def get_patient_doctor_replies(patient_id: int):
    """Get all doctor replies for a patient (patient-side view)."""
    try:
        replies = db.get_doctor_replies_for_patient(patient_id)
        return JSONResponse(content={"replies": replies})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/doctor/{doctor_id}/consultations/today")
async def get_doctor_consultations_today(doctor_id: int):
    """Get today's completed consultations for a doctor's patients."""
    try:
        consultations = db.get_consultations_for_doctor_today(doctor_id)
        return JSONResponse(content={"consultations": consultations})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/patient/{patient_id}/consultations")
async def get_patient_consultations_endpoint(patient_id: int):
    """Get all consultations for a patient."""
    try:
        consultations = db.get_patient_consultations(patient_id)
        return JSONResponse(content={"consultations": consultations})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Patient Appointment Booking
# =============================================================================

@app.post("/api/patient/book-appointment")
async def book_appointment(request: BookAppointmentRequest):
    """Book an appointment for a patient."""
    try:
        doctor = db.get_doctor(request.doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")

        appointment_id = db.create_appointment(
            patient_id=request.patient_id,
            doctor_id=request.doctor_id,
            clinic_id=doctor['clinic_id'],
            appointment_date=request.appointment_date,
            appointment_time=request.appointment_time,
            duration_minutes=request.duration_minutes,
            notes=request.reason
        )
        return JSONResponse(content={
            "success": True,
            "appointment_id": appointment_id,
            "message": f"Appointment booked with Dr. {doctor['last_name']} on {request.appointment_date} at {request.appointment_time}"
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Doctor Calendar Endpoints
# =============================================================================

@app.get("/api/doctor/{doctor_id}/calendar")
async def doctor_calendar(doctor_id: int, start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Get doctor's calendar appointments."""
    try:
        doctor = db.get_doctor(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")

        with db.get_db() as conn:
            cursor = conn.cursor()
            query = """
                SELECT a.*, p.name as patient_name, p.phone as patient_phone,
                       p.email as patient_email, c.name as clinic_name
                FROM appointments a
                LEFT JOIN patients p ON a.patient_id = p.id
                LEFT JOIN clinics c ON a.clinic_id = c.id
                WHERE a.doctor_id = ?
            """
            params = [doctor_id]
            if start_date:
                query += " AND a.appointment_date >= ?"
                params.append(start_date)
            if end_date:
                query += " AND a.appointment_date <= ?"
                params.append(end_date)
            query += " ORDER BY a.appointment_date ASC, a.appointment_time ASC"
            cursor.execute(query, params)
            appointments = [dict(row) for row in cursor.fetchall()]

        return JSONResponse(content={"appointments": appointments, "count": len(appointments)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/doctor/{doctor_id}/appointments/{appointment_id}")
async def doctor_update_appointment(doctor_id: int, appointment_id: int, request: UpdateAppointmentRequest):
    """Doctor accepts, rejects, or modifies an appointment."""
    try:
        updates = {}
        if request.status:
            valid_statuses = ["scheduled", "confirmed", "completed", "cancelled", "no_show", "rejected"]
            if request.status not in valid_statuses:
                raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
            updates['status'] = request.status
        if request.appointment_date:
            updates['appointment_date'] = request.appointment_date
        if request.appointment_time:
            updates['appointment_time'] = request.appointment_time
        if request.notes is not None:
            updates['notes'] = request.notes
        if request.duration_minutes:
            updates['duration_minutes'] = request.duration_minutes

        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")

        success = db.update_appointment(appointment_id, **updates)
        if not success:
            raise HTTPException(status_code=404, detail="Appointment not found")

        # Return the updated appointment so the frontend can refresh its state
        with db.get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT a.*, p.name as patient_name, p.phone as patient_phone,
                       p.email as patient_email, c.name as clinic_name
                FROM appointments a
                LEFT JOIN patients p ON a.patient_id = p.id
                LEFT JOIN clinics c ON a.clinic_id = c.id
                WHERE a.id = ?
            """, (appointment_id,))
            row = cursor.fetchone()
            updated_appointment = dict(row) if row else {}

        return JSONResponse(content=updated_appointment)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Admin Patient Registration (Full)
# =============================================================================

@app.post("/api/clinicadmin/patients/register-full")
async def clinicadmin_register_patient_full(request: RegisterPatientFullRequest):
    """Register a new patient with full HIPAA-compliant details."""
    try:
        # Generate credentials: username = firstname.lastname, password = firstname + "123"
        name_parts = request.name.strip().split()
        first = name_parts[0].lower() if name_parts else "patient"
        last = name_parts[-1].lower() if len(name_parts) > 1 else ""
        username = f"{first}.{last}" if last else first
        password = f"{first}123"

        # Check if username exists, append number if so
        existing = None
        with db.get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM patients WHERE username = ?", (username,))
            existing = cursor.fetchone()

        if existing:
            import random
            username = f"{username}{random.randint(1, 99)}"

        patient_id = db.register_patient_full(
            name=request.name,
            username=username,
            password=password,
            date_of_birth=request.date_of_birth,
            email=request.email,
            phone=request.phone,
            address=request.address,
            emergency_contact=request.emergency_contact,
            insurance_provider=request.insurance_provider,
            policy_number=request.policy_number,
            group_number=request.group_number
        )

        return JSONResponse(content={
            "success": True,
            "patient_id": patient_id,
            "credentials": {
                "username": username,
                "password": password
            },
            "message": f"Patient {request.name} registered successfully"
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Admin Doctor Management
# =============================================================================

@app.post("/api/clinicadmin/doctors")
async def clinicadmin_create_doctor(request: CreateDoctorRequest):
    """Create a new doctor."""
    try:
        doctor_id = db.create_doctor(
            first_name=request.first_name,
            last_name=request.last_name,
            clinic_id=request.clinic_id,
            title=request.title,
            specialty=request.specialty,
            sub_specialty=request.sub_specialty,
            npi_number=request.npi_number,
            email=request.email,
            phone=request.phone,
            bio=request.bio,
            languages=request.languages,
            education=request.education,
            certifications=request.certifications
        )
        # Update extended fields
        if request.consultation_fee or request.accepted_insurance:
            db.update_doctor(doctor_id,
                           consultation_fee=request.consultation_fee,
                           accepted_insurance=request.accepted_insurance)

        return JSONResponse(content={"success": True, "doctor_id": doctor_id, "message": "Doctor created"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/clinicadmin/doctors/{doctor_id}")
async def clinicadmin_update_doctor(doctor_id: int, request: CreateDoctorRequest):
    """Update an existing doctor."""
    try:
        updates = {k: v for k, v in request.dict().items() if v is not None}
        success = db.update_doctor(doctor_id, **updates)
        if not success:
            raise HTTPException(status_code=404, detail="Doctor not found")
        return JSONResponse(content={"success": True, "message": "Doctor updated"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinics")
async def get_clinics():
    """Get all clinics."""
    try:
        clinics = db.get_all_clinics()
        return JSONResponse(content={"clinics": clinics, "count": len(clinics)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Advanced Billing Endpoints - Claims, Clearinghouse, Eligibility, Payments
# =============================================================================

from services.claims_edit_engine import edit_engine
from services.eligibility_service import eligibility_service
from services.coding_service import coding_service
from services.claims_service import claims_service
from services.insurance_discovery_service import insurance_discovery_service
from services.era_service import era_service

# --- Claims ---

@app.get("/api/clinicadmin/claims")
async def get_claims(status: Optional[str] = None, limit: int = 100):
    """Get all claims with optional status filter."""
    try:
        claims = db.get_all_claims(status=status, limit=limit)
        return JSONResponse(content={"claims": claims, "count": len(claims)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinicadmin/claims/service-status")
async def claims_service_status():
    """Return claims service configuration status."""
    return JSONResponse(content=claims_service.get_status())


@app.get("/api/clinicadmin/claims/summary")
async def get_claims_summary():
    """Get claims summary statistics."""
    try:
        summary = db.get_claims_summary()
        return JSONResponse(content=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinicadmin/claims/{claim_id}")
async def get_claim_detail(claim_id: int):
    """Get a single claim with lines and events."""
    try:
        claim = db.get_claim(claim_id)
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        return JSONResponse(content=claim)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clinicadmin/claims")
async def create_claim(request: CreateClaimRequest):
    """Create a new CMS-1500 claim."""
    try:
        result = db.create_claim(
            patient_id=request.patient_id,
            provider_id=request.provider_id,
            insurance_id=request.insurance_id,
            claim_type=request.claim_type,
            diagnosis_codes=request.diagnosis_codes,
            place_of_service=request.place_of_service,
            date_of_service=request.date_of_service,
            notes=request.notes
        )
        # Add line items if provided
        if request.lines:
            for line in request.lines:
                db.add_claim_line(
                    claim_id=result["id"],
                    cpt_code=line.get("cpt_code", ""),
                    charge_amount=line.get("charge_amount", 0),
                    cpt_description=line.get("cpt_description"),
                    icd_codes=line.get("icd_codes"),
                    modifier=line.get("modifier"),
                    units=line.get("units", 1)
                )
        return JSONResponse(content={"success": True, **result})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/clinicadmin/claims/{claim_id}/status")
async def update_claim_status(claim_id: int, request: UpdateClaimStatusRequest):
    """Update a claim's status (revenue cycle)."""
    try:
        valid = ["draft", "validated", "submitted", "acknowledged", "adjudicated", "paid", "denied", "appealed"]
        if request.status not in valid:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
        success = db.update_claim_status(claim_id, request.status, request.details)
        if not success:
            raise HTTPException(status_code=404, detail="Claim not found")
        return JSONResponse(content={"success": True, "message": f"Claim status updated to {request.status}"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Clearinghouse / Scrubbing ---

@app.post("/api/clinicadmin/claims/{claim_id}/scrub")
async def scrub_claim(claim_id: int):
    """Run claims edit engine on a claim before submission."""
    try:
        claim = db.get_claim(claim_id)
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        results = edit_engine.scrub_claim(claim)
        # Store scrub results on the claim
        import json
        with db.get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE claims SET scrub_results = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                           (json.dumps(results), claim_id))
        if results["passed"]:
            db.update_claim_status(claim_id, "validated", "Passed all edit checks")
        return JSONResponse(content=results)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clinicadmin/claims/{claim_id}/submit")
async def submit_claim(claim_id: int):
    """Submit a validated claim to the clearinghouse via Stedi (or simulated)."""
    try:
        claim = db.get_claim(claim_id)
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        if claim["status"] not in ("validated", "draft"):
            raise HTTPException(status_code=400, detail=f"Claim must be validated before submission (current: {claim['status']})")
        # Auto-scrub if still draft
        if claim["status"] == "draft":
            results = edit_engine.scrub_claim(claim)
            if not results["passed"]:
                return JSONResponse(content={
                    "success": False,
                    "message": "Claim failed scrubbing",
                    "scrub_results": results
                }, status_code=400)

        # Submit via Stedi claims service (or simulated)
        submission = claims_service.submit_claim(claim)
        details = f"Submitted via {submission.get('source', 'unknown')}"
        if submission.get("claim_reference"):
            details += f" (ref: {submission['claim_reference']})"

        if submission.get("success"):
            db.update_claim_status(claim_id, "submitted", details)
            return JSONResponse(content={
                "success": True,
                "message": "Claim submitted to clearinghouse",
                "submission": submission,
            })
        else:
            return JSONResponse(content={
                "success": False,
                "message": submission.get("error", "Submission failed"),
                "submission": submission,
            }, status_code=400)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clinicadmin/claims/{claim_id}/check-status")
async def check_claim_status_endpoint(claim_id: int):
    """Check claim status via 276/277 inquiry."""
    try:
        claim = db.get_claim(claim_id)
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        result = claims_service.check_claim_status(claim)
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Eligibility Verification ---

@app.post("/api/clinicadmin/eligibility/verify")
async def verify_eligibility(request: VerifyEligibilityRequest):
    """Run real-time eligibility verification."""
    try:
        patient = None
        with db.get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM patients WHERE id = ?", (request.patient_id,))
            row = cursor.fetchone()
            if row:
                patient = row['name']
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        result = eligibility_service.verify_eligibility(
            patient_name=patient,
            payer_name=request.payer_name,
            policy_number=request.policy_number,
            date_of_service=request.date_of_service
        )
        # Save the check
        db.create_eligibility_check(
            patient_id=request.patient_id,
            insurance_id=request.insurance_id,
            payer_name=request.payer_name,
            result=result
        )
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinicadmin/eligibility/history")
async def get_eligibility_history(patient_id: Optional[int] = None, limit: int = 50):
    """Get eligibility check history."""
    try:
        history = db.get_eligibility_history(patient_id=patient_id, limit=limit)
        return JSONResponse(content={"checks": history, "count": len(history)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinicadmin/eligibility/status")
async def eligibility_status():
    """Return eligibility service mode (live vs simulated)."""
    return JSONResponse(content=eligibility_service.get_status())


class EligibilitySettingsRequest(BaseModel):
    api_key: Optional[str] = None
    provider_npi: Optional[str] = None
    provider_name: Optional[str] = None
    provider_org: Optional[str] = None


@app.post("/api/clinicadmin/eligibility/settings")
async def update_eligibility_settings(req: EligibilitySettingsRequest):
    """Update eligibility service configuration at runtime.
    Also syncs the API key/provider info to claims, discovery, and ERA services."""
    if req.api_key is not None:
        eligibility_service.set_api_key(req.api_key)
        claims_service.set_api_key(req.api_key)
        insurance_discovery_service.set_api_key(req.api_key)
        era_service.set_api_key(req.api_key)
    eligibility_service.set_provider_info(
        npi=req.provider_npi,
        name=req.provider_name,
        org=req.provider_org,
    )
    if req.provider_npi or req.provider_name or req.provider_org:
        claims_service.set_provider_info(
            npi=req.provider_npi,
            name=req.provider_name,
            org=req.provider_org,
        )
        insurance_discovery_service.set_provider_info(
            npi=req.provider_npi,
            org=req.provider_org,
        )
    return JSONResponse(content=eligibility_service.get_status())


@app.get("/api/clinicadmin/eligibility/payers")
async def search_payers(query: str = ""):
    """Search Stedi's payer directory by name or ID."""
    if not query or len(query) < 2:
        return JSONResponse(content={"payers": []})
    results = eligibility_service.search_payers(query)
    return JSONResponse(content={"payers": results})


@app.post("/api/clinicadmin/eligibility/test")
async def test_eligibility_connection():
    """Test the Stedi API connection using a known mock request."""
    result = eligibility_service.test_connection()
    return JSONResponse(content=result)


# --- Insurance Discovery ---

@app.post("/api/clinicadmin/insurance-discovery")
async def discover_insurance(request: InsuranceDiscoveryRequest):
    """Discover patient insurance coverage from demographics."""
    try:
        result = insurance_discovery_service.discover(
            first_name=request.first_name,
            last_name=request.last_name,
            date_of_birth=request.date_of_birth,
            gender=request.gender,
            address1=request.address1,
            city=request.city,
            state=request.state,
            postal_code=request.postal_code,
        )
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinicadmin/insurance-discovery/status")
async def insurance_discovery_status():
    """Return insurance discovery service status."""
    return JSONResponse(content=insurance_discovery_service.get_status())


# --- ERA / Remittance Advice ---

@app.get("/api/clinicadmin/era/status")
async def era_service_status():
    """Return ERA service configuration status."""
    return JSONResponse(content=era_service.get_status())


@app.get("/api/clinicadmin/era")
async def list_eras(page: int = 1, per_page: int = 25):
    """List ERA / remittance advice reports."""
    try:
        result = era_service.list_eras(page=page, per_page=per_page)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinicadmin/era/{era_id}")
async def get_era_detail(era_id: str):
    """Get detailed ERA with claim-level breakdown."""
    try:
        result = era_service.get_era_detail(era_id)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Payments ---

@app.post("/api/clinicadmin/payments")
async def record_payment(request: RecordPaymentRequest):
    """Record a payment."""
    try:
        payment_id = db.record_payment(
            patient_id=request.patient_id,
            amount=request.amount,
            payment_method=request.payment_method,
            payment_type=request.payment_type,
            claim_id=request.claim_id,
            billing_id=request.billing_id,
            reference_number=request.reference_number,
            notes=request.notes
        )
        return JSONResponse(content={"success": True, "payment_id": payment_id})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinicadmin/payments")
async def get_payments(patient_id: Optional[int] = None, limit: int = 100):
    """Get payment history."""
    try:
        payments = db.get_payments(patient_id=patient_id, limit=limit)
        return JSONResponse(content={"payments": payments, "count": len(payments)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinicadmin/payments/summary")
async def get_payment_summary():
    """Get payment summary statistics."""
    try:
        summary = db.get_payment_summary()
        return JSONResponse(content=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Statements ---

@app.post("/api/clinicadmin/statements")
async def create_statement(request: CreateStatementRequest):
    """Create a patient statement."""
    try:
        result = db.create_statement(
            patient_id=request.patient_id,
            total_amount=request.total_amount,
            line_items=request.line_items,
            due_date=request.due_date
        )
        return JSONResponse(content={"success": True, **result})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinicadmin/statements")
async def get_statements(status: Optional[str] = None, limit: int = 100):
    """Get all statements."""
    try:
        statements = db.get_all_statements(status=status, limit=limit)
        return JSONResponse(content={"statements": statements, "count": len(statements)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinicadmin/statements/patient/{patient_id}")
async def get_patient_statements(patient_id: int, limit: int = 50):
    """Get statements for a specific patient."""
    try:
        statements = db.get_patient_statements(patient_id=patient_id, limit=limit)
        return JSONResponse(content={"statements": statements, "count": len(statements)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Code Lookup ---

@app.get("/api/codes/icd10")
async def search_icd10(q: str = "", limit: int = 20):
    """Search ICD-10 diagnosis codes."""
    return {"results": coding_service.search_icd10(q, limit)}


@app.get("/api/codes/cpt")
async def search_cpt(q: str = "", limit: int = 20):
    """Search CPT procedure codes."""
    return {"results": coding_service.search_cpt(q, limit)}


# --- Patient Portal Billing ---

@app.get("/api/portal/patient/{patient_id}/billing")
async def portal_patient_billing(patient_id: int):
    """Get patient billing records (portal view)."""
    try:
        records = db.get_patient_billing(patient_id)
        return JSONResponse(content={"billing": records, "count": len(records)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/portal/patient/{patient_id}/statements")
async def portal_patient_statements(patient_id: int):
    """Get patient statements (portal view)."""
    try:
        statements = db.get_patient_statements(patient_id)
        return JSONResponse(content={"statements": statements, "count": len(statements)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/portal/patient/{patient_id}/payments")
async def portal_patient_payments(patient_id: int):
    """Get patient payment history (portal view)."""
    try:
        payments = db.get_payments(patient_id=patient_id)
        return JSONResponse(content={"payments": payments, "count": len(payments)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/portal/patient/{patient_id}/payments")
async def portal_make_payment(patient_id: int, request: RecordPaymentRequest):
    """Patient makes a payment (portal)."""
    try:
        payment_id = db.record_payment(
            patient_id=patient_id,
            amount=request.amount,
            payment_method=request.payment_method,
            payment_type="patient",
            billing_id=request.billing_id,
            notes=request.notes
        )
        return JSONResponse(content={"success": True, "payment_id": payment_id})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
