# 🏥 MedEase - Healthcare Analysis Platform

Transform complex medical records into clear summaries and analyze medication safety using AI.

## 📋 Overview

MedEase is a full-stack web application that combines AI-powered medical document analysis with comprehensive medication safety checking. Built for patients who want to understand their medical information and ensure their medications are safe to take together.

### 🌟 Core Features

#### 📄 EHR Summarizer
- **Multi-format Support**: Upload PDFs, PNGs, or JPG images of medical documents
- **AI-Powered Analysis**: Uses Google Gemini AI for accurate medical document interpretation
- **Plain English Summaries**: Converts medical jargon into language anyone can understand
- **Automatic Markdown Export**: Saves summaries as organized markdown files
- **Fast Processing**: Get summaries in 10-20 seconds

#### 💊 Drug Interaction Checker
- **Drug-Drug Interactions**: Detects harmful interactions between medications
- **Duplicate Therapy Detection**: Identifies redundant medications with the same purpose
- **Side Effect Aggregation**: Analyzes cumulative side effects across all medications
- **Dosage Validation**: Validates medication dosages against standard safe ranges
- **Risk Assessment**: Provides overall risk level (low/moderate/high) analysis
- **RxNorm Integration**: Uses official drug databases for accurate information

#### 🎨 User Experience
- Beautiful, responsive interface with drag-and-drop upload
- Privacy-focused: Documents processed securely, not permanently stored
- Comprehensive API for integration with other healthcare tools

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        User Browser                           │
│                     (React + TypeScript)                      │
└─────────────────┬──────────────────────┬─────────────────────┘
                  │                      │
                  │ HTTP/REST API        │
                  │                      │
┌─────────────────▼──────────────────────▼─────────────────────┐
│                    FastAPI Backend                            │
│                    (Python 3.9+)                              │
│  ┌──────────────────────┐   ┌────────────────────────────┐   │
│  │  EHR Summarizer      │   │  Medication Analyzer       │   │
│  │  - Document Upload   │   │  - Interaction Checker     │   │
│  │  - AI Analysis       │   │  - Duplicate Detection     │   │
│  │  - Markdown Export   │   │  - Side Effects Analysis   │   │
│  └──────────┬───────────┘   └────────────┬───────────────┘   │
└─────────────┼──────────────────────────────┼─────────────────┘
              │                              │
              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────────┐
    │  Gemini AI API   │          │  RxNorm NLM API      │
    │  (Medical OCR)   │          │  (Drug Database)     │
    └──────────────────┘          └──────────────────────┘
              │
              ▼
    ┌──────────────────┐
    │  Markdown Files  │
    │  (Local Storage) │
    └──────────────────┘
