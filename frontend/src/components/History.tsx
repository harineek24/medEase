import { useState, useEffect } from 'react'

interface Summary {
  id: number
  patient_id: number
  patient_name: string
  raw_summary: string
  diagnosis: string
  visit_date: string
  visit_location: string
  created_at: string
}

interface HistoryProps {
  onSelectSummary?: (summary: Summary) => void
}

function History({ onSelectSummary }: HistoryProps) {
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSummary, setSelectedSummary] = useState<Summary | null>(null)

  useEffect(() => {
    fetchHistory()
  }, [])

  const fetchHistory = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/history')
      if (response.ok) {
        const data = await response.json()
        setSummaries(data.summaries || [])
      } else {
        setError('Failed to load history')
      }
    } catch (err) {
      setError('Could not connect to server')
    } finally {
      setLoading(false)
    }
  }

  const filteredSummaries = summaries.filter(summary => {
    const query = searchQuery.toLowerCase()
    return (
      (summary.patient_name?.toLowerCase() || '').includes(query) ||
      (summary.diagnosis?.toLowerCase() || '').includes(query) ||
      (summary.visit_location?.toLowerCase() || '').includes(query)
    )
  })

  const handleViewDetails = async (summaryId: number) => {
    try {
      const response = await fetch(`http://localhost:8000/api/history/${summaryId}`)
      if (response.ok) {
        const data = await response.json()
        setSelectedSummary(data)
      }
    } catch (err) {
      console.error('Error fetching summary details:', err)
    }
  }

  if (loading) {
    return (
      <div className="history-loading">
        <div className="spinner"></div>
        <p>Loading history...</p>
      </div>
    )
  }

  return (
    <div className="history">
      <div className="history-header">
        <div className="history-title">
          <h2>📋 Patient History</h2>
          <p className="history-subtitle">View all analyzed medical records</p>
        </div>

        <div className="history-search">
          <input
            type="text"
            placeholder="Search by patient name, diagnosis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <span className="search-icon">🔍</span>
        </div>
      </div>

      {error && (
        <div className="history-error">
          <span>⚠️</span> {error}
          <button onClick={fetchHistory}>Retry</button>
        </div>
      )}

      {filteredSummaries.length === 0 ? (
        <div className="history-empty">
          <div className="empty-icon">📭</div>
          <h3>No Records Found</h3>
          {searchQuery ? (
            <p>No results match "{searchQuery}". Try a different search.</p>
          ) : (
            <p>Upload EHR documents to build your patient history.</p>
          )}
        </div>
      ) : (
        <div className="history-grid">
          {filteredSummaries.map((summary) => (
            <div key={summary.id} className="history-card">
              <div className="card-header">
                <div className="patient-avatar">
                  {(summary.patient_name || 'P')[0].toUpperCase()}
                </div>
                <div className="patient-info">
                  <h3>{summary.patient_name || 'Unknown Patient'}</h3>
                  <span className="visit-date">
                    {summary.visit_date || new Date(summary.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="card-body">
                {summary.diagnosis && (
                  <div className="diagnosis-tag">
                    <span className="tag-icon">🏥</span>
                    {summary.diagnosis.length > 50
                      ? summary.diagnosis.substring(0, 50) + '...'
                      : summary.diagnosis}
                  </div>
                )}

                {summary.visit_location && (
                  <div className="location-tag">
                    <span className="tag-icon">📍</span>
                    {summary.visit_location}
                  </div>
                )}
              </div>

              <div className="card-footer">
                <span className="created-date">
                  Added {new Date(summary.created_at).toLocaleDateString()}
                </span>
                <button
                  className="view-details-btn"
                  onClick={() => handleViewDetails(summary.id)}
                >
                  View Details →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Detail Modal */}
      {selectedSummary && (
        <div className="modal-overlay" onClick={() => setSelectedSummary(null)}>
          <div className="modal-content history-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedSummary(null)}>×</button>

            <div className="modal-header">
              <h2>📋 {selectedSummary.patient_name || 'Patient Record'}</h2>
            </div>

            <div className="modal-body">
              <div className="detail-section">
                <h3>Visit Information</h3>
                <div className="detail-content">
                  {selectedSummary.visit_date && (
                    <p><strong>Date:</strong> {selectedSummary.visit_date}</p>
                  )}
                  {selectedSummary.visit_location && (
                    <p><strong>Location:</strong> {selectedSummary.visit_location}</p>
                  )}
                  {selectedSummary.diagnosis && (
                    <p><strong>Diagnosis:</strong> {selectedSummary.diagnosis}</p>
                  )}
                </div>
              </div>

              {(selectedSummary as any).medications?.length > 0 && (
                <div className="detail-section">
                  <h3>💊 Medications ({(selectedSummary as any).medications.length})</h3>
                  <div className="detail-content">
                    <ul className="medication-list">
                      {(selectedSummary as any).medications.map((med: any, i: number) => (
                        <li key={i}>
                          <strong>{med.name}</strong>
                          {med.dosage && ` - ${med.dosage}`}
                          {med.frequency && ` (${med.frequency})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {(selectedSummary as any).test_results?.length > 0 && (
                <div className="detail-section">
                  <h3>🔬 Test Results ({(selectedSummary as any).test_results.length})</h3>
                  <div className="detail-content">
                    <ul className="test-list">
                      {(selectedSummary as any).test_results.map((test: any, i: number) => (
                        <li key={i} className={test.status}>
                          <strong>{test.test_name}</strong>: {test.value}
                          {test.status && (
                            <span className={`status-badge ${test.status}`}>
                              {test.status === 'normal' ? '✓' : '⚠️'} {test.status}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {(selectedSummary as any).interactions?.length > 0 && (
                <div className="detail-section">
                  <h3>⚠️ Drug Interactions ({(selectedSummary as any).interactions.length})</h3>
                  <div className="detail-content">
                    {(selectedSummary as any).interactions.map((interaction: any, i: number) => (
                      <div key={i} className={`interaction-item ${interaction.severity}`}>
                        <strong>{interaction.drug1}</strong> ↔ <strong>{interaction.drug2}</strong>
                        <span className={`severity-tag ${interaction.severity}`}>
                          {interaction.severity}
                        </span>
                        {interaction.description && <p>{interaction.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-section">
                <h3>📄 Full Summary</h3>
                <div className="detail-content summary-text">
                  {selectedSummary.raw_summary}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default History
