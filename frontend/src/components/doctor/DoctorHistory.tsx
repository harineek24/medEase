import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../api'
import HealthHistory from '../patient/HealthHistory'
import {
  ChevronLeft,
  User,
  Calendar,
  Clock,
  Search,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────
interface Patient {
  id: number
  name: string
  date_of_birth?: string
  gender?: string
  email?: string
  phone?: string
  last_visit?: string
  summary_count?: number
  active_prescriptions?: number
}

interface Appointment {
  id: number
  patient_id: number
  appointment_date: string
  status: string
  reason?: string
  service_name?: string
}

interface PatientWithAppointment extends Patient {
  upcoming_appointment?: Appointment | null
  last_appointment?: Appointment | null
  has_upcoming: boolean
}

// ─── Component ─────────────────────────────────────────────────────────
export default function DoctorHistory() {
  const [patients, setPatients] = useState<PatientWithAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPatient, setSelectedPatient] = useState<PatientWithAppointment | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchPatients = useCallback(async () => {
    try {
      // Fetch all patients and appointments
      const [patientsRes, appointmentsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/patients`),
        fetch(`${API_BASE_URL}/api/appointments`),
      ])

      const patientsData = patientsRes.ok ? await patientsRes.json() : []
      const appointmentsData = appointmentsRes.ok ? await appointmentsRes.json() : []

      const patientList: Patient[] = Array.isArray(patientsData) ? patientsData : (patientsData.patients || [])
      const appointmentList: Appointment[] = Array.isArray(appointmentsData) ? appointmentsData : (appointmentsData.appointments || [])

      const now = new Date()

      // Map appointments to patients
      const enriched: PatientWithAppointment[] = patientList.map(p => {
        const patientAppts = appointmentList.filter(a => a.patient_id === p.id)

        const upcoming = patientAppts
          .filter(a => new Date(a.appointment_date) >= now && a.status === 'scheduled')
          .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())[0] || null

        const last = patientAppts
          .filter(a => new Date(a.appointment_date) < now || a.status === 'completed')
          .sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime())[0] || null

        return {
          ...p,
          upcoming_appointment: upcoming,
          last_appointment: last,
          has_upcoming: !!upcoming,
        }
      })

      // Sort: patients with upcoming appointments first (by soonest), then others
      enriched.sort((a, b) => {
        if (a.has_upcoming && !b.has_upcoming) return -1
        if (!a.has_upcoming && b.has_upcoming) return 1
        if (a.has_upcoming && b.has_upcoming) {
          return new Date(a.upcoming_appointment!.appointment_date).getTime() -
                 new Date(b.upcoming_appointment!.appointment_date).getTime()
        }
        // Both without upcoming — sort by last appointment (most recent first)
        if (a.last_appointment && b.last_appointment) {
          return new Date(b.last_appointment.appointment_date).getTime() -
                 new Date(a.last_appointment.appointment_date).getTime()
        }
        return (a.name || '').localeCompare(b.name || '')
      })

      setPatients(enriched)
    } catch (err) {
      console.error('Error fetching patients:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPatients() }, [fetchPatients])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const isToday = (dateStr: string) => {
    const d = new Date(dateStr)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }

  const filteredPatients = searchQuery
    ? patients.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : patients

  // ─── Detail View: show HealthHistory for selected patient ────────────
  if (selectedPatient) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-6 py-4">
          <button
            onClick={() => setSelectedPatient(null)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-3"
          >
            <ChevronLeft className="w-4 h-4" /> Back to patients
          </button>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#45BFD3]/10 flex items-center justify-center">
              <User className="w-6 h-6 text-[#45BFD3]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{selectedPatient.name}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-500 mt-0.5">
                {selectedPatient.gender && <span>{selectedPatient.gender}</span>}
                {selectedPatient.date_of_birth && <span>DOB: {selectedPatient.date_of_birth}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <HealthHistory onNavigate={() => {}} patientId={selectedPatient.id} />
        </div>
      </div>
    )
  }

  // ─── Patient List View ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#45BFD3] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading patients...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Patient History</h1>
        <p className="text-gray-500 text-sm">Select a patient to view their health records</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search patients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/30 focus:border-[#45BFD3]"
        />
      </div>

      {filteredPatients.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <User className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No patients found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPatients.map(patient => (
            <button
              key={patient.id}
              onClick={() => setSelectedPatient(patient)}
              className="w-full text-left bg-white rounded-2xl border border-gray-100 p-5 hover:border-[#45BFD3]/40 hover:shadow-md transition-all group"
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-[#45BFD3]/10 flex items-center justify-center shrink-0 group-hover:bg-[#45BFD3]/20 transition">
                  <User className="w-5 h-5 text-[#45BFD3]" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-[#45BFD3] transition">
                      {patient.name || 'Unknown Patient'}
                    </h3>
                    {patient.has_upcoming && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#45BFD3]/10 text-[#45BFD3]">
                        <Calendar className="w-3 h-3" />
                        Upcoming
                      </span>
                    )}
                  </div>

                  {/* Upcoming appointment */}
                  {patient.upcoming_appointment && (
                    <div className={`flex items-center gap-2 text-sm mb-1 ${
                      isToday(patient.upcoming_appointment.appointment_date)
                        ? 'text-[#45BFD3] font-medium'
                        : 'text-gray-600'
                    }`}>
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {isToday(patient.upcoming_appointment.appointment_date)
                          ? `Today at ${formatTime(patient.upcoming_appointment.appointment_date)}`
                          : formatDate(patient.upcoming_appointment.appointment_date)
                        }
                      </span>
                      {patient.upcoming_appointment.reason && (
                        <span className="text-gray-400">— {patient.upcoming_appointment.reason}</span>
                      )}
                    </div>
                  )}

                  {/* Last appointment */}
                  {patient.last_appointment && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>Last visit: {formatDate(patient.last_appointment.appointment_date)}</span>
                    </div>
                  )}

                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
