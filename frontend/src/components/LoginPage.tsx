import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  Stethoscope,
  User,
  LogIn,
  ChevronRight,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { API_BASE_URL } from '@/api'

type RoleCard = 'clinicadmin' | 'doctor' | 'patient'

interface DoctorOption {
  id: number
  name: string
  specialty: string
}

interface PatientOption {
  id: number
  name: string
  email?: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, isAuthenticated, role } = useAuth()

  const [selectedRole, setSelectedRole] = useState<RoleCard | null>(null)

  // Admin form state
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)

  // Doctor selection state
  const [doctors, setDoctors] = useState<DoctorOption[]>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null)
  const [doctorsLoading, setDoctorsLoading] = useState(false)
  const [doctorsError, setDoctorsError] = useState('')

  // Patient selection state
  const [patients, setPatients] = useState<PatientOption[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null)
  const [patientsLoading, setPatientsLoading] = useState(false)
  const [patientsError, setPatientsError] = useState('')

  // If already authenticated, redirect to appropriate portal
  useEffect(() => {
    if (isAuthenticated && role) {
      navigate(`/${role}`)
    }
  }, [isAuthenticated, role, navigate])

  // Fetch doctors when doctor card is selected
  useEffect(() => {
    if (selectedRole === 'doctor') {
      setDoctorsLoading(true)
      setDoctorsError('')
      fetch(`${API_BASE_URL}/api/doctors`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch doctors')
          return res.json()
        })
        .then((data) => {
          setDoctors(Array.isArray(data) ? data : data.doctors || [])
        })
        .catch(() => {
          setDoctorsError('Could not load doctors. Please try again.')
        })
        .finally(() => setDoctorsLoading(false))
    }
  }, [selectedRole])

  // Fetch patients when patient card is selected
  useEffect(() => {
    if (selectedRole === 'patient') {
      setPatientsLoading(true)
      setPatientsError('')
      fetch(`${API_BASE_URL}/api/patients`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch patients')
          return res.json()
        })
        .then((data) => {
          setPatients(Array.isArray(data) ? data : data.patients || [])
        })
        .catch(() => {
          setPatientsError('Could not load patients. Please try again.')
        })
        .finally(() => setPatientsLoading(false))
    }
  }, [selectedRole])

  // Admin login handler
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminError('')
    setAdminLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || 'Invalid credentials')
      }

      const data = await response.json()
      login({
        role: 'clinicadmin',
        user: data.user || { username: adminUsername },
        clinicId: data.clinic_id || 1,
      })
      navigate('/clinicadmin')
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setAdminLoading(false)
    }
  }

  // Doctor enter handler
  const handleDoctorEnter = () => {
    const doctor = doctors.find((d) => d.id === selectedDoctorId)
    if (!doctor) return

    login({
      role: 'doctor',
      user: doctor,
      doctorId: doctor.id,
    })
    navigate('/doctor')
  }

  // Patient enter handler
  const handlePatientEnter = () => {
    const patient = patients.find((p) => p.id === selectedPatientId)
    if (!patient) return

    login({
      role: 'patient',
      user: patient,
      patientId: patient.id,
    })
    navigate('/patient')
  }

  const roles = [
    {
      key: 'clinicadmin' as RoleCard,
      icon: ShieldCheck,
      title: 'Clinic Admin',
      description: 'Manage appointments, billing, insurance, and clinic operations.',
    },
    {
      key: 'doctor' as RoleCard,
      icon: Stethoscope,
      title: 'Doctor',
      description: 'View patient records, manage appointments, and write clinical notes.',
    },
    {
      key: 'patient' as RoleCard,
      icon: User,
      title: 'Patient',
      description: 'Upload medical records, chat with AI, and track your health journey.',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-[#45BFD3]/5 flex flex-col">
      {/* Header */}
      <header className="w-full px-6 py-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#45BFD3]/10 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-[#45BFD3]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <span className="text-xl font-semibold text-gray-900 tracking-tight">MedEase</span>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-gray-900 mb-3">
            Welcome to MedEase
          </h1>
          <p className="text-gray-500 text-base md:text-lg font-light max-w-md mx-auto">
            Select your role to get started
          </p>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-3xl mb-8">
          {roles.map((r) => {
            const Icon = r.icon
            const isSelected = selectedRole === r.key
            return (
              <button
                key={r.key}
                onClick={() => setSelectedRole(isSelected ? null : r.key)}
                className={cn(
                  'group relative flex flex-col items-center text-center p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer bg-white',
                  isSelected
                    ? 'border-[#45BFD3] shadow-lg shadow-[#45BFD3]/10 scale-[1.02]'
                    : 'border-gray-100 hover:border-[#45BFD3]/40 hover:shadow-md'
                )}
              >
                <div
                  className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-colors duration-200',
                    isSelected ? 'bg-[#45BFD3] text-white' : 'bg-[#45BFD3]/10 text-[#45BFD3]'
                  )}
                >
                  <Icon className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">{r.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{r.description}</p>
                <ChevronRight
                  className={cn(
                    'w-5 h-5 absolute top-4 right-4 transition-all duration-200',
                    isSelected
                      ? 'text-[#45BFD3] opacity-100 translate-x-0'
                      : 'text-gray-300 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
                  )}
                />
              </button>
            )
          })}
        </div>

        {/* Role-specific Forms */}
        <div className="w-full max-w-md">
          {/* Clinic Admin Login Form */}
          {selectedRole === 'clinicadmin' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#45BFD3]" />
                Admin Login
              </h3>
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label htmlFor="admin-username" className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    id="admin-username"
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    required
                    placeholder="Enter username"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                      placeholder="Enter password"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {adminError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{adminError}</p>
                )}
                <button
                  type="submit"
                  disabled={adminLoading || !adminUsername || !adminPassword}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#45BFD3] hover:bg-[#3aa8ba] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                >
                  {adminLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  {adminLoading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            </div>
          )}

          {/* Doctor Selection */}
          {selectedRole === 'doctor' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-[#45BFD3]" />
                Select Doctor
              </h3>
              {doctorsLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading doctors...
                </div>
              ) : doctorsError ? (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{doctorsError}</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="doctor-select" className="block text-sm font-medium text-gray-700 mb-1">
                      Doctor
                    </label>
                    <select
                      id="doctor-select"
                      value={selectedDoctorId ?? ''}
                      onChange={(e) => setSelectedDoctorId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all"
                    >
                      <option value="">-- Choose a doctor --</option>
                      {doctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name} {doc.specialty ? `- ${doc.specialty}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleDoctorEnter}
                    disabled={!selectedDoctorId}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#45BFD3] hover:bg-[#3aa8ba] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    <ChevronRight className="w-4 h-4" />
                    Enter Doctor Portal
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Patient Selection */}
          {selectedRole === 'patient' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-[#45BFD3]" />
                Select Patient
              </h3>
              {patientsLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading patients...
                </div>
              ) : patientsError ? (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{patientsError}</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="patient-select" className="block text-sm font-medium text-gray-700 mb-1">
                      Patient
                    </label>
                    <select
                      id="patient-select"
                      value={selectedPatientId ?? ''}
                      onChange={(e) => setSelectedPatientId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all"
                    >
                      <option value="">-- Choose a patient --</option>
                      {patients.map((pat) => (
                        <option key={pat.id} value={pat.id}>
                          {pat.name} {pat.email ? `(${pat.email})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handlePatientEnter}
                    disabled={!selectedPatientId}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#45BFD3] hover:bg-[#3aa8ba] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    <ChevronRight className="w-4 h-4" />
                    Enter Patient Portal
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-400 py-4">
        MedEase &mdash; Simplifying Healthcare
      </footer>
    </div>
  )
}
