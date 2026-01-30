"""
Voice Service for Live Doctor Consultation
Uses Gemini 2.5 Flash with native audio for real-time voice conversations
"""

import os
import json
import asyncio
import base64
from typing import Optional, Dict, Any, Callable, List
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# Try to import google genai for live audio
try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    genai = None
    types = None
    print("Warning: google-genai package not installed. Voice features will be limited.")


# Consultation fields we want to extract
CONSULTATION_FIELDS = [
    {"name": "patient_name", "label": "Patient Name", "question": "What is your name?"},
    {"name": "date_of_birth", "label": "Date of Birth", "question": "What is your date of birth?"},
    {"name": "chief_complaint", "label": "Chief Complaint", "question": "What brings you in today? What's your main concern?"},
    {"name": "symptom_duration", "label": "Duration", "question": "How long have you been experiencing this?"},
    {"name": "symptom_severity", "label": "Severity", "question": "On a scale of 1 to 10, how severe is it?"},
    {"name": "symptom_location", "label": "Location", "question": "Where exactly do you feel the discomfort?"},
    {"name": "symptom_quality", "label": "Quality", "question": "Can you describe what it feels like?"},
    {"name": "aggravating_factors", "label": "What Makes It Worse", "question": "What makes it worse?"},
    {"name": "relieving_factors", "label": "What Helps", "question": "What makes it better?"},
    {"name": "associated_symptoms", "label": "Other Symptoms", "question": "Are you experiencing any other symptoms?"},
    {"name": "medications", "label": "Current Medications", "question": "What medications are you currently taking?"},
    {"name": "allergies", "label": "Allergies", "question": "Do you have any allergies?"},
    {"name": "medical_history", "label": "Medical History", "question": "Do you have any significant medical conditions?"},
]

DOCTOR_SYSTEM_PROMPT = """You are Dr. MedAssist, a warm and professional AI physician assistant conducting a virtual medical consultation.

Your role:
- Conduct a structured medical interview, asking ONE question at a time
- Be empathetic, patient, and reassuring
- Speak naturally as if in a real doctor's office
- After each answer, briefly acknowledge what the patient said before moving to the next question

The fields you need to collect (in order):
1. Patient's name
2. Date of birth
3. Chief complaint (main reason for visit)
4. Duration of symptoms
5. Severity (1-10 scale)
6. Location of discomfort
7. Quality/character of symptoms
8. Aggravating factors
9. Relieving factors
10. Associated symptoms
11. Current medications
12. Allergies
13. Relevant medical history

IMPORTANT RULES:
- Ask only ONE question at a time
- Wait for the patient's response before moving on
- If the patient's answer is unclear, politely ask for clarification
- Watch for emergency symptoms (chest pain, difficulty breathing, severe bleeding, stroke signs) - if detected, immediately advise calling 911
- After collecting all information, provide a brief summary and general recommendations
- Always remind patients this is not a substitute for in-person medical care

When you extract information, call the save_field function with the field name and value.

Start by warmly greeting the patient and asking for their name."""


