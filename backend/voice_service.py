"""
Voice Service for Live Doctor Consultation
Uses Gemini 2.5 Flash Native Audio with bidirectional streaming
Based on voicegen reference implementation
"""

import os
import json
import asyncio
from typing import Optional, Dict, Any, Callable, List
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# Try to import google genai for live audio
try:
    from google import genai
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    genai = None
    print("Warning: google-genai package not installed. Voice features will be limited.")


# Audio configuration matching Gemini Live API requirements
CHANNELS = 1
SEND_SAMPLE_RATE = 16000
RECEIVE_SAMPLE_RATE = 24000
CHUNK_SIZE = 1024

# Default consultation fields - can be overridden by admin config
# Keeping it focused to 6 essential fields for better reliability
DEFAULT_CONSULTATION_FIELDS = [
    {"name": "patient_name", "type": "text", "label": "Patient Name", "prompt": "What is your name?", "required": True},
    {"name": "chief_complaint", "type": "text", "label": "Chief Complaint", "prompt": "What brings you in today? What's your main concern?", "required": True},
    {"name": "symptom_duration", "type": "text", "label": "Duration", "prompt": "How long have you been experiencing this?", "required": True},
    {"name": "symptom_severity", "type": "number", "label": "Severity (1-10)", "prompt": "On a scale of 1 to 10, how severe is it?", "required": True},
    {"name": "medications", "type": "text", "label": "Current Medications", "prompt": "Are you taking any medications?", "required": True},
    {"name": "allergies", "type": "text", "label": "Allergies", "prompt": "Do you have any allergies?", "required": True},
]

# Extended fields available for custom configs
EXTENDED_CONSULTATION_FIELDS = [
    {"name": "date_of_birth", "type": "date", "label": "Date of Birth", "prompt": "What is your date of birth?", "required": False},
    {"name": "symptom_location", "type": "text", "label": "Location", "prompt": "Where exactly do you feel the discomfort?", "required": False},
    {"name": "symptom_quality", "type": "text", "label": "Quality", "prompt": "Can you describe what it feels like?", "required": False},
    {"name": "aggravating_factors", "type": "text", "label": "What Makes It Worse", "prompt": "What makes it worse?", "required": False},
    {"name": "relieving_factors", "type": "text", "label": "What Helps", "prompt": "What makes it better?", "required": False},
    {"name": "associated_symptoms", "type": "text", "label": "Other Symptoms", "prompt": "Are you experiencing any other symptoms?", "required": False},
    {"name": "medical_history", "type": "text", "label": "Medical History", "prompt": "Do you have any significant medical conditions?", "required": False},
]

# Default AI prompt
DEFAULT_AI_PROMPT = "Hello! I'm Dr. MedAssist, your AI medical assistant. I'm here to help gather some information about your health concern today."

# Default system instruction template
DEFAULT_SYSTEM_INSTRUCTION = """You are Dr. MedAssist, a warm and professional AI physician assistant conducting a virtual medical consultation.

Your role:
- Conduct a structured medical interview, asking ONE question at a time
- Be empathetic, patient, and reassuring
- Speak naturally as if in a real doctor's office

CRITICAL INSTRUCTION - YOU MUST FOLLOW THIS FOR EVERY RESPONSE:
After the patient answers ANY question, you MUST:
1. FIRST: Call save_field() with the information they provided
2. THEN: Acknowledge what they said
3. THEN: Ask the next question

NEVER skip calling save_field(). EVERY piece of information must be saved immediately.
If patient gives multiple pieces of info, call save_field() multiple times.

IMPORTANT RULES:
- Ask only ONE question at a time
- Wait for the patient's response before moving on
- If the patient's answer is unclear, politely ask for clarification
- Watch for emergency symptoms (chest pain, difficulty breathing, severe bleeding, stroke signs) - if detected, immediately advise calling 911

COMPLETION:
- After ALL fields are collected, call submit_consultation_summary
- Then say "Thank you! Your consultation summary has been saved." and call complete_consultation
"""

