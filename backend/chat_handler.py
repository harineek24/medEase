"""
MedEase AI Chat Handler
Handles both patient-specific chats (about their summary) and general chats (across all data).
Uses Google Gemini API for intelligent responses.
"""

import os
import json
from typing import Optional, List, Dict, Any
from datetime import datetime
import google.generativeai as genai
from dotenv import load_dotenv

import database as db

# Load environment variables
load_dotenv()

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Model configuration
MODEL_NAME = "gemini-2.0-flash"


def get_model():
    """Get the Gemini model instance."""
    return genai.GenerativeModel(MODEL_NAME)


# =============================================================================
# Patient-Specific Chat (For individual summary context)
# =============================================================================

PATIENT_CHAT_SYSTEM_PROMPT = """You are MedAssist, a friendly and knowledgeable medical assistant AI integrated into the MedEase healthcare platform. You are helping a patient understand their specific medical record.

IMPORTANT GUIDELINES:
1. You have access to this patient's specific medical summary, medications, and test results
2. Explain medical terms in simple, easy-to-understand language
3. Be empathetic and supportive in your responses
4. Always remind users to consult their healthcare provider for medical decisions
5. If asked about something not in the patient's record, say so clearly
6. Focus on education and understanding, not diagnosis or treatment recommendations
7. Keep responses concise but thorough
8. Use bullet points for clarity when listing information

CONTEXT - This patient's medical information:
{patient_context}

Remember: You are discussing THIS SPECIFIC patient's information. Stay focused on their data."""


def build_patient_context(summary_data: Dict, medications: List[Dict], test_results: List[Dict], interactions: List[Dict]) -> str:
    """Build context string from patient data."""
    context_parts = []

    # Summary info
    if summary_data:
        context_parts.append(f"**Patient Summary:**\n{summary_data.get('raw_summary', 'No summary available')}")

        if summary_data.get('diagnosis'):
            context_parts.append(f"\n**Diagnosis:** {summary_data['diagnosis']}")

        if summary_data.get('visit_date'):
            context_parts.append(f"**Visit Date:** {summary_data['visit_date']}")

        if summary_data.get('next_steps'):
            context_parts.append(f"**Next Steps:** {summary_data['next_steps']}")

        if summary_data.get('warning_signs'):
            context_parts.append(f"**Warning Signs:** {summary_data['warning_signs']}")

    # Medications
    if medications:
        med_list = []
        for med in medications:
            med_str = f"- {med['name']}"
            if med.get('dosage'):
                med_str += f" ({med['dosage']})"
            if med.get('frequency'):
                med_str += f" - {med['frequency']}"
            if med.get('purpose'):
                med_str += f" - for {med['purpose']}"
            med_list.append(med_str)
        context_parts.append(f"\n**Medications:**\n" + "\n".join(med_list))

    # Test results
    if test_results:
        test_list = []
        for test in test_results:
            test_str = f"- {test['test_name']}: {test.get('value', 'N/A')}"
            if test.get('unit'):
                test_str += f" {test['unit']}"
            if test.get('status'):
                status_emoji = "✓" if test['status'].lower() == 'normal' else "⚠️"
                test_str += f" ({status_emoji} {test['status']})"
            test_list.append(test_str)
        context_parts.append(f"\n**Test Results:**\n" + "\n".join(test_list))

    # Drug interactions
    if interactions:
        int_list = []
        for interaction in interactions:
            severity_emoji = {"severe": "🔴", "moderate": "🟡", "mild": "🟢"}.get(
                interaction.get('severity', '').lower(), "⚪"
            )
            int_str = f"- {severity_emoji} {interaction['drug1']} + {interaction['drug2']}"
            if interaction.get('description'):
                int_str += f": {interaction['description']}"
            int_list.append(int_str)
        context_parts.append(f"\n**Drug Interactions Found:**\n" + "\n".join(int_list))

    return "\n".join(context_parts) if context_parts else "No patient data available."


