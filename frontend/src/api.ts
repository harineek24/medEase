// API configuration for MedEase
// Uses environment variable if set, otherwise defaults to relative URLs
// (handled by Vite dev proxy in development, Vercel rewrites in production)

export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const WS_BASE_URL = import.meta.env.VITE_WS_URL ||
  (API_BASE_URL
    ? API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://')
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`);

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
