---
marp: true
theme: default
paginate: true
style: |
  section {
    background-color: #ffffff;
    color: #0B3D2E;
    font-family: 'Helvetica Neue', Arial, sans-serif;
  }
  h1, h2 {
    color: #0B3D2E;
  }
  strong {
    color: #0B3D2E;
  }
  code, pre {
    background-color: #0B3D2E;
    color: #ffffff;
  }
  table th {
    background-color: #0B3D2E;
    color: #ffffff;
  }
  section::after {
    color: #0B3D2E;
  }
  a {
    color: #0B3D2E;
  }
---

# MedEase Voice Agent
## Architecture & Implementation Overview

---

## 1. Tech Stack

- **LLM / Voice Engine:** Google Gemini 2.5 Flash Native Audio (`gemini-2.5-flash-native-audio-preview-12-2025`) via `google-genai` Live API
  - Single model handles STT + reasoning + TTS — no separate Whisper/ElevenLabs
- **Backend:** FastAPI + asyncio, PostgreSQL (psycopg2)
- **Frontend:** React + TypeScript, raw Web Audio API
- **Transport:** WebSocket — binary PCM audio + JSON control messages
- **Audio format:** 16kHz PCM int16 (mic → Gemini), 24kHz PCM int16 (Gemini → speaker)

---

## 2. Architecture

```
React Client (mic capture, playback, UI state)
   ⇅ WebSocket /ws/voice/{session_id}
FastAPI → VoiceConsultationService
   ⇅ Gemini Live API (bidirectional streaming)
Function calls: save_field / flag_emergency /
                submit_consultation_summary / complete_consultation
   ↓
PostgreSQL (consultation_sessions, consultation_fields, consultation_configs)
```

- **ConsultationConfig** — clinic template (fields, prompts, voice)
- **ConsultationSession** — live in-memory call state
- **VoiceConsultationService** — orchestrator: builds prompt, manages Gemini connection, routes tool calls

---

## 3. Event Flow: User Speaks → Agent Responds

1. `POST /api/consult/start` → session created
2. WebSocket opens → backend sends `ready` with existing fields
3. Mic captured @16kHz → binary PCM frames streamed to backend
4. Backend forwards to Gemini Live (`send_realtime_input`)
5. Gemini streams back audio (24kHz), transcript text, and/or function calls
6. `save_field` → saved in-memory + Postgres → client shows confirmation popup
7. `flag_emergency` → DB flag set, alert shown to user
8. `complete_consultation` → session ends, summary generated, saved to DB

---

## 4. Prompts & Agent Behavior

Persona: **"Dr. MedAssist"** — warm, one question at a time

- **Hard rule:** call `save_field()` immediately after every answer — prompt explicitly warns "data will be LOST" otherwise
- Watches for emergency symptoms → must call `flag_emergency`
- Dynamically injected: full field list + questions, already-collected answers (resume support), scripted opening line, completion instructions
- Default 13-field structured intake (name, DOB, chief complaint, severity, meds, allergies, etc.) — fully configurable per clinic via admin API

---

## 5. State Management & Persistence

- **In-memory:** `ConsultationSession` (fields, conversation history, audio queue, emergency flag)
- **Persisted incrementally to Postgres**, not just at session end:
  `consultation_sessions`, `consultation_fields`, `consultation_configs`
- **Resilience:** session recoverable via `session_id` even after WS drop — fields saved field-by-field
- **Frontend:** local React state machine (`idle / listening / speaking / thinking`), no client-side persistence

---

## 6. Difficulties Faced & Future Improvements

**Difficulties:**
- Sample-rate mismatch (16kHz in / 24kHz out) required manual PCM conversion
- LLM initially skipped `save_field()` — fixed via aggressive prompt reinforcement, not code
- Concurrent bidirectional audio streaming risks dropped chunks under jitter
- In-memory session state is lost on server restart
- Emergency detection is LLM-only, no deterministic safety net

**Future Improvements:**
- Deterministic keyword safety-net behind `flag_emergency`
- Move session state to Redis/DB-backed store for resilience
- Auto-reconnect/resume on dropped WebSocket
- Stream interim transcripts, not just final text
- Add latency/quality observability for Gemini Live connection
- Multi-language support