async def patient_chat(
    message: str,
    session_id: str,
    summary_id: int,
    summary_text: str,
    medications: List[Dict] = None,
    test_results: List[Dict] = None,
    interactions: List[Dict] = None,
    patient_id: Optional[int] = None
) -> str:
    """
    Handle patient-specific chat about their medical summary.

    Args:
        message: User's question
        session_id: Unique session identifier
        summary_id: ID of the summary being discussed
        summary_text: The raw summary text
        medications: List of medications from the summary
        test_results: List of test results from the summary
        interactions: List of drug interactions found
        patient_id: Optional patient ID for database storage

    Returns:
        AI response string
    """
    try:
        # Build context from provided data
        summary_data = {"raw_summary": summary_text}
        patient_context = build_patient_context(
            summary_data,
            medications or [],
            test_results or [],
            interactions or []
        )

        # Build system prompt with context
        system_prompt = PATIENT_CHAT_SYSTEM_PROMPT.format(patient_context=patient_context)

        # Get chat history for context
        chat_history = db.get_chat_history(session_id, limit=10)

        # Build conversation messages
        messages = [{"role": "user", "parts": [system_prompt + "\n\nPlease acknowledge you understand the context."]}]
        messages.append({"role": "model", "parts": ["I understand. I have access to this patient's medical summary, medications, test results, and any drug interactions found. I'm ready to help explain and answer questions about this specific medical record. How can I help you understand your health information better?"]})

        # Add history
        for msg in chat_history:
            role = "user" if msg['role'] == 'user' else "model"
            messages.append({"role": role, "parts": [msg['content']]})

        # Add current message
        messages.append({"role": "user", "parts": [message]})

        # Generate response
        model = get_model()
        response = model.generate_content(messages)

        assistant_response = response.text

        # Save messages to database
        db.save_chat_message(session_id, "patient", "user", message, patient_id, summary_id)
        db.save_chat_message(session_id, "patient", "assistant", assistant_response, patient_id, summary_id)

        return assistant_response

    except Exception as e:
        error_msg = f"I apologize, but I encountered an error: {str(e)}. Please try again."
        return error_msg


# =============================================================================
# General Chat (For searching across all patients and general health questions)
# =============================================================================

GENERAL_CHAT_SYSTEM_PROMPT = """You are MedAssist, a friendly and knowledgeable medical assistant AI integrated into the MedEase healthcare platform. You help users with general health questions and can search across patient records.

IMPORTANT GUIDELINES:
1. You can help with general health education questions
2. You can search and provide information about patients in the system
3. Explain medical terms in simple, easy-to-understand language
4. Always remind users to consult healthcare providers for medical decisions
5. Be helpful but maintain patient privacy - only share data that's in the system
6. Keep responses concise but thorough
7. Use bullet points and formatting for clarity

CURRENT DATABASE STATISTICS:
{db_stats}

AVAILABLE PATIENT DATA:
{patient_data}

You can help users:
- Search for specific patients
- Compare medications across patients
- Understand drug interactions in general
- Answer general health education questions
- Provide summaries of patient records
- Identify trends across the data"""


def build_general_context() -> tuple:
    """Build context for general chat from database."""
    # Get stats
    stats = db.get_dashboard_stats()
    stats_str = f"""
- Total Patients: {stats['total_patients']}
- Total Summaries: {stats['total_summaries']}
- Total Medications Tracked: {stats['total_medications']}
- Drug Interactions Found: {stats['total_interactions']}
- High Risk Cases: {stats['high_risk_cases']}
"""

    # Get patient list with summaries
    patients = db.get_all_patients()
    patient_data_parts = []

    for patient in patients[:20]:  # Limit to 20 patients for context
        patient_info = f"\n**{patient['name']}** (ID: {patient['id']})"
        summaries = db.get_patient_summaries(patient['id'])

        if summaries:
            for s in summaries[:3]:  # Limit to 3 summaries per patient
                summary_brief = s.get('diagnosis', 'No diagnosis')[:100]
                patient_info += f"\n  - Summary {s['id']} ({s.get('created_at', 'Unknown date')}): {summary_brief}"

        patient_data_parts.append(patient_info)

    patient_data = "\n".join(patient_data_parts) if patient_data_parts else "No patients in database yet."

    return stats_str, patient_data


async def general_chat(
    message: str,
    session_id: str
) -> str:
    """
    Handle general chat for searching across patients and health questions.

    Args:
        message: User's question
        session_id: Unique session identifier

    Returns:
        AI response string
    """
    try:
        # Build context from database
        db_stats, patient_data = build_general_context()

        # Build system prompt with context
        system_prompt = GENERAL_CHAT_SYSTEM_PROMPT.format(
            db_stats=db_stats,
            patient_data=patient_data
        )

        # Get chat history
        chat_history = db.get_chat_history(session_id, limit=10)

        # Build conversation messages
        messages = [{"role": "user", "parts": [system_prompt + "\n\nPlease acknowledge you understand your role."]}]
        messages.append({"role": "model", "parts": ["I'm MedAssist, your medical information assistant. I can help you search patient records, understand medications and interactions, and answer general health questions. I have access to the MedEase database and can provide information about patients, their summaries, medications, and test results. How can I help you today?"]})

        # Add history
        for msg in chat_history:
            role = "user" if msg['role'] == 'user' else "model"
            messages.append({"role": role, "parts": [msg['content']]})

        # Add current message
        messages.append({"role": "user", "parts": [message]})

        # Generate response
        model = get_model()
        response = model.generate_content(messages)

        assistant_response = response.text

        # Save messages to database
        db.save_chat_message(session_id, "general", "user", message)
        db.save_chat_message(session_id, "general", "assistant", assistant_response)

        return assistant_response

    except Exception as e:
        error_msg = f"I apologize, but I encountered an error: {str(e)}. Please try again."
        return error_msg


