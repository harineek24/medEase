import os
import base64
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

import google.generativeai as genai
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Import medication analyzer
from medication_analyzer import analyzer

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
