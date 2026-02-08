import { NavLink, Outlet } from 'react-router-dom'
import {
  Newspaper,
  Users,
  CalendarDays,
  FileText,
  Settings,
  LogOut,
  Stethoscope,
  LayoutDashboard,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

const navItems = [
  { to: '/doctor',             icon: Newspaper,       label: 'Feed',         end: true },
  { to: '/doctor/dashboard',   icon: LayoutDashboard, label: 'Dashboard',    end: false },
  { to: '/doctor/patients',    icon: Users,           label: 'Patients',     end: false },
  { to: '/doctor/history',     icon: Clock,           label: 'History',      end: false },
  { to: '/doctor/appointments', icon: CalendarDays,   label: 'Appointments', end: false },
  { to: '/doctor/notes',       icon: FileText,        label: 'Notes',        end: false },
  { to: '/doctor/settings',    icon: Settings,        label: 'Settings',     end: false },
]

export default function DoctorLayout() {
  const { user, logout } = useAuth()

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
        <div className="p-3 border-t border-gray-100">
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
    </div>
  )
}