class ConsultationSession:
    """Manages a single consultation session's state"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.fields: Dict[str, Any] = {}
        self.current_field_index = 0
        self.conversation_history: List[Dict] = []
        self.is_active = True
        self.is_emergency = False
        self.created_at = datetime.now()
        self.audio_queue = asyncio.Queue()
        self.response_queue = asyncio.Queue()

    def get_collected_fields(self) -> List[Dict]:
        """Return list of collected fields with their values"""
        result = []
        for field in CONSULTATION_FIELDS:
            if field["name"] in self.fields:
                result.append({
                    "name": field["name"],
                    "label": field["label"],
                    "value": self.fields[field["name"]],
                    "confirmed": True
                })
        return result

    def get_next_field(self) -> Optional[Dict]:
        """Get the next field to collect"""
        for field in CONSULTATION_FIELDS:
            if field["name"] not in self.fields:
                return field
        return None

    def save_field(self, field_name: str, value: str) -> bool:
        """Save a field value"""
        self.fields[field_name] = value
        return True

    def update_field(self, field_name: str, value: str) -> bool:
        """Update an existing field value"""
        if field_name in self.fields or any(f["name"] == field_name for f in CONSULTATION_FIELDS):
            self.fields[field_name] = value
            return True
        return False

    def is_complete(self) -> bool:
        """Check if all required fields are collected"""
        required = ["patient_name", "chief_complaint"]  # Minimum required
        return all(f in self.fields for f in required)


class VoiceConsultationService:
    """Service for managing voice-based medical consultations using Gemini Live API"""

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.sessions: Dict[str, ConsultationSession] = {}

        # Audio settings matching voicegen
        self.send_sample_rate = 16000  # Browser to Gemini
        self.receive_sample_rate = 24000  # Gemini to browser
        self.chunk_size = 1024

        # Model for live audio
        self.model_id = "gemini-2.0-flash-live-001"

        if GENAI_AVAILABLE and self.api_key:
            self.client = genai.Client(
                api_key=self.api_key,
                http_options={"api_version": "v1alpha"}
            )
        else:
            self.client = None

    def create_session(self, session_id: str) -> ConsultationSession:
        """Create a new consultation session"""
        session = ConsultationSession(session_id)
        self.sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[ConsultationSession]:
        """Get an existing session"""
        return self.sessions.get(session_id)

    def get_tools_config(self):
        """Define the function tools for field extraction using proper Gemini types"""
        if not GENAI_AVAILABLE or types is None:
            return []

        # Build the enum values for field names
        field_names = [f["name"] for f in CONSULTATION_FIELDS]

        save_field_declaration = types.FunctionDeclaration(
            name="save_field",
            description="Save a piece of information collected from the patient",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "field_name": types.Schema(
                        type=types.Type.STRING,
                        enum=field_names,
                        description="The name of the field being saved"
                    ),
                    "value": types.Schema(
                        type=types.Type.STRING,
                        description="The value to save"
                    )
                },
                required=["field_name", "value"]
            )
        )

        flag_emergency_declaration = types.FunctionDeclaration(
            name="flag_emergency",
            description="Flag this as an emergency situation requiring immediate medical attention",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "reason": types.Schema(
                        type=types.Type.STRING,
                        description="The emergency symptoms detected"
                    )
                },
                required=["reason"]
            )
        )

        return [types.Tool(function_declarations=[save_field_declaration, flag_emergency_declaration])]

    def get_session_config(self, session: ConsultationSession):
        """Get the configuration for a Gemini Live session"""
        if not GENAI_AVAILABLE or types is None:
            return None

        # Build context from already collected fields
        context = ""
        if session.fields:
            context = "\n\nInformation already collected:\n"
            for name, value in session.fields.items():
                label = next((f["label"] for f in CONSULTATION_FIELDS if f["name"] == name), name)
                context += f"- {label}: {value}\n"
            context += "\nContinue from where we left off, asking about the next missing field."

        return types.LiveConnectConfig(
            system_instruction=DOCTOR_SYSTEM_PROMPT + context,
            response_modalities=["AUDIO", "TEXT"],
            tools=self.get_tools_config(),
        )

    async def process_audio_stream(
        self,
        session: ConsultationSession,
        on_audio: Callable[[bytes], Any],
        on_text: Callable[[str], Any],
        on_field_extracted: Callable[[str, str, str], Any],
        on_emergency: Callable[[str], Any]
    ):
        """
        Process the audio stream for a consultation session

        Args:
            session: The consultation session
            on_audio: Callback for audio output (bytes)
            on_text: Callback for text transcripts
            on_field_extracted: Callback when a field is extracted (field_name, label, value)
            on_emergency: Callback for emergency detection
        """
        if not self.client:
            # Fallback for when Gemini Live isn't available
            await on_text("Voice consultation requires the google-genai package with Live API support.")
            return

        config = self.get_session_config(session)

        try:
            async with self.client.aio.live.connect(
                model=self.model_id,
                config=config
            ) as live_session:

                # Start receiving responses in background
                receive_task = asyncio.create_task(
                    self._receive_responses(
                        live_session, session, on_audio, on_text,
                        on_field_extracted, on_emergency
                    )
                )

                # Process incoming audio from the user
                try:
                    while session.is_active:
                        try:
                            audio_data = await asyncio.wait_for(
                                session.audio_queue.get(),
                                timeout=0.1
                            )
                            if audio_data:
                                await live_session.send_realtime_input(
                                    audio={
                                        "data": audio_data,
                                        "mime_type": "audio/pcm;rate=16000"
                                    }
                                )
                        except asyncio.TimeoutError:
                            continue
                        except Exception as e:
                            print(f"Error sending audio: {e}")
                            break
                finally:
                    receive_task.cancel()
                    try:
                        await receive_task
                    except asyncio.CancelledError:
                        pass

        except Exception as e:
            print(f"Error in audio stream processing: {e}")
            await on_text(f"Connection error: {str(e)}")

    async def _receive_responses(
        self,
        live_session,
        session: ConsultationSession,
        on_audio: Callable,
        on_text: Callable,
        on_field_extracted: Callable,
        on_emergency: Callable
    ):
        """Receive and process responses from Gemini"""
        try:
            async for response in live_session.receive():
                if not session.is_active:
                    break

                # Handle audio output
                if hasattr(response, 'data') and response.data:
                    await on_audio(response.data)

                # Handle text output
                if hasattr(response, 'text') and response.text:
                    await on_text(response.text)
                    session.conversation_history.append({
                        "role": "assistant",
                        "content": response.text,
                        "timestamp": datetime.now().isoformat()
                    })

                # Handle tool calls (field extraction)
                if hasattr(response, 'tool_calls') and response.tool_calls:
                    for tool_call in response.tool_calls:
                        await self._handle_tool_call(
                            tool_call, session,
                            on_field_extracted, on_emergency
                        )

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Error receiving responses: {e}")

    async def _handle_tool_call(
        self,
        tool_call,
        session: ConsultationSession,
        on_field_extracted: Callable,
        on_emergency: Callable
    ):
        """Handle a tool call from Gemini"""
        try:
            name = tool_call.name if hasattr(tool_call, 'name') else tool_call.get('name')
            args = tool_call.args if hasattr(tool_call, 'args') else tool_call.get('args', {})

            if name == "save_field":
                field_name = args.get("field_name")
                value = args.get("value")

                if field_name and value:
                    session.save_field(field_name, value)
                    label = next(
                        (f["label"] for f in CONSULTATION_FIELDS if f["name"] == field_name),
                        field_name
                    )
                    await on_field_extracted(field_name, label, value)

            elif name == "flag_emergency":
                reason = args.get("reason", "Emergency symptoms detected")
                session.is_emergency = True
                await on_emergency(reason)

        except Exception as e:
            print(f"Error handling tool call: {e}")

    async def send_audio(self, session_id: str, audio_data: bytes):
        """Queue audio data to be sent to Gemini"""
        session = self.get_session(session_id)
        if session and session.is_active:
            await session.audio_queue.put(audio_data)

    def end_session(self, session_id: str) -> Optional[Dict]:
        """End a consultation session and return collected data"""
        session = self.sessions.get(session_id)
        if session:
            session.is_active = False
            return {
                "session_id": session_id,
                "fields": session.fields,
                "is_emergency": session.is_emergency,
                "conversation_history": session.conversation_history
            }
        return None

    def generate_summary(self, session_id: str) -> str:
        """Generate a formatted summary of the consultation"""
        session = self.sessions.get(session_id)
        if not session:
            return "Session not found"

        summary = f"""
╔══════════════════════════════════════════════════════════════╗
║                    CONSULTATION SUMMARY                       ║
║                      Dr. MedAssist AI                         ║
╠══════════════════════════════════════════════════════════════╣

Date: {session.created_at.strftime("%B %d, %Y at %I:%M %p")}
Session ID: {session_id}

──────────────────────────────────────────────────────────────
                      PATIENT INFORMATION
──────────────────────────────────────────────────────────────
"""

        for field in CONSULTATION_FIELDS:
            if field["name"] in session.fields:
                summary += f"\n{field['label']}:\n    {session.fields[field['name']]}\n"

        if session.is_emergency:
            summary += """
══════════════════════════════════════════════════════════════
⚠️  EMERGENCY FLAG: This consultation detected symptoms
    requiring immediate medical attention.
══════════════════════════════════════════════════════════════
"""

        summary += """
──────────────────────────────────────────────────────────────
                         DISCLAIMER
──────────────────────────────────────────────────────────────
This summary was generated by an AI assistant and is for
informational purposes only. It does not constitute medical
advice, diagnosis, or treatment. Please consult with a
qualified healthcare provider for proper medical care.
──────────────────────────────────────────────────────────────
"""

        return summary


# Global service instance
voice_service = VoiceConsultationService()