# =============================================================================
# Quick Responses (For common questions without full AI call)
# =============================================================================

QUICK_RESPONSES = {
    "hello": "Hello! I'm MedAssist, your medical information assistant. How can I help you today?",
    "hi": "Hi there! I'm MedAssist. I can help you understand your medical records, medications, and test results. What would you like to know?",
    "help": """I can help you with:
• Understanding your medical summary
• Explaining medications and their purposes
• Clarifying test results and what they mean
• Discussing potential drug interactions
• Answering general health questions

Just ask me anything about your health information!""",
    "thanks": "You're welcome! Remember to always discuss any health concerns with your healthcare provider. Is there anything else I can help you with?",
    "thank you": "You're welcome! Feel free to ask if you have any more questions about your health information.",
}


def check_quick_response(message: str) -> Optional[str]:
    """Check if message has a quick response available."""
    message_lower = message.lower().strip()
    for key, response in QUICK_RESPONSES.items():
        if message_lower == key or message_lower.startswith(key + " ") or message_lower.endswith(" " + key):
            return response
    return None


# =============================================================================
# Live Doctor Consultation (AI Doctor Robot)
# =============================================================================

DOCTOR_CONSULTATION_PROMPT = """You are Dr. MedAssist, an AI physician assistant conducting a virtual medical consultation. You have a warm, professional bedside manner and extensive medical knowledge.

YOUR ROLE:
- You are conducting a structured medical consultation
- Be thorough but compassionate
- Ask relevant follow-up questions to understand the patient's concerns
- Provide educational information about conditions and treatments
- Always recommend seeing a real healthcare provider for proper diagnosis and treatment

CONSULTATION STRUCTURE:
1. **Greeting & Intake**: Welcome the patient, ask their main concern
2. **History Taking**: Ask about symptoms, duration, severity, related factors
3. **Lifestyle & Background**: Relevant medical history, medications, allergies
4. **Assessment**: Provide educational information about possible causes
5. **Recommendations**: Suggest next steps, when to seek immediate care

IMPORTANT GUIDELINES:
- Never provide definitive diagnoses - use phrases like "this could be consistent with" or "possible causes include"
- Always recommend professional medical evaluation for serious symptoms
- Be empathetic and reassuring while being medically accurate
- Use simple language, avoid excessive jargon
- If emergency symptoms are mentioned (chest pain, difficulty breathing, severe bleeding, etc.), immediately advise calling emergency services
- Reference the patient's medical history if available

{patient_history}

CURRENT CONSULTATION STAGE: {stage}
- If "intake": Focus on understanding their main concern
- If "history": Ask detailed questions about symptoms
- If "assessment": Provide educational information
- If "recommendations": Give actionable next steps

Remember: You are an AI assistant, not a replacement for real medical care. Always be clear about this limitation."""

CONSULTATION_STAGES = ["intake", "history", "assessment", "recommendations"]


def get_patient_history_context(patient_id: Optional[int] = None) -> str:
    """Get patient's medical history from database if available."""
    if not patient_id:
        return "PATIENT HISTORY: No previous records available for this patient."

    try:
        patient = db.get_patient(patient_id)
        if not patient:
            return "PATIENT HISTORY: No previous records available for this patient."

        summaries = db.get_patient_summaries(patient_id)
        if not summaries:
            return f"PATIENT HISTORY: Patient {patient.get('name', 'Unknown')} - No previous medical summaries."

        history_parts = [f"PATIENT HISTORY for {patient.get('name', 'Unknown')}:"]

        for summary in summaries[:5]:  # Last 5 summaries
            history_parts.append(f"\n**Previous Visit ({summary.get('visit_date', 'Unknown date')}):**")
            if summary.get('diagnosis'):
                history_parts.append(f"- Diagnosis: {summary['diagnosis']}")

            # Get medications for this summary
            full_summary = db.get_summary(summary['id'])
            if full_summary and full_summary.get('medications'):
                meds = [m['name'] for m in full_summary['medications'][:5]]
                history_parts.append(f"- Medications: {', '.join(meds)}")

        return "\n".join(history_parts)
    except Exception:
        return "PATIENT HISTORY: Unable to retrieve patient history."


def determine_consultation_stage(messages: List[Dict]) -> str:
    """Determine the current stage of consultation based on message count."""
    msg_count = len(messages)
    if msg_count <= 2:
        return "intake"
    elif msg_count <= 6:
        return "history"
    elif msg_count <= 10:
        return "assessment"
    else:
        return "recommendations"