```

## 📁 Project Structure

```
medEase/
├── backend/
│   ├── main.py                      # FastAPI server with API endpoints
│   ├── medication_analyzer.py       # Drug interaction analysis engine
│   ├── drug_data.py                 # Drug interaction database
│   ├── test_medication_analyzer.py  # Unit tests for analyzer
│   ├── requirements.txt             # Python dependencies
│   ├── .env.example                 # Environment variables template
│   └── .env                         # Your API keys (create this)
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Main React component
│   │   ├── App.css                 # Application styles
│   │   ├── main.tsx                # React entry point
│   │   └── index.css               # Global styles
│   ├── index.html                  # HTML template
│   ├── package.json                # Node.js dependencies
│   ├── vite.config.ts              # Vite configuration
│   └── tsconfig.json               # TypeScript configuration
├── outputs/
│   └── summaries/                  # Generated markdown summaries
├── README.md                       # This file
├── QUICK_START.md                  # Quick start guide
├── start.sh                        # Mac/Linux startup script
├── start.bat                       # Windows startup script
└── .gitignore                     # Git ignore rules
```

## 🚀 Prerequisites

Before you begin, ensure you have the following installed:

- **Python 3.9 or higher**
  - Check: `python --version` or `python3 --version`
  - Download: [python.org](https://www.python.org/downloads/)

- **Node.js 18 or higher**
  - Check: `node --version`
  - Download: [nodejs.org](https://nodejs.org/)

- **Google Gemini API Key**
  - Get your free key: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

## 📦 Installation

### Option 1: Quick Start (Recommended)

Use the provided startup scripts for automatic setup:

**Mac/Linux:**
```bash
chmod +x start.sh
./start.sh
# Choose option 1 for first-time setup
```

**Windows:**
```cmd
start.bat
REM Choose option 1 for first-time setup
```

### Option 2: Manual Setup

#### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Create a virtual environment:**
   ```bash
   python -m venv venv
   ```

3. **Activate the virtual environment:**
   - Mac/Linux: `source venv/bin/activate`
   - Windows: `venv\Scripts\activate`

4. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

5. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Gemini API key:
   ```
   GEMINI_API_KEY=your_actual_api_key_here
   ```

#### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

## 🎯 Running the Application

### Using Startup Scripts (Easiest)

**Mac/Linux:**
```bash
./start.sh
# Choose option 4 to run both backend and frontend
```

**Windows:**
```cmd
start.bat
REM Choose option 4 to run both backend and frontend
```

### Manual Start

#### Start Backend (Terminal 1)

```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
python main.py
```

Backend will run on: `http://localhost:8000`

#### Start Frontend (Terminal 2)

```bash
cd frontend
npm run dev
```

Frontend will run on: `http://localhost:3000`

### Access the Application

Open your browser and go to: **http://localhost:3000**

## 📖 Usage Guide

### EHR Summarizer

