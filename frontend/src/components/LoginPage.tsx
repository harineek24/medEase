import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ShieldCheck,
  Stethoscope,
  User,
  LogIn,
  ChevronRight,
  Loader2,
  Eye,
  EyeOff,
  Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { API_BASE_URL } from '@/api'
import { QRCodeSVG } from 'qrcode.react'

type RoleCard = 'clinicadmin' | 'doctor' | 'patient'

interface ClinicOption {
  id: number
  name: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { login, isAuthenticated, role } = useAuth()

  const [selectedRole, setSelectedRole] = useState<RoleCard | null>(null)
  const [credenceFlow, setCredenceFlow] = useState<{ token: string; walletUri: string } | null>(null)
  const [credenceStatus, setCredenceStatus] = useState('')

  // Forgot / Reset password state
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMessage, setForgotMessage] = useState('')

  const resetToken = searchParams.get('reset')
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')

  // Admin form state
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [showAdminPassword, setShowAdminPassword] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)

  // Doctor login state
  const [clinics, setClinics] = useState<ClinicOption[]>([])
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null)
  const [clinicsLoading, setClinicsLoading] = useState(false)
  const [doctorUsername, setDoctorUsername] = useState('')
  const [doctorPassword, setDoctorPassword] = useState('')
  const [showDoctorPassword, setShowDoctorPassword] = useState(false)
  const [doctorError, setDoctorError] = useState('')
  const [doctorLoading, setDoctorLoading] = useState(false)
  const [showDoctorForgotPassword, setShowDoctorForgotPassword] = useState(false)
  const [doctorForgotEmail, setDoctorForgotEmail] = useState('')
  const [doctorForgotLoading, setDoctorForgotLoading] = useState(false)
  const [doctorForgotMessage, setDoctorForgotMessage] = useState('')

  // Doctor reset token (from email link)
  const doctorResetToken = searchParams.get('doctorreset')

  // Patient login state
  const [patientUsername, setPatientUsername] = useState('')
  const [patientPassword, setPatientPassword] = useState('')
  const [showPatientPassword, setShowPatientPassword] = useState(false)
  const [patientError, setPatientError] = useState('')
  const [patientLoading, setPatientLoading] = useState(false)

  // If already authenticated, redirect to appropriate portal
  useEffect(() => {
    if (isAuthenticated && role) {
      navigate(`/${role}`)
    }
  }, [isAuthenticated, role, navigate])

  // Fetch clinics when doctor card is selected
  useEffect(() => {
    if (selectedRole === 'doctor') {
      setClinicsLoading(true)
      fetch(`${API_BASE_URL}/api/clinics`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch clinics')
          return res.json()
        })
        .then((data) => {
          const list = Array.isArray(data) ? data : data.clinics || []
          setClinics(list)
        })
        .catch(() => {
          setClinics([])
        })
        .finally(() => setClinicsLoading(false))
    }
  }, [selectedRole])

  useEffect(() => {
    if (!credenceFlow) return
    let active = true
    let busy = false
    const poll = async () => {
      if (busy || !active) return
      busy = true
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/credence/poll`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flow_token: credenceFlow.token }),
        })
        const data = await response.json().catch(() => ({}))
        if (!active) return
        if (!response.ok) throw new Error(data.detail || 'Credence verification failed')
        if (data.success && data.role && data.user) {
          const user = data.user
          login({ role: data.role, user, clinicId: user.clinic_id, doctorId: data.role === 'doctor' ? user.id : undefined, patientId: data.role === 'patient' ? user.id : undefined })
          navigate(data.role === 'clinicadmin' ? '/clinicadmin' : `/${data.role}`)
          setCredenceFlow(null)
        } else if (data.status === 'failed' || data.status === 'expired') {
          setCredenceStatus(data.detail || 'Verification expired. Please sign in again.')
          setCredenceFlow(null)
        }
      } catch (error) {
        if (active) {
          setCredenceStatus(error instanceof Error ? error.message : 'Credence verification failed')
          setCredenceFlow(null)
        }
      } finally { busy = false }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, 2000)
    return () => { active = false; window.clearInterval(timer) }
  }, [credenceFlow, login, navigate])

  const startCredenceLogin = async (role: RoleCard, username: string, password: string, clinicId?: number | null) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/credence/start`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, username, password, clinic_id: clinicId || undefined }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.detail || 'Unable to start Credence verification')
    setCredenceFlow({ token: data.flow_token, walletUri: data.wallet_uri })
    setCredenceStatus('Scan this code with your supported mobile ID wallet. Waiting for verification…')
  }

  // Admin login handler
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminError('')
    setAdminLoading(true)

    try {
      await startCredenceLogin('clinicadmin', adminUsername, adminPassword)
      setAdminPassword('')
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setAdminLoading(false)
    }
  }

  // Doctor login handler
  const handleDoctorLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setDoctorError('')
    setDoctorLoading(true)

    try {
      await startCredenceLogin('doctor', doctorUsername, doctorPassword, selectedClinicId)
      setDoctorPassword('')
    } catch (err) {
      setDoctorError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setDoctorLoading(false)
    }
  }

  // Doctor forgot password handler
  const handleDoctorForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setDoctorForgotLoading(true)
    setDoctorForgotMessage('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/doctor/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: doctorForgotEmail }),
      })
      const data = await res.json()
      setDoctorForgotMessage(data.message || 'If an account with that email exists, a reset link has been sent.')
    } catch {
      setDoctorForgotMessage('If an account with that email exists, a reset link has been sent.')
    } finally {
      setDoctorForgotLoading(false)
    }
  }

  // Doctor reset password handler
  const handleDoctorResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError('')
    setResetMessage('')

    if (resetNewPassword.length < 6) {
      setResetError('Password must be at least 6 characters')
      return
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match')
      return
    }

    setResetLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/doctor/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: doctorResetToken, new_password: resetNewPassword }),
      })
      if (res.ok) {
        setResetMessage('Password has been reset. You can now log in.')
        setSearchParams({})
      } else {
        const data = await res.json()
        setResetError(data.detail || 'Invalid or expired reset link.')
      }
    } catch {
      setResetError('Something went wrong. Please try again.')
    } finally {
      setResetLoading(false)
    }
  }

  // Patient login handler
  const handlePatientLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setPatientError('')
    setPatientLoading(true)

    try {
      await startCredenceLogin('patient', patientUsername, patientPassword)
      setPatientPassword('')
    } catch (err) {
      setPatientError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setPatientLoading(false)
    }
  }

  // Forgot password handler
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotLoading(true)
    setForgotMessage('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/patient/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })
      const data = await res.json()
      setForgotMessage(data.message || 'If an account with that email exists, a reset link has been sent.')
    } catch {
      setForgotMessage('If an account with that email exists, a reset link has been sent.')
    } finally {
      setForgotLoading(false)
    }
  }

  // Reset password handler
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError('')
    setResetMessage('')

    if (resetNewPassword.length < 6) {
      setResetError('Password must be at least 6 characters')
      return
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match')
      return
    }

    setResetLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/patient/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, new_password: resetNewPassword }),
      })
      if (res.ok) {
        setResetMessage('Password has been reset. You can now log in.')
        setSearchParams({})
      } else {
        const data = await res.json()
        setResetError(data.detail || 'Invalid or expired reset link.')
      }
    } catch {
      setResetError('Something went wrong. Please try again.')
    } finally {
      setResetLoading(false)
    }
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
        {/* Password Reset Form (from email link - patient or doctor) */}
        {(resetToken || doctorResetToken) ? (
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Reset Your Password</h3>
              {resetMessage ? (
                <div className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-4">{resetMessage}</div>
              ) : (
                <form onSubmit={doctorResetToken ? handleDoctorResetPassword : handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <input
                      type="password"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="At least 6 characters"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                    <input
                      type="password"
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      required
                      placeholder="Re-enter your password"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all"
                    />
                  </div>
                  {resetError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{resetError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full px-4 py-2.5 bg-[#45BFD3] hover:bg-[#3aa8ba] disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    {resetLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </form>
              )}
              <button
                onClick={() => setSearchParams({})}
                className="w-full mt-3 text-sm text-[#45BFD3] hover:underline text-center"
              >
                Back to login
              </button>
            </div>
          </div>
        ) : (
        <>
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
                      type={showAdminPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                      placeholder="Enter password"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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

          {/* Doctor Login */}
          {selectedRole === 'doctor' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-[#45BFD3]" />
                Doctor Login
              </h3>
              <form onSubmit={handleDoctorLogin} className="space-y-4">
                <div>
                  <label htmlFor="doctor-clinic" className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Clinic</span>
                  </label>
                  {clinicsLoading ? (
                    <div className="flex items-center py-2 text-gray-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading clinics...
                    </div>
                  ) : (
                    <select
                      id="doctor-clinic"
                      value={selectedClinicId ?? ''}
                      onChange={(e) => setSelectedClinicId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all"
                    >
                      <option value="">-- Select your clinic --</option>
                      {clinics.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label htmlFor="doctor-username" className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    id="doctor-username"
                    type="text"
                    value={doctorUsername}
                    onChange={(e) => setDoctorUsername(e.target.value)}
                    required
                    placeholder="Enter your username"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="doctor-password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="doctor-password"
                      type={showDoctorPassword ? 'text' : 'password'}
                      value={doctorPassword}
                      onChange={(e) => setDoctorPassword(e.target.value)}
                      required
                      placeholder="Enter your password"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDoctorPassword(!showDoctorPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showDoctorPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {doctorError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{doctorError}</p>
                )}
                <button
                  type="submit"
                  disabled={doctorLoading || !doctorUsername || !doctorPassword}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#45BFD3] hover:bg-[#3aa8ba] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                >
                  {doctorLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  {doctorLoading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
              <button
                type="button"
                onClick={() => setShowDoctorForgotPassword(true)}
                className="w-full mt-3 text-sm text-[#45BFD3] hover:underline text-center"
              >
                Forgot password?
              </button>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Your clinic admin will provide your login credentials.
              </p>
            </div>
          )}

          {/* Doctor Forgot Password Form */}
          {selectedRole === 'doctor' && showDoctorForgotPassword && (
            <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-base font-medium text-gray-900 mb-3">Reset Password</h3>
              {doctorForgotMessage ? (
                <div className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-3">{doctorForgotMessage}</div>
              ) : (
                <form onSubmit={handleDoctorForgotPassword} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                    <input
                      type="email"
                      value={doctorForgotEmail}
                      onChange={(e) => setDoctorForgotEmail(e.target.value)}
                      required
                      placeholder="Enter your email"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={doctorForgotLoading || !doctorForgotEmail}
                    className="w-full px-4 py-2.5 bg-[#45BFD3] hover:bg-[#3aa8ba] disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    {doctorForgotLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </form>
              )}
              <button
                onClick={() => { setShowDoctorForgotPassword(false); setDoctorForgotMessage('') }}
                className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 text-center"
              >
                Back to login
              </button>
            </div>
          )}

          {/* Patient Login Form */}
          {selectedRole === 'patient' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-[#45BFD3]" />
                Patient Login
              </h3>
              <form onSubmit={handlePatientLogin} className="space-y-4">
                <div>
                  <label htmlFor="patient-username" className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    id="patient-username"
                    type="text"
                    value={patientUsername}
                    onChange={(e) => setPatientUsername(e.target.value)}
                    required
                    placeholder="Enter your username"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="patient-password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="patient-password"
                      type={showPatientPassword ? 'text' : 'password'}
                      value={patientPassword}
                      onChange={(e) => setPatientPassword(e.target.value)}
                      required
                      placeholder="Enter your password"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPatientPassword(!showPatientPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPatientPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {patientError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{patientError}</p>
                )}
                <button
                  type="submit"
                  disabled={patientLoading || !patientUsername || !patientPassword}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#45BFD3] hover:bg-[#3aa8ba] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                >
                  {patientLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  {patientLoading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="w-full mt-3 text-sm text-[#45BFD3] hover:underline text-center"
              >
                Forgot password?
              </button>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Your clinic admin will provide your login credentials.
              </p>
            </div>
          )}

          {/* Forgot Password Form */}
          {selectedRole === 'patient' && showForgotPassword && (
            <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-base font-medium text-gray-900 mb-3">Reset Password</h3>
              {forgotMessage ? (
                <div className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-3">{forgotMessage}</div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                      placeholder="Enter your email"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotEmail}
                    className="w-full px-4 py-2.5 bg-[#45BFD3] hover:bg-[#3aa8ba] disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </form>
              )}
              <button
                onClick={() => { setShowForgotPassword(false); setForgotMessage('') }}
                className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 text-center"
              >
                Back to login
              </button>
            </div>
          )}
          {credenceFlow && (
            <section className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center" aria-live="polite">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Verify with your mobile ID</h3>
              <p className="text-sm text-gray-600 mb-4">Scan with a supported mobile ID wallet to verify your identity. The linked patient record remains shared across clinics.</p>
              <div className="inline-block rounded-xl border p-3 bg-white"><QRCodeSVG value={credenceFlow.walletUri} size={220} level="M" /></div>
              <a className="block mt-3 text-sm text-[#168096] underline" href={credenceFlow.walletUri}>Open wallet on this device</a>
              <p className="mt-3 text-sm text-gray-600">{credenceStatus}</p>
              <button type="button" onClick={() => { setCredenceFlow(null); setCredenceStatus('') }} className="mt-3 text-sm text-gray-500 hover:text-gray-800">Cancel verification</button>
            </section>
          )}
        </div>
        </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-400 py-4">
        MedEase &mdash; Simplifying Healthcare
      </footer>
    </div>
  )
}
