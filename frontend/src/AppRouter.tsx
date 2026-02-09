import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import LoginPage from '@/components/LoginPage'
import DoctorLayout from '@/layouts/DoctorLayout'
import ClinicAdminLayout from '@/layouts/ClinicAdminLayout'
import PatientLayout from '@/layouts/PatientLayout'
import ConsultConfig from '@/components/ConsultConfig'
import DoctorHistory from '@/components/doctor/DoctorHistory'
import DoctorCalendar from '@/components/doctor/DoctorCalendar'
import DoctorFeed from '@/components/doctor/DoctorFeed'
import DoctorReplyPage from '@/components/doctor/DoctorReplyPage'
import AdminPatientRegistration from '@/components/clinicadmin/AdminPatientRegistration'
import AdminDoctorManagement from '@/components/clinicadmin/AdminDoctorManagement'
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
        <Route index element={<Navigate to="patients" replace />} />
        <Route path="patients" element={<AdminPatientRegistration />} />
        <Route path="doctors" element={<AdminDoctorManagement />} />
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
        <Route path="history" element={<DoctorHistory />} />
        <Route path="calendar" element={<DoctorCalendar />} />
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