1. **Open the application** in your browser (http://localhost:3000)

2. **Upload a document**:
   - Drag and drop a medical document onto the upload area, OR
   - Click "Choose File" to select from your computer
   - Supported formats: PDF, PNG, JPG (max 25MB)

3. **Wait for processing**:
   - The AI will analyze your document (typically 10-20 seconds)
   - You'll see a progress indicator

4. **Review your summary**:
   - Read the patient-friendly summary organized into sections
   - Review medications, test results, and follow-up care

5. **Save or print**:
   - Click "Download" to save as a markdown file
   - Click "Print" to print the summary
   - Click "New Upload" to process another document

### Drug Interaction Checker (API Usage)

The medication analysis feature is available via the REST API. Use it to check medications for safety issues:

**Example using curl:**
```bash
curl -X POST http://localhost:8000/api/analyze-medications \
  -H "Content-Type: application/json" \
  -d '{
    "medications": [
      {
        "name": "Lisinopril",
        "dosage": "10mg",
        "frequency": "once daily"
      },
      {
        "name": "Ibuprofen",
        "dosage": "400mg",
        "frequency": "as needed"
      }
    ]
  }'
```

**What it checks:**
- **Drug Interactions**: Identifies harmful combinations between medications
- **Duplicate Therapy**: Detects multiple drugs serving the same purpose
- **Side Effects**: Aggregates potential side effects across all medications
- **Dosage Validation**: Checks if dosages are within safe ranges
- **Risk Assessment**: Provides an overall risk level (low/moderate/high)

## 🔧 API Documentation

### Endpoints

#### `GET /`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "MedEase EHR Summarizer API",
  "version": "1.0.0",
  "gemini_configured": true
}
```

#### `POST /api/summarize`
Upload and summarize a medical document.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `file` (PDF, PNG, or JPG file, max 25MB)

**Response:**
```json
{
  "summary": "# Patient-friendly summary text...",
  "markdown_path": "outputs/summaries/Patient_20240115_143022.md",
  "patient_name": "John Doe",
  "date_processed": "2024-01-15T14:30:22.123456"
}
```

#### `POST /api/analyze-medications`
Analyze medications for interactions, duplicates, side effects, and dosage issues.

**Request:**
- Content-Type: `application/json`
- Body:
```json
{
  "medications": [
    {
      "name": "Lisinopril",
      "dosage": "10mg",
      "frequency": "once daily",
      "purpose": "blood pressure"
    },
    {
      "name": "Metformin",
      "dosage": "500mg",
      "frequency": "twice daily",
      "purpose": "diabetes"
    }
  ]
}
```

**Response:**
```json
{
  "medications_analyzed": 2,
  "timestamp": "2024-01-15T14:30:22.123456",
  "interactions": [
    {
      "drug1": "Lisinopril",
      "drug2": "Metformin",
      "severity": "moderate",
      "description": "May increase risk of hypoglycemia",
      "recommendation": "Monitor blood sugar levels closely"
    }
  ],
  "duplicate_therapies": [],
  "side_effects": {
    "common": {
      "dizziness": {
        "count": 2,
        "drugs": ["Lisinopril", "Metformin"]
      }
    },
    "serious": {},
    "cumulative_warnings": [
      {
        "effect": "dizziness",
        "severity": "moderate",
        "description": "Multiple medications (2) may cause dizziness",
        "drugs": ["Lisinopril", "Metformin"]
      }
    ]
  },
  "dosage_warnings": [],
  "overall_risk_level": "low"
}
```

**Limits:**
- Maximum 50 medications per request

#### `GET /api/summaries`
List all saved summaries.

**Response:**
```json
{
  "summaries": [
    {
      "filename": "JohnDoe_20240115_143022.md",
      "path": "outputs/summaries/JohnDoe_20240115_143022.md",
      "created": "2024-01-15T14:30:22",
      "size": 2048
    }
  ],
  "count": 1
}
```

## 🐛 Troubleshooting

### Backend Issues

**Problem:** `ModuleNotFoundError: No module named 'fastapi'`
- **Solution:** Make sure you activated the virtual environment and installed dependencies:
  ```bash
  source venv/bin/activate  # or venv\Scripts\activate on Windows
  pip install -r requirements.txt
  ```

**Problem:** `ValueError: GEMINI_API_KEY not found`
- **Solution:** Create a `.env` file in the `backend/` directory with your API key:
  ```
  GEMINI_API_KEY=your_api_key_here
  ```

**Problem:** `Error generating summary with Gemini API`
- **Solution:** Check that your API key is valid and you have API quota remaining
- Visit: https://aistudio.google.com/app/apikey

### Frontend Issues

**Problem:** `npm: command not found`
- **Solution:** Install Node.js from https://nodejs.org/

**Problem:** `Failed to fetch` or CORS errors
- **Solution:** Ensure the backend is running on port 8000
- Check that CORS is configured in `backend/main.py`

**Problem:** Port 3000 already in use
- **Solution:** Stop other applications using port 3000, or change the port in `frontend/vite.config.ts`

### General Issues

**Problem:** Documents fail to upload
- **Solution:**
  - Check file size is under 25MB
  - Ensure file format is PDF, PNG, or JPG
  - Verify backend is running and accessible

**Problem:** Summaries are inaccurate
- **Solution:**
  - Ensure document is clear and readable
  - Try uploading a higher quality scan/image
  - Remember: AI summaries should be reviewed by healthcare professionals

## 🔒 Security & Privacy

- **API Keys**: Never commit your `.env` file to version control
- **File Processing**: Uploaded files are processed in memory and not permanently stored
- **Markdown Files**: Saved locally in `outputs/summaries/` directory
- **HTTPS**: In production, always use HTTPS for secure transmission
- **Medical Disclaimer**: This tool provides informational summaries, not medical advice

## 🌟 Features Explained

### EHR Summarizer Features

#### Upload States

1. **Upload State**: Drag-and-drop interface with file validation
2. **Processing State**: Loading animation with progress steps
3. **Results State**: Formatted summary with action buttons

#### Summary Sections

Each summary includes:

- 📋 **Quick Overview**: Patient info, visit details
- ❤️ **What Happened**: Diagnosis in plain English
- 💊 **Your Medications**: List with purposes
- 🔬 **Test Results**: Marked as normal (✓) or needs attention (⚠️)
- 📅 **What to Do Next**: Follow-up instructions
- 🚨 **When to Seek Help**: Emergency warning signs

#### Markdown Export

Summaries are saved as markdown files with:
- Patient name and timestamp
- Medical disclaimer
- Full formatted summary
- MedEase branding

### Drug Interaction Checker Features

#### 4 Core Analysis Functions

1. **Drug-Drug Interaction Detection**
   - Checks every pair of medications for known interactions
   - Uses RxNorm API for accurate drug identification
   - Severity levels: Severe, Moderate, Mild
   - Provides specific recommendations for each interaction

2. **Duplicate Therapy Detection**
   - Groups medications by therapeutic class
   - Identifies redundant medications with same purpose
   - Distinguishes between duplicates and complementary combinations
   - Prevents unnecessary medication overlap

3. **Side Effect Aggregation**
   - Combines side effects from all medications
   - Highlights cumulative effects (when multiple drugs cause same side effect)
   - Separates common vs. serious side effects
   - Provides severity assessment for cumulative warnings

4. **Dosage Validation**
   - Parses dosage strings (supports mg, g, mcg, ml, units)
   - Compares against standard therapeutic ranges
   - Flags: below minimum, above maximum, or higher than typical doses
   - Severity-based warnings (mild/moderate/severe)

#### Risk Level Assessment

The system calculates an overall risk level:
- **Low**: No severe interactions, minimal warnings
- **Moderate**: 1-2 moderate issues or multiple mild warnings
- **High**: Any severe interactions or critical dosage issues

## 🛠️ Development

### Tech Stack

**Backend:**
- FastAPI (Python web framework)
- Google Generative AI (Gemini API for EHR analysis)
- RxNorm NLM API (drug database integration)
- Requests (HTTP client for external APIs)
- Pydantic (data validation)
- Python-dotenv (environment management)

**Frontend:**
- React 18 (UI framework)
- TypeScript (type safety)
- Vite (build tool)
- React Markdown (markdown rendering)

### Code Structure

**Backend:**
- `main.py` - FastAPI app with all API endpoints
- `medication_analyzer.py` - Drug interaction analysis engine
  - Drug-drug interaction checking
  - Duplicate therapy detection
  - Side effect aggregation
  - Dosage validation
  - RxNorm API integration
- `drug_data.py` - Drug interaction database and reference data

**Frontend (`frontend/src/App.tsx`):**
- State management (upload, processing, results)
- File upload logic
- Drag-and-drop handling
- API integration
- UI rendering

## 📝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## ⚠️ Medical Disclaimer

**IMPORTANT:** This application uses AI to generate summaries and is intended for informational purposes only. It is NOT a substitute for professional medical advice, diagnosis, or treatment.

- Always consult with qualified healthcare providers
- Do not disregard professional medical advice based on AI summaries
- In case of emergency, call 911 or your local emergency number
- Verify all medical information with your healthcare provider

## 📄 License

This project is provided as-is for educational and informational purposes.

## 🤝 Support

For issues, questions, or suggestions:

1. Check the Troubleshooting section above
2. Review the QUICK_START.md guide
3. Open an issue on the project repository

## 🎉 Credits

Built with:
- **Google Gemini AI** - Medical document analysis
- **RxNorm (NLM)** - Drug database and medication information
- **FastAPI** - High-performance backend framework
- **React** - Modern UI framework
- **TypeScript** - Type-safe development
- **Vite** - Lightning-fast build tool

### Data Sources
- RxNorm API by the U.S. National Library of Medicine (NLM)
- Drug interaction data compiled from medical literature

---

**Made with ❤️ for patients who want to understand their health**

*Version 2.0.0 - Now with Drug Interaction Checking*
