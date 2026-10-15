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
       +-- PostgreSQL (tenant-scoped application data)
```

## Authentication and tenant setup

The API issues opaque, HttpOnly session cookies after role-specific sign-in.
Patient accounts are shared identities: a patient can be linked to multiple
clinics, while clinic staff can read that patient's shared record only when
their clinic has an active `patient_clinics` membership. Existing memberships
are backfilled only from appointments and doctor-authored notes; other patients
remain unlinked until they book with a clinic or an administrator registers
them. Booking is the patient's explicit link to that clinic and gives its staff
access to the shared profile while the link is active.

For the first deployment, configure `MEDEASE_BOOTSTRAP_ADMIN_USERNAME`, a
`MEDEASE_BOOTSTRAP_ADMIN_PASSWORD` of at least 14 characters, and
`MEDEASE_BOOTSTRAP_CLINIC_NAME` in the backend environment. The clinic is
created only when the database has no clinics, and the administrator only when
the database has no administrators. Existing deployments can instead provide
`MEDEASE_BOOTSTRAP_ADMIN_CLINIC_ID`. Fictional seed data is disabled unless
`MEDEASE_SEED_DEMO_DATA=true`. Set `FRONTEND_URL` to
the exact production frontend origin and use `ENVIRONMENT=production` so the
session cookie is Secure. Never deploy the example database URL or bootstrap
credentials.

Set `MEDEASE_BOOTSTRAP_ADMIN_FIRST_NAME`, `MEDEASE_BOOTSTRAP_ADMIN_LAST_NAME`,
and `MEDEASE_BOOTSTRAP_ADMIN_DATE_OF_BIRTH` for the first administrator.
All account roles require a legal name and date of birth that match the
Credence verified identity. Doctors capture these fields during provisioning;
existing admin/doctor accounts must have their new fields completed by an
operator before they can sign in.

Set `CREDENCE_LICENSE_KEY`, `CREDENCE_PROFILE_ID`, and `CREDENCE_API_BASE` in
the backend environment, and register the exact `FRONTEND_URL` origin in the
Credence portal. The login flow checks the existing MedEase password first,
then requires the user to scan the Credence wallet request. Only a successful
verified name and date-of-birth match creates a MedEase session. The legacy
role login endpoints remain present for compatibility but return HTTP 410 and
never issue sessions. Missing Credence configuration fails closed.

This implementation uses Credence's server-side OpenID4VP ISO mdoc flow.
It stores short-lived login-flow state and rotated Credence API tokens in
process memory; run one backend process per deployment until that state is
moved to a shared store for multi-worker or multi-instance scaling. Verified
identity claims are not persisted or logged.

Set `RESEND_API_KEY` and `EMAIL_FROM` to enable password-reset and account
credential emails. Without an email provider, newly provisioned temporary
credentials are returned to the clinic administrator once.


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
- PostgreSQL (Database; set `DATABASE_URL`)
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
