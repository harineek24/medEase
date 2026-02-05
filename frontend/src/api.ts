// API configuration for MedEase
// Uses environment variable in production, localhost in development

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const WS_BASE_URL = import.meta.env.VITE_WS_URL ||
  (API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://'));

// API endpoints
export const endpoints = {
  // Health check
  health: () => `${API_BASE_URL}/`,

  // EHR Summarization
  summarize: () => `${API_BASE_URL}/api/summarize`,
  extractMedications: () => `${API_BASE_URL}/api/extract-medications`,
  extractPatientOverview: () => `${API_BASE_URL}/api/extract-patient-overview`,
  extractTestResults: () => `${API_BASE_URL}/api/extract-test-results`,
  medicationDetails: () => `${API_BASE_URL}/api/medication-details`,
  analyzeMedications: () => `${API_BASE_URL}/api/analyze-medications`,
  saveSummary: () => `${API_BASE_URL}/api/save-summary`,

  // Dashboard & History
  dashboardStats: () => `${API_BASE_URL}/api/dashboard/stats`,
  recentSummaries: () => `${API_BASE_URL}/api/dashboard/recent-summaries`,
  recentConsultations: () => `${API_BASE_URL}/api/dashboard/recent-consultations`,
  summaries: () => `${API_BASE_URL}/api/summaries`,
  summaryById: (id: string) => `${API_BASE_URL}/api/summaries/${id}`,
  consultations: () => `${API_BASE_URL}/api/consultations`,
  consultationById: (id: string) => `${API_BASE_URL}/api/consultations/${id}`,

  // Chat
  chat: () => `${API_BASE_URL}/api/chat`,
  patientChat: () => `${API_BASE_URL}/api/patient-chat`,

  // Voice Consultation
  voiceConfig: () => `${API_BASE_URL}/api/voice/config`,
  voiceSession: (sessionId: string) => `${WS_BASE_URL}/ws/voice/${sessionId}`,
  consultationSessions: () => `${API_BASE_URL}/api/consultation-sessions`,
  consultationSession: (id: string) => `${API_BASE_URL}/api/consultation-sessions/${id}`,
};

export default endpoints;
