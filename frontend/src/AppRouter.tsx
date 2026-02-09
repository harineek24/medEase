import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import LoginPage from '@/components/LoginPage'
import DoctorLayout from '@/layouts/DoctorLayout'
import ClinicAdminLayout from '@/layouts/ClinicAdminLayout'
import PatientLayout from '@/layouts/PatientLayout'
import Dashboard from '@/components/Dashboard'
import ConsultConfig from '@/components/ConsultConfig'
import DoctorHistory from '@/components/doctor/DoctorHistory'
import DoctorCalendar from '@/components/doctor/DoctorCalendar'
import DoctorFeed from '@/components/doctor/DoctorFeed'
import DoctorReplyPage from '@/components/doctor/DoctorReplyPage'
import AdminPatientRegistration from '@/components/clinicadmin/AdminPatientRegistration'
import AdminDoctorManagement from '@/components/clinicadmin/AdminDoctorManagement'
import { Clock } from 'lucide-react'
import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/*  Protected Route Wrapper                                            */
/* ------------------------------------------------------------------ */

interface ProtectedRouteProps {
  requiredRole: 'clinicadmin' | 'doctor' | 'patient'
  children: ReactNode
}

function ProtectedRoute({ requiredRole, children }: ProtectedRouteProps) {
  const { isAuthenticated, role } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  if (role !== requiredRole) {
    // Redirect to the user's actual portal if they try accessing the wrong one
    return <Navigate to={`/${role}`} replace />
  }

  return <>{children}</>
}

/* ------------------------------------------------------------------ */
/*  Placeholder pages for sub-routes (to be built out later)           */
/* ------------------------------------------------------------------ */

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-[#45BFD3]/10 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-6 h-6 text-[#45BFD3]" />
        </div>
        <h2 className="text-2xl font-light text-gray-900 mb-1">{title}</h2>
        <p className="text-gray-400 text-sm">Coming soon</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  App Router                                                         */
/* ------------------------------------------------------------------ */

export default function AppRouter() {
  return (
    <Routes>
      {/* Public route */}
      <Route path="/" element={<LoginPage />} />

      {/* ---- Clinic Admin Portal ---- */}
      <Route
        path="/clinicadmin"
        element={
          <ProtectedRoute requiredRole="clinicadmin">
            <ClinicAdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<PlaceholderPage title="Admin Dashboard" />} />
        <Route path="patients" element={<AdminPatientRegistration />} />
        <Route path="doctors" element={<AdminDoctorManagement />} />
        <Route path="appointments" element={<PlaceholderPage title="Appointments" />} />
        <Route path="billing" element={<PlaceholderPage title="Billing" />} />
        <Route path="insurance" element={<PlaceholderPage title="Insurance" />} />
        <Route path="notes" element={<PlaceholderPage title="Patient Notes" />} />
        <Route path="settings" element={<PlaceholderPage title="Settings" />} />
      </Route>

      {/* ---- Doctor Portal ---- */}
      <Route
        path="/doctor"
        element={
          <ProtectedRoute requiredRole="doctor">
            <DoctorLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DoctorFeed />} />
        <Route path="reply/:updateId" element={<DoctorReplyPage />} />
        <Route path="dashboard" element={<Dashboard onViewHistory={() => {}} />} />
        <Route path="patients" element={<PlaceholderPage title="Patients" />} />
        <Route path="history" element={<DoctorHistory />} />
        <Route path="appointments" element={<PlaceholderPage title="Appointments" />} />
        <Route path="calendar" element={<DoctorCalendar />} />
        <Route path="notes" element={<PlaceholderPage title="Notes" />} />
        <Route path="consultconfig" element={<ConsultConfig />} />
      </Route>

      {/* ---- Patient Portal ---- */}
      <Route
        path="/patient/*"
        element={
          <ProtectedRoute requiredRole="patient">
            <PatientLayout />
          </ProtectedRoute>
        }
      />

      {/* Catch-all: redirect to login */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
