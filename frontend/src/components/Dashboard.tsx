import { useState, useEffect } from 'react'

interface DashboardStats {
  total_patients: number
  total_summaries: number
  total_medications: number
  total_interactions: number
  high_risk_cases: number
  medications_by_class: Array<{ drug_class: string; count: number }>
  recent_activity: Array<{
    id: number
    created_at: string
    patient_name: string
    diagnosis: string
  }>
  interactions_by_severity: Array<{ severity: string; count: number }>
}

interface DashboardProps {
  onViewHistory: () => void
}

function Dashboard({ onViewHistory }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/dashboard/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      } else {
        setError('Failed to load dashboard data')
      }
    } catch (err) {
      setError('Could not connect to server')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <span className="error-icon">⚠️</span>
        <p>{error}</p>
        <button onClick={fetchStats} className="retry-btn">Retry</button>
      </div>
    )
  }

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'severe': return '#ef4444'
      case 'moderate': return '#f59e0b'
      case 'mild': return '#22c55e'
      default: return '#6b7280'
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>📊 Analytics Dashboard</h2>
        <p className="dashboard-subtitle">Overview of your healthcare data</p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-info">
            <span className="stat-value">{stats?.total_patients || 0}</span>
            <span className="stat-label">Patients</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📄</div>
          <div className="stat-info">
            <span className="stat-value">{stats?.total_summaries || 0}</span>
            <span className="stat-label">Summaries</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💊</div>
          <div className="stat-info">
            <span className="stat-value">{stats?.total_medications || 0}</span>
            <span className="stat-label">Medications</span>
          </div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-icon">⚠️</div>
          <div className="stat-info">
            <span className="stat-value">{stats?.high_risk_cases || 0}</span>
            <span className="stat-label">High Risk Cases</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="dashboard-charts">
        {/* Interactions by Severity */}
        <div className="chart-card">
          <h3>Drug Interactions by Severity</h3>
          {stats?.interactions_by_severity && stats.interactions_by_severity.length > 0 ? (
            <div className="severity-bars">
              {stats.interactions_by_severity.map((item, index) => (
                <div key={index} className="severity-bar-item">
                  <div className="severity-label">
                    <span className="severity-dot" style={{ backgroundColor: getSeverityColor(item.severity) }}></span>
                    {item.severity || 'Unknown'}
                  </div>
                  <div className="severity-bar-container">
                    <div
                      className="severity-bar-fill"
                      style={{
                        width: `${Math.min((item.count / Math.max(...stats.interactions_by_severity.map(i => i.count))) * 100, 100)}%`,
                        backgroundColor: getSeverityColor(item.severity)
                      }}
                    ></div>
                  </div>
                  <span className="severity-count">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-data">
              <p>No interaction data yet</p>
              <p className="no-data-hint">Upload EHR documents to see analytics</p>
            </div>
          )}
        </div>

        {/* Medications by Class */}
        <div className="chart-card">
          <h3>Top Medication Classes</h3>
          {stats?.medications_by_class && stats.medications_by_class.length > 0 ? (
            <div className="med-class-list">
              {stats.medications_by_class.slice(0, 6).map((item, index) => (
                <div key={index} className="med-class-item">
                  <div className="med-class-rank">{index + 1}</div>
                  <div className="med-class-info">
                    <span className="med-class-name">{item.drug_class}</span>
                    <span className="med-class-count">{item.count} medications</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-data">
              <p>No medication data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="recent-activity-section">
        <div className="section-header">
          <h3>📋 Recent Activity</h3>
          <button className="view-all-btn" onClick={onViewHistory}>View All</button>
        </div>

        {stats?.recent_activity && stats.recent_activity.length > 0 ? (
          <div className="activity-list">
            {stats.recent_activity.slice(0, 5).map((activity, index) => (
              <div key={index} className="activity-item">
                <div className="activity-icon">📄</div>
                <div className="activity-info">
                  <span className="activity-patient">{activity.patient_name || 'Unknown Patient'}</span>
                  <span className="activity-diagnosis">{activity.diagnosis || 'No diagnosis'}</span>
                </div>
                <div className="activity-date">
                  {new Date(activity.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-activity">
            <div className="no-activity-icon">📭</div>
            <p>No recent activity</p>
            <p className="no-activity-hint">Upload your first EHR document to get started!</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
