# MedEase - AI-Powered Healthcare Platform

MedEase is a multi-portal healthcare platform that transforms complex medical records into clear summaries, checks medication safety, and conducts AI-powered voice consultations. It serves three user roles: patients, doctors, and clinic administrators.

## Portals

### Patient Portal

- **Document Upload** -- Upload PDFs, PNGs, or JPGs of medical documents for AI-powered summarization using Google Gemini. Converts medical jargon into plain English.
- **Health History** -- Browse personal medical records, past summaries, lab result trends, medication timelines, and voice consultation results.
- **AI Chat** -- General-purpose health assistant for medication questions, health education, and patient search.
- **Live Consult (Dr. MedAssist)** -- Real-time voice consultation powered by Gemini 2.5 Flash Native Audio. The AI conducts a structured medical interview, captures fields live into Doctor's Notes, and generates a summary that is saved to the database.
- **Health Updates** -- Record health updates via text or voice with automatic transcription and AI-generated summaries. Updates are sent to the assigned doctor's feed.
- **Book Appointment** -- Search doctors by specialty, rating, clinic, and consultation fee. Book available time slots.

### Doctor Portal

- **Feed** -- View incoming patient health updates (text and voice) and today's completed voice consultations with extracted fields.
- **History** -- Browse all assigned patients, view their appointment history, active prescriptions, and medical records.
- **Calendar** -- Week and day views of scheduled appointments with status tracking (scheduled, confirmed, completed, cancelled).
- **Consult Config** -- Create and edit voice consultation templates with custom fields, AI prompts, voice personalities, and completion messages.

### Clinic Admin Portal

- **Patient Registration** -- Register new patients with demographics, contact information, and insurance provider selection.
- **Doctor Management** -- Add and manage doctors with specialty, education, languages, availability schedules, and consultation fees.

## Architecture

```
Frontend (React 18 + TypeScript + Vite + Tailwind CSS)
       |
       | HTTP/REST + WebSocket
       |
Backend (FastAPI + Python)
       |
       +-- Google Gemini AI (Document analysis, Chat, Summarization)
       +-- Gemini Live API (Real-time voice consultation)
       +-- RxNorm API (Drug database and interaction checking)
       +-- SQLite (Local storage)
```

## API Endpoints

### EHR Summarization
- `POST /api/summarize` -- Upload and summarize a medical document
- `POST /api/extract-medications` -- Extract medications from a summary
- `POST /api/extract-test-results` -- Extract test results from a summary
- `POST /api/medication-details` -- Get detailed medication information

### Drug Analysis
- `POST /api/analyze-medications` -- Analyze medications for interactions, duplicates, and dosage issues

### Voice Consultation
- `POST /api/consult/start` -- Start a new consultation session (accepts patient_id)
- `WS /ws/voice/{session_id}` -- WebSocket for real-time bidirectional audio
- `POST /api/consult/summary` -- Generate, save, and return consultation summary

### History and Summaries
- `GET /api/history` -- List all saved summaries
- `GET /api/history/{id}` -- Get a specific summary with medications, test results, and interactions
- `POST /api/save-summary` -- Save a summary to the database

### Doctor Feed
- `GET /api/doctor/{doctor_id}/feed/patient-updates` -- Get patient updates for a doctor
- `GET /api/doctor/{doctor_id}/consultations/today` -- Get today's completed consultations

### Patient Data
- `GET /api/patient/{patient_id}/consultations` -- Get a patient's completed consultations
- `POST /api/patient/book-appointment` -- Book an appointment

### Chat
- `POST /api/chat/general` -- General health chat
- `POST /api/chat/patient` -- Patient-specific contextual chat

## Tech Stack

**Backend:**
- FastAPI (Python web framework)
- Google Generative AI SDK (Gemini API)
- Google GenAI Live API (Real-time voice with function calling)
- SQLite (Database)
- WebSockets (Bidirectional audio streaming)

**Frontend:**
- React 18 with TypeScript
- Vite (Build tooling)
- Tailwind CSS (Styling)
- Lucide React (Icons)
- Framer Motion (Animations)
- Three.js / React Three Fiber (3D visuals)
- Web Audio API (Voice capture and playback)

## Medical Disclaimer

This application uses AI to generate summaries and is intended for informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment.

- Always consult with qualified healthcare providers
- Do not disregard professional medical advice based on AI summaries
- In case of emergency, call 911 or your local emergency number

## License

This project is provided as-is for educational and informational purposes.

## Credits

Built with:
- Google Gemini AI -- Medical document analysis and voice consultation
- RxNorm (NLM) -- Drug database and medication information
- FastAPI -- High-performance backend framework
- React + Vite -- Modern frontend tooling
