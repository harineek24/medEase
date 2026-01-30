interface NavigationProps {
  currentView: 'upload' | 'dashboard' | 'history' | 'chat' | 'consult'
  onNavigate: (view: 'upload' | 'dashboard' | 'history' | 'chat' | 'consult') => void
}

function Navigation({ currentView, onNavigate }: NavigationProps) {
  return (
    <nav className="main-nav">
      <div className="nav-brand" onClick={() => onNavigate('upload')}>
        <span className="nav-logo">🏥</span>
        <span className="nav-title">MedEase</span>
      </div>

      <div className="nav-links">
        <button
          className={`nav-link ${currentView === 'upload' ? 'active' : ''}`}
          onClick={() => onNavigate('upload')}
        >
          <span className="nav-icon">📄</span>
          <span className="nav-text">Upload</span>
        </button>

        <button
          className={`nav-link ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          <span className="nav-icon">📊</span>
          <span className="nav-text">Dashboard</span>
        </button>

        <button
          className={`nav-link ${currentView === 'history' ? 'active' : ''}`}
          onClick={() => onNavigate('history')}
        >
          <span className="nav-icon">📋</span>
          <span className="nav-text">History</span>
        </button>

        <button
          className={`nav-link ${currentView === 'chat' ? 'active' : ''}`}
          onClick={() => onNavigate('chat')}
        >
          <span className="nav-icon">🤖</span>
          <span className="nav-text">AI Chat</span>
        </button>

        <button
          className={`nav-link consult-link ${currentView === 'consult' ? 'active' : ''}`}
          onClick={() => onNavigate('consult')}
        >
          <span className="nav-icon">👨‍⚕️</span>
          <span className="nav-text">Live Consult</span>
        </button>
      </div>
    </nav>
  )
}

export default Navigation
