import { Upload, LayoutDashboard, Clock, MessageSquare, Mic, Settings } from 'lucide-react'

interface NavigationProps {
  currentView: 'upload' | 'dashboard' | 'history' | 'chat' | 'consult' | 'config'
  onNavigate: (view: 'upload' | 'dashboard' | 'history' | 'chat' | 'consult' | 'config') => void
}

function Navigation({ currentView, onNavigate }: NavigationProps) {
  return (
    <nav className="w-full bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => onNavigate('upload')}
      >
        <div className="w-8 h-8 rounded-lg bg-[#45BFD3]/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-[#45BFD3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <span className="text-lg font-medium text-gray-900">MedEase</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            currentView === 'upload'
              ? 'bg-[#45BFD3] text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
          onClick={() => onNavigate('upload')}
        >
          <Upload className="w-4 h-4" />
          <span>Upload</span>
        </button>

        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            currentView === 'dashboard'
              ? 'bg-[#45BFD3] text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
          onClick={() => onNavigate('dashboard')}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard</span>
        </button>

        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            currentView === 'history'
              ? 'bg-[#45BFD3] text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
          onClick={() => onNavigate('history')}
        >
          <Clock className="w-4 h-4" />
          <span>History</span>
        </button>

        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            currentView === 'chat'
              ? 'bg-[#45BFD3] text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
          onClick={() => onNavigate('chat')}
        >
          <MessageSquare className="w-4 h-4" />
          <span>AI Chat</span>
        </button>

        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            currentView === 'consult'
              ? 'bg-[#45BFD3] text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
          onClick={() => onNavigate('consult')}
        >
          <Mic className="w-4 h-4" />
          <span>Live Consult</span>
        </button>

        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            currentView === 'config'
              ? 'bg-[#45BFD3] text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
          onClick={() => onNavigate('config')}
        >
          <Settings className="w-4 h-4" />
          <span>Config</span>
        </button>
      </div>
    </nav>
  )
}

export default Navigation
