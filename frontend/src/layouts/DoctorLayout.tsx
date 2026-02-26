import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Newspaper,
  Settings,
  LogOut,
  Stethoscope,
  Clock,
  Calendar,
  MessageSquare,
  KeyRound,
  X,
  Loader2,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { API_BASE_URL } from '@/api'

const navItems = [
  { to: '/doctor',               icon: Newspaper,  label: 'Feed',           end: true },
  { to: '/doctor/history',       icon: Clock,      label: 'History',        end: false },
  { to: '/doctor/chat',          icon: MessageSquare, label: 'AI Chat',     end: false },
  { to: '/doctor/calendar',      icon: Calendar,   label: 'Calendar',       end: false },
  { to: '/doctor/consultconfig', icon: Settings,   label: 'Consult Config', end: false },
]

export default function DoctorLayout() {
  const { user, doctorId, logout } = useAuth()

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
      const res = await fetch(`${API_BASE_URL}/api/doctor/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: doctorId,
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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-100 flex flex-col shrink-0">
        {/* Sidebar Header */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#45BFD3]/10 flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-[#45BFD3]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {user?.name || 'Doctor'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.specialty || 'Physician'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                    isActive
                      ? 'bg-[#45BFD3]/10 text-[#45BFD3]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )
                }
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-gray-100 space-y-1">
          <button
            onClick={() => setShowChangePassword(true)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors duration-150"
            title="Change password"
          >
            <KeyRound className="w-4.5 h-4.5 shrink-0" />
            Change Password
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors duration-150"
          >
            <LogOut className="w-4.5 h-4.5 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

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
