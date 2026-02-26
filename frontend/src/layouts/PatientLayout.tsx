import { useState } from 'react'
import {
  Upload,
  Clock,
  Mic,
  Bell,
  LogOut,
  CalendarPlus,
  Receipt,
  CreditCard,
  ShieldCheck,
  KeyRound,
  X,
  Loader2,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { PatientApp } from '@/App'
import { API_BASE_URL } from '@/api'

type PatientView = 'upload' | 'dashboard' | 'history' | 'consult' | 'config' | 'updates' | 'appointments' | 'mystatements' | 'mypayments' | 'myinsurance'

export default function PatientLayout() {
  const [currentView, setCurrentView] = useState<PatientView>('upload')
  const { user, patientId, logout } = useAuth()

  // Change password modal state
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess(false)

    if (newPassword.length < 6) {
      setPwError('New password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match')
      return
    }

    setPwLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/patient/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          old_password: currentPassword,
          new_password: newPassword,
        }),
      })

      if (res.ok) {
        setPwSuccess(true)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(() => {
          setShowChangePassword(false)
          setPwSuccess(false)
        }, 2000)
      } else {
        const data = await res.json()
        setPwError(data.detail || 'Failed to change password')
      }
    } catch {
      setPwError('Connection error. Please try again.')
    } finally {
      setPwLoading(false)
    }
  }

  const closeModal = () => {
    setShowChangePassword(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPwError('')
    setPwSuccess(false)
  }

  const navItems: Array<{ view: PatientView; icon: typeof Upload; label: string }> = [
    { view: 'upload',    icon: Upload,          label: 'Upload' },
    { view: 'history',   icon: Clock,            label: 'History' },
    { view: 'consult',   icon: Mic,              label: 'Live Consult' },
    { view: 'updates',      icon: Bell,             label: 'Updates' },
    { view: 'appointments', icon: CalendarPlus,     label: 'Book Appt' },
    { view: 'mystatements', icon: Receipt,          label: 'Statements' },
    { view: 'mypayments',   icon: CreditCard,       label: 'Pay Bill' },
    { view: 'myinsurance',  icon: ShieldCheck,      label: 'Insurance' },
  ]

  return (
    <div className="app">
      {/* Navigation bar */}
      <nav className="w-full bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        {/* Logo */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => setCurrentView('upload')}
        >
          <div className="w-8 h-8 rounded-lg bg-[#45BFD3]/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-[#45BFD3]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <span className="text-lg font-medium text-gray-900">MedEase</span>
        </div>

        {/* Nav Items */}
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = currentView === item.view
            return (
              <button
                key={item.view}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-[#45BFD3] text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
                onClick={() => setCurrentView(item.view)}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            )
          })}

          {/* User info + change password + logout */}
          <div className="ml-3 pl-3 border-l border-gray-200 flex items-center gap-2">
            {user?.name && (
              <span className="text-sm text-gray-500 hidden lg:inline">{user.name}</span>
            )}
            <button
              onClick={() => setShowChangePassword(true)}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
              title="Change password"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Render existing patient app content */}
      <PatientApp currentView={currentView} onNavigate={setCurrentView} />

      {/* Change Password Modal */}
      {showChangePassword && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#45BFD3]/10">
                <KeyRound className="h-5 w-5 text-[#45BFD3]" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
            </div>

            {pwSuccess ? (
              <div className="flex flex-col items-center py-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mb-3">
                  <Check className="h-7 w-7 text-green-600" />
                </div>
                <p className="text-sm font-medium text-green-700">Password changed successfully!</p>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      placeholder="Enter current password"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="At least 6 characters"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter new password"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3] transition-all"
                  />
                </div>

                {pwError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{pwError}</p>
                )}

                <button
                  type="submit"
                  disabled={pwLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#45BFD3] hover:bg-[#3aa8ba] disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  {pwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {pwLoading ? 'Changing...' : 'Change Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
