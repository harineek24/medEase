# 🏥 MedEase - EHR Summarizer

Transform complex medical records into clear, patient-friendly summaries using AI.

## 📋 Overview

MedEase is a full-stack web application that uses Google Gemini AI to convert Electronic Health Records (EHRs), lab reports, and medical documents into easy-to-understand summaries. Built for patients who want to understand their medical information without needing a medical degree.

### Key Features

- 📄 **Multi-format Support**: Upload PDFs, PNGs, or JPG images of medical documents
- 🤖 **AI-Powered**: Uses Google Gemini 1.5 Pro for accurate medical document analysis
- 💬 **Plain English**: Converts medical jargon into language anyone can understand
- 📝 **Automatic Markdown**: Saves summaries as organized markdown files
- 🎨 **Beautiful UI**: Modern, responsive interface with drag-and-drop upload
- 🔒 **Privacy Focused**: Documents are processed securely and not permanently stored
- ⚡ **Fast**: Get summaries in 10-20 seconds

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                          │
│                     (React + TypeScript)                     │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST API
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    FastAPI Backend                           │
│                    (Python 3.9+)                             │
└────────────────────────┬────────────────────────────────────┘
                         │ API Call
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Google Gemini API                           │
│                 (gemini-1.5-pro-latest)                      │
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │   Markdown   │
                  │    Files     │
                  └──────────────┘
```

## 📁 Project Structure

```
medEase/
├── backend/
│   ├── main.py              # FastAPI server with Gemini integration
│   ├── requirements.txt     # Python dependencies
│   ├── .env.example         # Environment variables template
│   └── .env                 # Your API keys (create this)
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Main React component
│   │   ├── App.css         # Application styles
│   │   ├── main.tsx        # React entry point
│   │   └── index.css       # Global styles
│   ├── index.html          # HTML template
│   ├── package.json        # Node.js dependencies
│   ├── vite.config.ts      # Vite configuration
│   └── tsconfig.json       # TypeScript configuration
├── outputs/
│   └── summaries/          # Generated markdown summaries
├── README.md               # This file
├── QUICK_START.md          # Quick start guide
├── start.sh                # Mac/Linux startup script
├── start.bat               # Windows startup script
└── .gitignore             # Git ignore rules
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
- Body: `file` (PDF, PNG, or JPG file)

**Response:**
```json
{
  "summary": "# Patient-friendly summary text...",
  "markdown_path": "outputs/summaries/Patient_20240115_143022.md",
  "patient_name": "John Doe",
  "date_processed": "2024-01-15T14:30:22.123456"
}
```

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

### Upload States

1. **Upload State**: Drag-and-drop interface with file validation
2. **Processing State**: Loading animation with progress steps
3. **Results State**: Formatted summary with action buttons

### Summary Sections

Each summary includes:

- 📋 **Quick Overview**: Patient info, visit details
- ❤️ **What Happened**: Diagnosis in plain English
- 💊 **Your Medications**: List with purposes
- 🔬 **Test Results**: Marked as normal (✓) or needs attention (⚠️)
- 📅 **What to Do Next**: Follow-up instructions
- 🚨 **When to Seek Help**: Emergency warning signs

### Markdown Export

Summaries are saved as markdown files with:
- Patient name and timestamp
- Medical disclaimer
- Full formatted summary
- MedEase branding

## 🛠️ Development

### Tech Stack

**Backend:**
- FastAPI (Python web framework)
- Google Generative AI (Gemini API)
- Pydantic (data validation)
- Python-dotenv (environment management)

**Frontend:**
- React 18 (UI framework)
- TypeScript (type safety)
- Vite (build tool)
- React Markdown (markdown rendering)

### Code Structure

**Backend (`backend/main.py`):**
- FastAPI app configuration
- Gemini API integration
- File upload handling
- Prompt engineering
- Markdown file generation

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
- Google Gemini AI
- FastAPI
- React
- TypeScript
- Vite

---

**Made with ❤️ for patients who want to understand their health**

*Version 1.0.0*
