import { useState } from 'react'
import {
  Upload,
  Clock,
  MessageSquare,
  Mic,
  Bell,
  Heart,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { PatientApp } from '@/App'

type PatientView = 'upload' | 'dashboard' | 'history' | 'chat' | 'consult' | 'config' | 'updates' | 'health'

export default function PatientLayout() {
  const [currentView, setCurrentView] = useState<PatientView>('upload')
  const { user, logout } = useAuth()

  const navItems: Array<{ view: PatientView; icon: typeof Upload; label: string }> = [
    { view: 'upload',    icon: Upload,          label: 'Upload' },
    { view: 'history',   icon: Clock,            label: 'History' },
    { view: 'chat',      icon: MessageSquare,    label: 'AI Chat' },
    { view: 'consult',   icon: Mic,              label: 'Live Consult' },
    { view: 'updates',   icon: Bell,             label: 'Updates' },
    { view: 'health',    icon: Heart,            label: 'Health' },
  ]

  return (
    <div className="app">
      {/* Navigation bar -- same style as existing Navigation component */}
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

          {/* User info + logout */}
          <div className="ml-3 pl-3 border-l border-gray-200 flex items-center gap-2">
            {user?.name && (
              <span className="text-sm text-gray-500 hidden lg:inline">{user.name}</span>
            )}
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
    </div>
  )
}