async def doctor_consultation(
    message: str,
    session_id: str,
    patient_id: Optional[int] = None,
    patient_name: Optional[str] = None,
    chief_complaint: Optional[str] = None
) -> Dict[str, Any]:
    """
    Handle a live doctor consultation session.

    Args:
        message: Patient's message
        session_id: Unique consultation session ID
        patient_id: Optional patient ID to pull history
        patient_name: Patient's name for personalization
        chief_complaint: The main reason for consultation

    Returns:
        Dict with response, stage, and any recommendations
    """
    try:
        # Get patient history context
        patient_history = get_patient_history_context(patient_id)

        # Get consultation history
        chat_history = db.get_chat_history(session_id, limit=20)

        # Determine current stage
        stage = determine_consultation_stage(chat_history)

        # Build the system prompt
        system_prompt = DOCTOR_CONSULTATION_PROMPT.format(
            patient_history=patient_history,
            stage=stage
        )

        # Build conversation
        greeting = f"Hello{' ' + patient_name if patient_name else ''}! I'm Dr. MedAssist, your AI physician assistant. I'm here to help you understand your health concerns and guide you on next steps.\n\n"

        if chief_complaint:
            greeting += f"I understand you're here about: **{chief_complaint}**\n\n"

        greeting += "Please remember that while I can provide helpful medical information and guidance, I'm an AI assistant and cannot replace a proper examination by a healthcare professional.\n\nHow can I help you today? Please describe what's been bothering you."

        messages = [
            {"role": "user", "parts": [system_prompt]},
            {"role": "model", "parts": [greeting]}
        ]

        # Add conversation history
        for msg in chat_history:
            role = "user" if msg['role'] == 'user' else "model"
            messages.append({"role": role, "parts": [msg['content']]})

        # Add current message
        messages.append({"role": "user", "parts": [message]})

        # Check for emergency keywords
        emergency_keywords = ['chest pain', 'can\'t breathe', 'difficulty breathing', 'severe bleeding',
                            'unconscious', 'stroke', 'heart attack', 'suicide', 'overdose', 'poisoning']
        is_emergency = any(keyword in message.lower() for keyword in emergency_keywords)

        # Generate response
        model = get_model()
        response = model.generate_content(messages)

        doctor_response = response.text

        # Add emergency warning if needed
        if is_emergency:
            doctor_response = "🚨 **IMPORTANT**: Based on what you've described, this could be a medical emergency. Please call emergency services (911) or go to the nearest emergency room immediately.\n\n" + doctor_response

        # Save to database
        db.save_chat_message(session_id, "consultation", "user", message, patient_id)
        db.save_chat_message(session_id, "consultation", "assistant", doctor_response, patient_id)

        # Determine if we should suggest ending consultation
        should_end = len(chat_history) >= 14  # After ~7 exchanges

        return {
            "response": doctor_response,
            "stage": stage,
            "is_emergency": is_emergency,
            "should_summarize": should_end,
            "message_count": len(chat_history) + 1
        }

    except Exception as e:
        return {
            "response": f"I apologize, but I encountered a technical issue: {str(e)}. Please try again or consult with a healthcare provider directly.",
            "stage": "error",
            "is_emergency": False,
            "should_summarize": False,
            "message_count": 0
        }


async def generate_consultation_summary(session_id: str) -> str:
    """Generate a summary of the consultation that can be saved or printed."""
    try:
        chat_history = db.get_chat_history(session_id, limit=50)

        if not chat_history:
            return "No consultation data available."

        # Build conversation text
        conversation = []
        for msg in chat_history:
            role = "Patient" if msg['role'] == 'user' else "Dr. MedAssist"
            conversation.append(f"**{role}**: {msg['content']}")

        conversation_text = "\n\n".join(conversation)

        # Ask AI to summarize
        summary_prompt = f"""Please provide a professional medical consultation summary based on this conversation:

{conversation_text}

Format the summary as:

## Consultation Summary

**Date**: {datetime.now().strftime('%B %d, %Y')}

### Chief Complaint
[Main reason for consultation]

### Symptoms Discussed
[List of symptoms mentioned]

### Key Points from Discussion
[Important medical information discussed]

### Recommendations Given
[Advice and next steps suggested]

### Follow-up Actions
[What the patient should do next]

---
*This summary was generated by Dr. MedAssist AI. It is for informational purposes only and does not constitute medical advice. Please consult with a healthcare professional for proper diagnosis and treatment.*
"""

        model = get_model()
        response = model.generate_content(summary_prompt)

        return response.text

    except Exception as e:
        return f"Unable to generate summary: {str(e)}"
