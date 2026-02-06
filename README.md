# MedEase - AI-Powered Healthcare Platform

Transform complex medical records into clear summaries, check medication safety, and conduct AI-powered voice consultations.

## Features

### EHR Summarizer
- **Multi-format Support**: Upload PDFs, PNGs, or JPG images of medical documents
- **AI-Powered Analysis**: Uses Google Gemini AI for accurate medical document interpretation
- **Plain English Summaries**: Converts medical jargon into language anyone can understand
- **Automatic Markdown Export**: Saves summaries as organized markdown files

### Drug Interaction Checker
- **Drug-Drug Interactions**: Detects harmful interactions between medications
- **Duplicate Therapy Detection**: Identifies redundant medications
- **Side Effect Aggregation**: Analyzes cumulative side effects across all medications
- **Dosage Validation**: Validates medication dosages against standard safe ranges
- **Risk Assessment**: Provides overall risk level (low/moderate/high) analysis

### Voice Consultation (Dr. MedAssist)
- **Real-time Voice AI**: Powered by Gemini 2.5 Flash Native Audio
- **Natural Conversations**: Conducts structured medical interviews via voice
- **Live Doctor's Notes**: Fields update in real-time as patient speaks
- **Inline Editing**: Edit captured information directly in the UI
- **Summary Generation**: Automatic consultation summary at completion

### Dashboard & History
- **Patient Dashboard**: Overview of all patients and summaries
- **History View**: Browse and search past consultations
- **Statistics**: Track medications, interactions, and high-risk cases

### AI Chat
- **General Chat**: Ask health questions, search patients, medication info
- **Patient Chat**: Contextual Q&A about a specific patient's summary

## Architecture

```
Frontend (React + TypeScript + Vite)
       |
       | HTTP/REST + WebSocket
       |
Backend (FastAPI + Python)
       |
       +-- Gemini AI (EHR Analysis, Voice, Chat)
       +-- Gemini Live API (Real-time Voice)
       +-- RxNorm API (Drug Database)
       +-- SQLite (Local Storage)
```

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- Google Gemini API Key: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/harineek24/medEase.git
   cd medEase
   ```

2. **Backend Setup**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt

   # Create .env file
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install

   # For production, create .env file
   cp .env.example .env
   # Edit VITE_API_URL to your backend URL
   ```

### Running Locally

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate
python main.py
```
Backend runs on: `http://localhost:8000`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend runs on: `http://localhost:3000`

## Deployment

### Frontend (Vercel)

1. Push your code to GitHub
2. Import project in Vercel
3. Set build settings:
   - Framework: Vite
   - Root Directory: `frontend`
4. Add environment variable:
   - `VITE_API_URL`: Your backend API URL

### Backend (Railway/Render/Fly.io)

1. Deploy the `backend` folder
2. Set environment variables:
   - `GEMINI_API_KEY`: Your Google Gemini API key
3. Ensure CORS allows your frontend domain

## Environment Variables

### Backend (.env)
```
GEMINI_API_KEY=your_gemini_api_key_here
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000  # or production backend URL
```

## API Endpoints

### EHR Summarization
- `POST /api/summarize` - Upload and summarize medical document
- `POST /api/extract-medications` - Extract medications from summary
- `POST /api/extract-test-results` - Extract test results from summary
- `POST /api/medication-details` - Get detailed medication information

### Drug Analysis
- `POST /api/analyze-medications` - Analyze medications for interactions

### Voice Consultation
- `POST /api/consult/start` - Start new consultation session
- `WS /ws/voice/{session_id}` - WebSocket for real-time voice
- `POST /api/consult/summary` - Get consultation summary

### Dashboard & History
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/history` - Get all summaries
- `GET /api/history/{id}` - Get specific summary
- `POST /api/save-summary` - Save summary to history

### Chat
- `POST /api/chat/general` - General health chat
- `POST /api/chat/patient` - Patient-specific chat

## Tech Stack

**Backend:**
- FastAPI (Python web framework)
- Google Generative AI (Gemini API)
- Google GenAI Live API (Real-time voice)
- SQLite (Database)
- WebSockets (Voice streaming)

**Frontend:**
- React 18
- TypeScript
- Vite
- Web Audio API (Voice capture/playback)

## Medical Disclaimer

This application uses AI to generate summaries and is intended for **informational purposes only**. It is NOT a substitute for professional medical advice, diagnosis, or treatment.

- Always consult with qualified healthcare providers
- Do not disregard professional medical advice based on AI summaries
- In case of emergency, call 911 or your local emergency number

## License

This project is provided as-is for educational and informational purposes.

## Credits

Built with:
- Google Gemini AI - Medical document analysis & voice consultation
- RxNorm (NLM) - Drug database and medication information
- FastAPI - High-performance backend framework
- React + Vite - Modern frontend tooling