# Available voice options for Gemini
AVAILABLE_VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Aoede"]


class ConsultationConfig:
    """Configuration for a consultation form - can be customized by admin"""

    def __init__(
        self,
        config_id: str = "default",
        name: str = "Medical Consultation",
        description: str = "Standard medical intake consultation",
        fields: Optional[List[Dict]] = None,
        ai_prompt: str = DEFAULT_AI_PROMPT,
        system_instruction: Optional[str] = None,
        voice_name: str = "Aoede",
        success_message: str = "Thank you for completing the consultation!",
        emergency_message: str = "This appears to be an emergency. Please call 911 immediately.",
        settings: Optional[Dict] = None
    ):
        self.config_id = config_id
        self.name = name
        self.description = description
        self.fields = fields or DEFAULT_CONSULTATION_FIELDS
        self.ai_prompt = ai_prompt
        self.system_instruction = system_instruction or DEFAULT_SYSTEM_INSTRUCTION
        self.voice_name = voice_name if voice_name in AVAILABLE_VOICES else "Aoede"
        self.success_message = success_message
        self.emergency_message = emergency_message
        self.settings = settings or {}

    def to_dict(self) -> Dict:
        return {
            "config_id": self.config_id,
            "name": self.name,
            "description": self.description,
            "fields": self.fields,
            "ai_prompt": self.ai_prompt,
            "system_instruction": self.system_instruction,
            "voice_name": self.voice_name,
            "success_message": self.success_message,
            "emergency_message": self.emergency_message,
            "settings": self.settings
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'ConsultationConfig':
        return cls(
            config_id=data.get("config_id", "default"),
            name=data.get("name", "Medical Consultation"),
            description=data.get("description", ""),
            fields=data.get("fields"),
            ai_prompt=data.get("ai_prompt", DEFAULT_AI_PROMPT),
            system_instruction=data.get("system_instruction"),
            voice_name=data.get("voice_name", "Aoede"),
            success_message=data.get("success_message", "Thank you!"),
            emergency_message=data.get("emergency_message", "Please call 911!"),
            settings=data.get("settings", {})
        )


class ConsultationSession:
    """Manages a single consultation session's state"""

    def __init__(self, session_id: str, config: Optional[ConsultationConfig] = None):
        self.session_id = session_id
        self.config = config or ConsultationConfig()
        self.fields: Dict[str, Any] = {}
        self.current_field_index = 0
        self.conversation_history: List[Dict] = []
        self.is_active = True
        self.is_emergency = False
        self.created_at = datetime.now()
        self.audio_queue = asyncio.Queue()
        self.collected_data: Dict[str, Any] = {}

    def get_collected_fields(self) -> List[Dict]:
        """Return list of collected fields with their values"""
        result = []
        for field in self.config.fields:
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
        for field in self.config.fields:
            if field["name"] not in self.fields:
                return field
        return None

    def save_field(self, field_name: str, value: str) -> bool:
        """Save a field value"""
        self.fields[field_name] = value
        self.collected_data[field_name] = value
        return True

    def is_complete(self) -> bool:
        """Check if all required fields are collected"""
        required_fields = [f["name"] for f in self.config.fields if f.get("required", False)]
        return all(f in self.fields for f in required_fields)

    def get_completion_percentage(self) -> int:
        """Calculate completion percentage"""
        total = len(self.config.fields)
        if total == 0:
            return 0
        collected = len([f for f in self.config.fields if f["name"] in self.fields])
        return int((collected / total) * 100)


class VoiceConsultationService:
    """
    Service for real-time voice consultation using Gemini Live API
    Based on voicegen reference implementation
    """

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.sessions: Dict[str, ConsultationSession] = {}
        self.configs: Dict[str, ConsultationConfig] = {"default": ConsultationConfig()}

        # Model for live audio - matching voicegen reference
        self.model_id = "gemini-2.5-flash-native-audio-preview-09-2025"

        if GENAI_AVAILABLE and self.api_key:
            self.client = genai.Client(
                api_key=self.api_key,
                http_options={"api_version": "v1alpha"}
            )
        else:
            self.client = None

    # =========================================================================
    # Configuration Management (Admin Features)
    # =========================================================================

    def create_config(self, config: ConsultationConfig) -> ConsultationConfig:
        """Create a new consultation configuration"""
        self.configs[config.config_id] = config
        return config

    def get_config(self, config_id: str = "default") -> Optional[ConsultationConfig]:
        """Get a consultation configuration by ID"""
        return self.configs.get(config_id)

    def update_config(self, config_id: str, updates: Dict) -> Optional[ConsultationConfig]:
        """Update an existing configuration"""
        config = self.configs.get(config_id)
        if config:
            for key, value in updates.items():
                if hasattr(config, key):
                    setattr(config, key, value)
            return config
        return None

    def delete_config(self, config_id: str) -> bool:
        """Delete a configuration (cannot delete default)"""
        if config_id != "default" and config_id in self.configs:
            del self.configs[config_id]
            return True
        return False

    def list_configs(self) -> List[Dict]:
        """List all configurations"""
        return [c.to_dict() for c in self.configs.values()]

    # =========================================================================
    # Session Management
    # =========================================================================

    def create_session(self, session_id: str, config_id: str = "default") -> ConsultationSession:
        """Create a new consultation session with optional config"""
        config = self.configs.get(config_id, self.configs["default"])
        session = ConsultationSession(session_id, config)
        self.sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[ConsultationSession]:
        """Get an existing session"""
        return self.sessions.get(session_id)

    def end_session(self, session_id: str) -> Optional[Dict]:
        """End a consultation session and return collected data"""
        session = self.sessions.get(session_id)
        if session:
            session.is_active = False
            return {
                "session_id": session_id,
                "fields": session.fields,
                "collected_data": session.collected_data,
                "is_emergency": session.is_emergency,
                "conversation_history": session.conversation_history,
                "completion_percentage": session.get_completion_percentage()
            }
        return None

    # =========================================================================
    # Gemini Live API Configuration
    # =========================================================================

    def build_system_instruction(self, session: ConsultationSession) -> str:
        """Build system instruction for the consultation"""
        config = session.config
        fields = config.fields

        # Build field list for system instruction
        field_list = []
        for i, field in enumerate(fields, 1):
            req = "REQUIRED" if field.get("required") else "optional"
            field_list.append(
                f"{i}. {field['name']} ({field['type']}, {req}): {field['prompt']}"
            )

        # Get first question
        first_field = fields[0] if fields else None
        first_prompt = first_field['prompt'] if first_field else "Hello!"

        # Build context from already collected fields
        context = ""
        if session.fields:
            context = "\n\nInformation already collected:\n"
            for name, value in session.fields.items():
                label = next((f["label"] for f in fields if f["name"] == name), name)
                context += f"- {label}: {value}\n"
            context += "\nContinue from where we left off, asking about the next missing field."

        return f"""{config.system_instruction}

AVAILABLE QUESTIONS (use them as guidance, but keep it conversational):
{chr(10).join(field_list)}

START NOW by saying ONLY this opening line:
"{config.ai_prompt} {first_prompt}"

STYLE RULES:
- Keep replies concise
- Be friendly and professional
- Use a warm, reassuring tone
{context}

CRITICAL - REAL-TIME DATA CAPTURE:
- IMMEDIATELY call save_field() after the patient provides ANY piece of information
- Do NOT wait until the end - call save_field() right away for each field
- Example: If patient says "My name is John and I have a headache", call save_field for BOTH pieces immediately
- Call save_field() even for partial or approximate information

COMPLETION RULES (only after ALL information is collected):
- When you have collected all fields, call submit_consultation_summary with:
  {{"summary_text": "<1-2 sentence summary>", "collected_fields": "<JSON of all collected fields>"}}
- After calling submit_consultation_summary, say "{config.success_message}" and call complete_consultation
"""

    def get_tools_config(self, session: ConsultationSession) -> List[Dict]:
        """
        Define function tools for field extraction
        Uses raw dict format matching voicegen reference
        """
        field_names = [f["name"] for f in session.config.fields]

        return [
            {
                "function_declarations": [
                    {
                        "name": "save_field",
                        "description": "IMMEDIATELY save a piece of information as soon as the patient provides it. Call this RIGHT AWAY after hearing any relevant information - do not wait.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "field_name": {
                                    "type": "string",
                                    "enum": field_names,
                                    "description": "The name of the field being saved"
                                },
                                "value": {
                                    "type": "string",
                                    "description": "The value to save"
                                }
                            },
                            "required": ["field_name", "value"]
                        }
                    },
                    {
                        "name": "flag_emergency",
                        "description": "Flag this as an emergency requiring immediate medical attention",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "reason": {
                                    "type": "string",
                                    "description": "The emergency symptoms detected"
                                }
                            },
                            "required": ["reason"]
                        }
                    },
                    {
                        "name": "submit_consultation_summary",
                        "description": "Submit a summary of the consultation with all collected information",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "summary_text": {
                                    "type": "string",
                                    "description": "A brief 1-2 sentence summary of the consultation"
                                },
                                "collected_fields": {
                                    "type": "string",
                                    "description": "JSON string of all collected field values"
                                }
                            },
                            "required": ["summary_text", "collected_fields"]
                        }
                    },
                    {
                        "name": "complete_consultation",
                        "description": "Mark the consultation as completed",
                        "parameters": {
                            "type": "object",
                            "properties": {}
                        }
                    }
                ]
            }
        ]

    def get_session_config(self, session: ConsultationSession) -> Dict:
        """
        Get configuration for Gemini Live session
        Uses raw dict format matching voicegen reference
        """
        system_instruction = self.build_system_instruction(session)

        return {
            "system_instruction": system_instruction,
            "response_modalities": ["AUDIO"],
            "proactivity": {"proactive_audio": True},
            "tools": self.get_tools_config(session),
            "speech_config": {
                "voice_config": {
                    "prebuilt_voice_config": {
                        "voice_name": session.config.voice_name
                    }
                }
            }
        }

    # =========================================================================
    # Audio Processing
    # =========================================================================

    async def process_audio_stream(
        self,
        session: ConsultationSession,
        on_audio: Callable[[bytes], Any],
        on_text: Callable[[str], Any],
        on_field_extracted: Callable[[str, str, str], Any],
        on_emergency: Callable[[str], Any],
        on_progress: Optional[Callable[[int, int], Any]] = None,
        on_complete: Optional[Callable[[Dict], Any]] = None
    ):
        """
        Process the audio stream for a consultation session
        Follows voicegen reference implementation pattern
        """
        if not self.client:
            await on_text("Voice consultation requires the google-genai package with Live API support.")
            return

        config = self.get_session_config(session)

        try:
            async with self.client.aio.live.connect(
                model=self.model_id,
                config=config
            ) as live_session:

                # Initialize queues
                audio_in_queue = asyncio.Queue()  # Gemini -> Browser

                # Create background tasks
                async def send_audio_to_gemini():
                    """Send audio from browser to Gemini"""
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
                                        "mime_type": "audio/pcm"
                                    }
                                )
                        except asyncio.TimeoutError:
                            continue
                        except Exception as e:
                            print(f"Error sending audio: {e}")
                            break

                async def receive_from_gemini():
                    """Receive responses from Gemini (following voicegen pattern)"""
                    print("Starting to receive from Gemini...")
                    while session.is_active:
                        try:
                            turn = live_session.receive()
                            async for response in turn:
                                if not session.is_active:
                                    break

                                # Handle audio data first
                                if data := getattr(response, 'data', None):
                                    await on_audio(data)
                                    continue

                                # Debug: log response structure
                                print(f"Response type: {type(response)}")

                                # Try to extract text from various places (voicegen pattern)
                                text_content = None
                                if text := getattr(response, 'text', None):
                                    text_content = text
                                    print(f"Found text in response.text: {text_content}")

                                # Check server_content (Gemini sends text here in audio mode)
                                if hasattr(response, 'server_content') and response.server_content:
                                    sc = response.server_content
                                    if hasattr(sc, 'model_turn') and sc.model_turn:
                                        mt = sc.model_turn
                                        if hasattr(mt, 'parts') and mt.parts:
                                            for part in mt.parts:
                                                if hasattr(part, 'text') and part.text:
                                                    text_content = part.text
                                                    print(f"Found text in server_content: {text_content}")
                                                    break

                                if text_content:
                                    await on_text(text_content)
                                    session.conversation_history.append({
                                        "role": "assistant",
                                        "content": text_content,
                                        "timestamp": datetime.now().isoformat()
                                    })

                                # Handle tool calls
                                await self._process_tool_calls(
                                    response, session,
                                    on_field_extracted, on_emergency,
                                    on_progress, on_complete
                                )
                        except asyncio.CancelledError:
                            break
                        except Exception as e:
                            print(f"Error receiving from Gemini: {e}")
                            import traceback
                            traceback.print_exc()
                            break

                # Run tasks concurrently
                send_task = asyncio.create_task(send_audio_to_gemini())
                receive_task = asyncio.create_task(receive_from_gemini())

                try:
                    await asyncio.gather(send_task, receive_task)
                except asyncio.CancelledError:
                    pass
                finally:
                    send_task.cancel()
                    receive_task.cancel()

        except Exception as e:
            print(f"Error in audio stream processing: {e}")
            await on_text(f"Connection error: {str(e)}")

    async def _process_tool_calls(
        self,
        response,
        session: ConsultationSession,
        on_field_extracted: Callable,
        on_emergency: Callable,
        on_progress: Optional[Callable],
        on_complete: Optional[Callable]
    ):
        """Process tool calls from Gemini response"""
        calls = self._extract_tool_calls(response)

        if calls:
            print(f"Found {len(calls)} tool call(s): {[c.get('name') for c in calls]}")

        for call in calls:
            name = call.get('name', '').strip()
            args = call.get('args', {})
            print(f"Processing tool call: {name} with args: {args}")

            if name == 'save_field':
                field_name = args.get('field_name') or args.get('fieldName')
                value = args.get('value')

                if field_name and value:
                    session.save_field(field_name, value)
                    label = next(
                        (f["label"] for f in session.config.fields if f["name"] == field_name),
                        field_name
                    )
                    await on_field_extracted(field_name, label, value)

                    if on_progress:
                        await on_progress(
                            len(session.fields),
                            len(session.config.fields)
                        )

            elif name == 'flag_emergency':
                reason = args.get('reason', 'Emergency symptoms detected')
                session.is_emergency = True
                await on_emergency(reason)

            elif name == 'submit_consultation_summary':
                summary_text = args.get('summary_text', '')
                collected_fields_json = args.get('collected_fields', '{}')

                try:
                    parsed_fields = json.loads(collected_fields_json)
                    if isinstance(parsed_fields, dict):
                        session.collected_data.update(parsed_fields)
                        # Send field_extracted events for each field in the summary
                        for field_name, value in parsed_fields.items():
                            if value:
                                session.save_field(field_name, str(value))
                                label = next(
                                    (f["label"] for f in session.config.fields if f["name"] == field_name),
                                    field_name
                                )
                                await on_field_extracted(field_name, label, str(value))
                except json.JSONDecodeError:
                    pass

                session.conversation_history.append({
                    "role": "system",
                    "content": f"Summary submitted: {summary_text}",
                    "timestamp": datetime.now().isoformat()
                })

            elif name == 'complete_consultation':
                if on_complete:
                    await on_complete({
                        "session_id": session.session_id,
                        "fields": session.fields,
                        "collected_data": session.collected_data,
                        "is_emergency": session.is_emergency,
                        "completion_percentage": session.get_completion_percentage()
                    })

    def _extract_tool_calls(self, response) -> List[Dict]:
        """
        Extract tool calls from various SDK response shapes
        Matching voicegen reference implementation
        """
        calls = []

        try:
            # Direct tool_call attribute
            tc = getattr(response, 'tool_call', None)
            if tc:
                fc_list = getattr(tc, 'function_calls', None) or getattr(tc, 'tool_calls', None)
                if fc_list and isinstance(fc_list, (list, tuple)):
                    for fc in fc_list:
                        name = getattr(fc, 'name', None)
                        args = getattr(fc, 'args', None) or {}
                        if name:
                            calls.append({'name': name, 'args': args if isinstance(args, dict) else {}})
                else:
                    name = getattr(tc, 'name', None)
                    args = getattr(tc, 'args', None) or {}
                    if name:
                        calls.append({'name': name, 'args': args if isinstance(args, dict) else {}})

            # Plural attributes on response
            for attr in ('function_calls', 'tool_calls'):
                fc_list = getattr(response, attr, None)
                if fc_list and isinstance(fc_list, (list, tuple)):
                    for fc in fc_list:
                        name = getattr(fc, 'name', None)
                        args = getattr(fc, 'args', None) or {}
                        if name:
                            calls.append({'name': name, 'args': args if isinstance(args, dict) else {}})

            # server_content.model_turn.parts nested calls
            sc = getattr(response, 'server_content', None)
            if sc and hasattr(sc, 'model_turn') and getattr(sc.model_turn, 'parts', None):
                for part in sc.model_turn.parts:
                    for cand_attr in ('function_call', 'tool_call'):
                        fc = getattr(part, cand_attr, None)
                        if fc:
                            name = getattr(fc, 'name', None)
                            args = getattr(fc, 'args', None) or {}
                            if name:
                                calls.append({'name': name, 'args': args if isinstance(args, dict) else {}})

        except Exception as e:
            print(f"Error extracting tool calls: {e}")

        return calls

    async def send_audio(self, session_id: str, audio_data: bytes):
        """Queue audio data to be sent to Gemini"""
        session = self.get_session(session_id)
        if session and session.is_active:
            await session.audio_queue.put(audio_data)

    # =========================================================================
    # Summary Generation
    # =========================================================================

    def generate_summary(self, session_id: str) -> str:
        """Generate a formatted summary of the consultation"""
        session = self.sessions.get(session_id)
        if not session:
            return "Session not found"

        summary = f"""
╔══════════════════════════════════════════════════════════════╗
║                    CONSULTATION SUMMARY                       ║
║                      {session.config.name:^30}                ║
╠══════════════════════════════════════════════════════════════╣

Date: {session.created_at.strftime("%B %d, %Y at %I:%M %p")}
Session ID: {session_id}
Completion: {session.get_completion_percentage()}%

──────────────────────────────────────────────────────────────
                      PATIENT INFORMATION
──────────────────────────────────────────────────────────────
"""

        for field in session.config.fields:
            if field["name"] in session.fields:
                summary += f"\n{field['label']}:\n    {session.fields[field['name']]}\n"

        if session.is_emergency:
            summary += f"""
══════════════════════════════════════════════════════════════
⚠️  EMERGENCY FLAG: {session.config.emergency_message}
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

# Backwards compatibility alias
CONSULTATION_FIELDS = DEFAULT_CONSULTATION_FIELDS
