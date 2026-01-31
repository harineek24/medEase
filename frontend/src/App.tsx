import { useState, DragEvent, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

// Import components
import Navigation from './components/Navigation'
import PatientChat from './components/PatientChat'
import GeneralChat from './components/GeneralChat'
import Dashboard from './components/Dashboard'
import History from './components/History'
import VoiceConsult from './components/VoiceConsult'
import ConsultConfig from './components/ConsultConfig'

type AppView = 'upload' | 'dashboard' | 'history' | 'chat' | 'consult' | 'config'
type AppState = 'upload' | 'processing' | 'results'

interface SummaryData {
  summary: string
  markdown_path: string
  patient_name: string
  date_processed: string
}

interface Medication {
  name: string
  dosage?: string
  frequency?: string
  purpose?: string
}

interface MedicationDetails {
  drug_profile: {
    generic_name: string
    brand_names: string[]
    fda_approval_year: string
    developer: string
    usage_level: string
  }
  dietary_recommendations: {
    beneficial_foods: string[]
    foods_to_avoid: string[]
    nutritional_support: string
  }
  how_it_works: string
  common_side_effects: Array<{effect: string, frequency: string}>
  serious_side_effects: string[]
  therapeutic_class: string
  your_analysis?: {
    dosage_status: any
    interactions: any[]
    overall_risk: string
  }
}

interface PatientOverview {
  patientName?: string
  visitDate?: string
  hospital?: string
  visitType?: string
}

interface TestResult {
  name: string
  value: string
  status: 'normal' | 'borderline' | 'abnormal'
  normalRange?: string
  explanation?: string
}

interface DrugInteraction {
  drug1: string
  drug2: string
  severity: string
  description: string
  recommendation: string
}

function App() {
  // View state
  const [currentView, setCurrentView] = useState<AppView>('upload')

  // Upload flow state
  const [appState, setAppState] = useState<AppState>('upload')
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [error, setError] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const [dragActive, setDragActive] = useState(false)
  const [medications, setMedications] = useState<Medication[]>([])
  const [selectedMedication, setSelectedMedication] = useState<string | null>(null)
  const [medicationDetails, setMedicationDetails] = useState<MedicationDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [patientOverview, setPatientOverview] = useState<PatientOverview | null>(null)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [selectedTest, setSelectedTest] = useState<TestResult | null>(null)
  const [filteredSummary, setFilteredSummary] = useState<string>('')
  const [interactions, setInteractions] = useState<DrugInteraction[]>([])
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // File validation
  const validateFile = (file: File): string | null => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
    const maxSize = 25 * 1024 * 1024 // 25MB

    if (!allowedTypes.includes(file.type)) {
      return 'Invalid file type. Please upload a PDF, PNG, or JPG file.'
    }

    if (file.size > maxSize) {
      return 'File too large. Maximum size is 25MB.'
    }

    return null
  }

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setFileName(file.name)
    setError('')
    setAppState('processing')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('http://localhost:8000/api/summarize', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to process file')
      }

      const data: SummaryData = await response.json()
      setSummaryData(data)
      setAppState('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while processing the file')
      setAppState('upload')
    }
  }

  // Drag and drop handlers
  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0])
    }
  }

  // File input handler
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0])
    }
  }

  // Download markdown
  const handleDownload = () => {
    if (!summaryData) return

    const blob = new Blob([summaryData.summary], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${summaryData.patient_name}_Summary_${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Print summary
  const handlePrint = () => {
    window.print()
  }

  // Save to database
  const handleSaveToHistory = async () => {
    if (!summaryData) return

    setSaveStatus('saving')

    try {
      const response = await fetch('http://localhost:8000/api/save-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patient_name: patientOverview?.patientName || summaryData.patient_name,
          raw_summary: summaryData.summary,
          file_path: summaryData.markdown_path,
          original_filename: fileName,
          diagnosis: extractDiagnosis(summaryData.summary),
          visit_date: patientOverview?.visitDate,
          visit_location: patientOverview?.hospital,
          medications: medications,
          test_results: testResults.map(t => ({
            name: t.name,
            value: t.value,
            status: t.status,
            explanation: t.explanation
          })),
          interactions: interactions
        }),
      })

      if (response.ok) {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        setSaveStatus('error')
      }
    } catch (err) {
      setSaveStatus('error')
    }
  }

  // Extract diagnosis from summary
  const extractDiagnosis = (summary: string): string => {
    const match = summary.match(/What Happened[\s\S]*?\n([^\n#]+)/i)
    return match ? match[1].trim().substring(0, 200) : ''
  }

  // Reset to upload state
  const handleNewUpload = () => {
    setAppState('upload')
    setSummaryData(null)
    setError('')
    setFileName('')
    setMedications([])
    setSelectedMedication(null)
    setMedicationDetails(null)
    setPatientOverview(null)
    setTestResults([])
    setSelectedTest(null)
    setFilteredSummary('')
    setInteractions([])
    setSaveStatus('idle')
  }

  // Handle navigation
  const handleNavigate = (view: AppView) => {
    setCurrentView(view)
    if (view === 'upload' && appState === 'results') {
      // Keep results when navigating back
    }
  }

  // Extract data from summary when it's generated
  useEffect(() => {
    const extractData = async () => {
      if (summaryData && summaryData.summary) {
        // Extract medications
        try {
          const medsResponse = await fetch('http://localhost:8000/api/extract-medications', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ summary: summaryData.summary }),
          })

          if (medsResponse.ok) {
            const medsData = await medsResponse.json()
            const extractedMeds = medsData.medications || []
            setMedications(extractedMeds)

            // Analyze medications for interactions
            if (extractedMeds.length > 1) {
              try {
                const analysisResponse = await fetch('http://localhost:8000/api/analyze-medications', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ medications: extractedMeds }),
                })

                if (analysisResponse.ok) {
                  const analysisData = await analysisResponse.json()
                  setInteractions(analysisData.interactions || [])
                }
              } catch (err) {
                console.error('Error analyzing medications:', err)
              }
            }
          }
        } catch (err) {
          console.error('Error extracting medications:', err)
        }

        // Extract patient overview
        try {
          const overviewResponse = await fetch('http://localhost:8000/api/extract-patient-overview', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ summary: summaryData.summary }),
          })

          if (overviewResponse.ok) {
            const overviewData = await overviewResponse.json()
            setPatientOverview({
              patientName: overviewData.patient_name,
              visitDate: overviewData.visit_date,
              hospital: overviewData.hospital,
              visitType: overviewData.visit_type
            })
          }
        } catch (err) {
          console.error('Error extracting patient overview:', err)
        }

        // Extract test results
        try {
          const testsResponse = await fetch('http://localhost:8000/api/extract-test-results', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ summary: summaryData.summary }),
          })

          if (testsResponse.ok) {
            const testsData = await testsResponse.json()
            setTestResults(testsData.test_results || [])
          }
        } catch (err) {
          console.error('Error extracting test results:', err)
        }

        // Filter summary to remove sections we're displaying separately
        const filtered = filterSummary(summaryData.summary)
        setFilteredSummary(filtered)
      }
    }

    extractData()
  }, [summaryData])

  // Fetch detailed medication information
  const handleMedicationClick = async (medication: Medication) => {
    setSelectedMedication(medication.name)
    setLoadingDetails(true)
    setMedicationDetails(null)

    try {
      const response = await fetch('http://localhost:8000/api/medication-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          medication_name: medication.name,
          dosage: medication.dosage,
          all_medications: medications,
        }),
      })

      if (response.ok) {
        const details = await response.json()
        setMedicationDetails(details)
      } else {
        setError('Failed to fetch medication details')
      }
    } catch (err) {
      setError('Error fetching medication details')
      console.error(err)
    } finally {
      setLoadingDetails(false)
    }
  }

  // Close medication modal
  const closeMedicationModal = () => {
    setSelectedMedication(null)
    setMedicationDetails(null)
  }

  // Remove sections from summary that we're displaying separately
  const filterSummary = (summary: string): string => {
    const sections = summary.split(/(?=## )/g)
    const filtered = sections.filter(section => {
      return !section.includes('## 📋 Quick Overview') &&
             !section.includes('## 💊 Your Medications') &&
             !section.includes('## 🔬 Test Results')
    })
    return filtered.join('\n')
  }

  // Render the appropriate view
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard onViewHistory={() => setCurrentView('history')} />

      case 'history':
        return <History />

      case 'chat':
        return <GeneralChat />

      case 'consult':
        return <VoiceConsult />

      case 'config':
        return <ConsultConfig />

      case 'upload':
      default:
        return renderUploadView()
    }
  }

  // Upload view (original functionality)
  const renderUploadView = () => (
    <>
      {/* Error message */}
      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      {/* Upload State */}
      {appState === 'upload' && (
        <div className="upload-container">
          <div className="upload-section">
            <div
              className={`upload-area ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="upload-icon">📄</div>
              <h2>Drop your medical document here</h2>
              <p>or</p>
              <label htmlFor="file-input" className="upload-button">
                Choose File
              </label>
              <input
                id="file-input"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
              <p className="upload-hint">Supports PDF, PNG, JPG (max 25MB)</p>
            </div>
          </div>

          <div className="info-cards">
            <div className="info-card">
              <div className="info-icon">🔒</div>
              <h3>Secure & Private</h3>
              <p>Your medical documents are processed securely and never stored permanently</p>
            </div>
            <div className="info-card">
              <div className="info-icon">⚡</div>
              <h3>Fast Processing</h3>
              <p>Get your summary in seconds using advanced AI technology</p>
            </div>
            <div className="info-card">
              <div className="info-icon">💬</div>
              <h3>Plain English</h3>
              <p>Medical jargon translated into language you can understand</p>
            </div>
          </div>
        </div>
      )}

      {/* Processing State */}
      {appState === 'processing' && (
        <div className="processing-container">
          <div className="spinner"></div>
          <h2>Analyzing {fileName}...</h2>
          <p>This usually takes 10-20 seconds</p>
          <div className="processing-steps">
            <div className="step">✓ Reading document</div>
            <div className="step active">⏳ Analyzing medical content</div>
            <div className="step">◯ Generating summary</div>
          </div>
        </div>
      )}

      {/* Results State */}
      {appState === 'results' && summaryData && (
        <div className="results-container">
          <div className="results-header">
            <div className="results-info">
              <h2>Summary for {summaryData.patient_name}</h2>
              <p className="date">Generated on {new Date(summaryData.date_processed).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</p>
            </div>
            <div className="results-actions">
              <button onClick={handleNewUpload} className="action-button secondary">
                📤 New Upload
              </button>
              <button onClick={handlePrint} className="action-button secondary">
                🖨️ Print
              </button>
              <button onClick={handleDownload} className="action-button primary">
                💾 Download
              </button>
              <button
                onClick={handleSaveToHistory}
                className={`action-button ${saveStatus === 'saved' ? 'success' : 'save'}`}
                disabled={saveStatus === 'saving' || saveStatus === 'saved'}
              >
                {saveStatus === 'idle' && '📁 Save'}
                {saveStatus === 'saving' && '⏳ Saving...'}
                {saveStatus === 'saved' && '✓ Saved'}
                {saveStatus === 'error' && '⚠️ Retry'}
              </button>

              {/* Patient Chat Button */}
              <PatientChat
                summaryText={summaryData.summary}
                medications={medications}
                testResults={testResults}
                interactions={interactions}
                patientName={patientOverview?.patientName || summaryData.patient_name}
              />
            </div>
          </div>

          <div className="disclaimer">
            <strong>⚠️ Medical Disclaimer:</strong> This summary is AI-generated and for informational purposes only.
            It is NOT medical advice. Always consult with your healthcare provider about your medical conditions and treatment.
          </div>

          {/* Patient Overview - Simple Bullet Points */}
          {patientOverview && (
            <div className="patient-overview-simple">
              <h3>📋 Patient Overview</h3>
              <ul className="overview-list">
                {patientOverview.patientName && (
                  <li><strong>Patient:</strong> {patientOverview.patientName}</li>
                )}
                {patientOverview.visitDate && (
                  <li><strong>Date:</strong> {patientOverview.visitDate}</li>
                )}
                {patientOverview.hospital && (
                  <li><strong>Hospital:</strong> {patientOverview.hospital}</li>
                )}
                {patientOverview.visitType && (
                  <li><strong>Visit Type:</strong> {patientOverview.visitType}</li>
                )}
              </ul>
            </div>
          )}

          {/* Main Summary Content (filtered) */}
          <div className="summary-content">
            <ReactMarkdown>{filteredSummary}</ReactMarkdown>
          </div>

          {/* Test Results Cards */}
          {testResults.length > 0 && (
            <div className="test-results-section">
              <div className="test-results-header">
                <h3>🔬 Your Test Results</h3>
                <p className="test-results-subtitle">Click any test to learn more</p>
              </div>
              <div className="test-results-grid">
                {testResults.map((test, index) => (
                  <div
                    key={index}
                    className={`test-result-card ${test.status}`}
                    onClick={() => setSelectedTest(test)}
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="test-header">
                      <div className="test-name">{test.name}</div>
                      <div className={`test-status-badge ${test.status}`}>
                        {test.status === 'normal' && '✓ Normal'}
                        {test.status === 'borderline' && '⚠️ Borderline'}
                        {test.status === 'abnormal' && '🔴 Abnormal'}
                      </div>
                    </div>
                    <div className="test-value">{test.value}</div>
                    {test.explanation && (
                      <div className="test-explanation">{test.explanation}</div>
                    )}
                    <div className="test-progress-bar">
                      <div className={`test-progress-fill ${test.status}`}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Medication Pills Section */}
          {medications.length > 0 && (
            <div className="medications-section">
              <div className="medications-header">
                <h3>💊 Your Medications</h3>
                <p className="medications-subtitle">Click any medication to view detailed analysis</p>
              </div>
              <div className="medication-pills">
                {medications.map((med, index) => (
                  <div
                    key={index}
                    className="medication-pill"
                    onClick={() => handleMedicationClick(med)}
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="pill-name">{med.name}</div>
                    <div className="pill-dosage">
                      {med.dosage && <span>{med.dosage}</span>}
                      {med.frequency && <span> • {med.frequency}</span>}
                    </div>
                    <div className="pill-tap-hint">✨ Tap to analyze</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Drug Interactions Alert */}
          {interactions.length > 0 && (
            <div className="interactions-alert">
              <h3>⚠️ Drug Interactions Found</h3>
              <div className="interactions-list">
                {interactions.map((interaction, index) => (
                  <div key={index} className={`interaction-card ${interaction.severity}`}>
                    <div className="interaction-header">
                      <span className="interaction-drugs">
                        {interaction.drug1} ↔ {interaction.drug2}
                      </span>
                      <span className={`interaction-severity ${interaction.severity}`}>
                        {interaction.severity}
                      </span>
                    </div>
                    <p className="interaction-description">{interaction.description}</p>
                    {interaction.recommendation && (
                      <p className="interaction-recommendation">
                        💡 {interaction.recommendation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="results-footer">
            <button onClick={handleNewUpload} className="upload-another-button">
              Upload Another Document
            </button>
          </div>
        </div>
      )}

      {/* Medication Details Modal */}
      {selectedMedication && (
        <div className="modal-overlay" onClick={closeMedicationModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeMedicationModal}>×</button>

            <div className="modal-header">
              <h2>💊 {selectedMedication}</h2>
            </div>

            {loadingDetails ? (
              <div className="modal-loading">
                <div className="spinner"></div>
                <p>Analyzing medication...</p>
              </div>
            ) : medicationDetails ? (
              <div className="modal-body">
                {/* Drug Profile Section */}
                <div className="detail-section">
                  <h3>📊 Drug Profile</h3>
                  <div className="detail-content">
                    <p><strong>Generic Name:</strong> {medicationDetails.drug_profile.generic_name}</p>
                    {medicationDetails.drug_profile.brand_names.length > 0 && (
                      <p><strong>Brand Names:</strong> {medicationDetails.drug_profile.brand_names.join(', ')}</p>
                    )}
                    <p><strong>FDA Approved:</strong> {medicationDetails.drug_profile.fda_approval_year}</p>
                    <p><strong>Developer:</strong> {medicationDetails.drug_profile.developer}</p>
                    <p><strong>Usage:</strong> {medicationDetails.drug_profile.usage_level}</p>
                  </div>
                </div>

                {/* Dietary Recommendations */}
                <div className="detail-section">
                  <h3>🥗 Natural Support & Diet Tips</h3>
                  <div className="detail-content">
                    {medicationDetails.dietary_recommendations.beneficial_foods.length > 0 && (
                      <div className="diet-subsection">
                        <h4>✓ Foods that support this medication:</h4>
                        <ul>
                          {medicationDetails.dietary_recommendations.beneficial_foods.map((food, i) => (
                            <li key={i}>{food}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {medicationDetails.dietary_recommendations.foods_to_avoid.length > 0 && (
                      <div className="diet-subsection">
                        <h4>⚠️ Foods to avoid:</h4>
                        <ul className="warning-list">
                          {medicationDetails.dietary_recommendations.foods_to_avoid.map((food, i) => (
                            <li key={i}>{food}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {medicationDetails.dietary_recommendations.nutritional_support && (
                      <p className="nutritional-tip">
                        <strong>💡 Tip:</strong> {medicationDetails.dietary_recommendations.nutritional_support}
                      </p>
                    )}
                  </div>
                </div>

                {/* Your Analysis */}
                {medicationDetails.your_analysis && (
                  <div className="detail-section">
                    <h3>⚠️ Your Medication Analysis</h3>
                    <div className="detail-content">
                      {/* Dosage Status */}
                      <div className="analysis-item">
                        <h4>Dosage Status:</h4>
                        <div className={`dosage-badge ${medicationDetails.your_analysis.dosage_status.severity}`}>
                          {medicationDetails.your_analysis.dosage_status.dosage_provided || 'N/A'}
                          {medicationDetails.your_analysis.dosage_status.severity === 'normal' && ' ✓'}
                        </div>
                        <p>{medicationDetails.your_analysis.dosage_status.issue}</p>
                        {medicationDetails.your_analysis.dosage_status.expected_range && (
                          <p className="range-info">
                            Expected range: {medicationDetails.your_analysis.dosage_status.expected_range}
                          </p>
                        )}
                      </div>

                      {/* Interactions */}
                      {medicationDetails.your_analysis.interactions.length > 0 && (
                        <div className="analysis-item">
                          <h4>⚠️ Interactions Found: {medicationDetails.your_analysis.interactions.length}</h4>
                          {medicationDetails.your_analysis.interactions.map((interaction, i) => (
                            <div key={i} className={`interaction-card ${interaction.severity}`}>
                              <div className="interaction-badge">{interaction.severity.toUpperCase()}</div>
                              <p className="interaction-drugs">
                                {interaction.drug1} ↔️ {interaction.drug2}
                              </p>
                              <p className="interaction-description">{interaction.description}</p>
                              <p className="interaction-recommendation">
                                💡 {interaction.recommendation}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {medicationDetails.your_analysis.interactions.length === 0 && (
                        <div className="no-interactions">
                          <p>✓ No interactions found with your other medications</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Side Effects */}
                {medicationDetails.common_side_effects.length > 0 && (
                  <div className="detail-section">
                    <h3>💫 Common Side Effects</h3>
                    <div className="detail-content">
                      <ul className="side-effects-list">
                        {medicationDetails.common_side_effects.map((effect, i) => (
                          <li key={i}>
                            {effect.effect} <span className="frequency">({effect.frequency})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* How It Works */}
                <div className="detail-section">
                  <h3>🔬 How It Works</h3>
                  <div className="detail-content">
                    <p>{medicationDetails.how_it_works}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="modal-error">
                <p>Failed to load medication details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Test Details Modal */}
      {selectedTest && (
        <div className="modal-overlay" onClick={() => setSelectedTest(null)}>
          <div className="modal-content test-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedTest(null)}>×</button>

            <div className="modal-header">
              <h2>🔬 {selectedTest.name}</h2>
            </div>

            <div className="modal-body">
              <div className="detail-section">
                <h3>📊 Your Result</h3>
                <div className="detail-content">
                  <div className={`test-result-display ${selectedTest.status}`}>
                    <div className="result-value">{selectedTest.value}</div>
                    <div className={`result-status ${selectedTest.status}`}>
                      {selectedTest.status === 'normal' && '✓ Within Normal Range'}
                      {selectedTest.status === 'borderline' && '⚠️ Borderline - May Need Attention'}
                      {selectedTest.status === 'abnormal' && '🔴 Outside Normal Range'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>📖 What This Test Measures</h3>
                <div className="detail-content">
                  <p>{selectedTest.explanation || 'This test provides important information about your health.'}</p>
                </div>
              </div>

              <div className="detail-section">
                <h3>💡 What You Can Do</h3>
                <div className="detail-content">
                  {selectedTest.status === 'normal' && (
                    <div className="recommendation-box success">
                      <p><strong>Great job!</strong> Your result is within the normal range.</p>
                      <p>Continue maintaining a healthy lifestyle with balanced diet and regular exercise.</p>
                    </div>
                  )}
                  {selectedTest.status === 'borderline' && (
                    <div className="recommendation-box warning">
                      <p><strong>Consider monitoring:</strong> Your result is borderline.</p>
                      <p>Discuss with your healthcare provider about lifestyle changes or follow-up testing.</p>
                    </div>
                  )}
                  {selectedTest.status === 'abnormal' && (
                    <div className="recommendation-box danger">
                      <p><strong>Action needed:</strong> Your result is outside the normal range.</p>
                      <p>Please consult with your healthcare provider to discuss next steps and treatment options.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return (
    <div className="app">
      <Navigation currentView={currentView} onNavigate={handleNavigate} />

      <div className="container">
        {currentView === 'upload' && (
          <header className="header">
            <h1>🏥 MedEase</h1>
            <p className="subtitle">Transform complex medical records into clear, understandable summaries</p>
          </header>
        )}

        {renderView()}
      </div>
    </div>
  )
}

export default App
