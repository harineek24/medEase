// API configuration for MedEase
// In development, Vite proxy forwards /api to localhost:8000 (see vite.config.ts)
// In production, Vercel rewrites /api to the Render backend (see vercel.json)
// Only set VITE_API_URL if you need to bypass the proxy/rewrite (e.g. direct backend access)

export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// WebSocket requires absolute URLs. When API_BASE_URL is relative (empty),
// derive from window.location so Vite proxy handles it in dev.
// In production on Vercel, set VITE_WS_URL to point directly to the backend
// since Vercel does not support WebSocket proxying.
export const WS_BASE_URL = import.meta.env.VITE_WS_URL ||
  (API_BASE_URL
    ? API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://')
    : (typeof window !== 'undefined'
        ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
        : ''));

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
