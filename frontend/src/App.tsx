import { useState, DragEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

type AppState = 'upload' | 'processing' | 'results'

interface SummaryData {
  summary: string
  markdown_path: string
  patient_name: string
  date_processed: string
}

function App() {
  const [appState, setAppState] = useState<AppState>('upload')
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [error, setError] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const [dragActive, setDragActive] = useState(false)

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

  // Reset to upload state
  const handleNewUpload = () => {
    setAppState('upload')
    setSummaryData(null)
    setError('')
    setFileName('')
  }

  return (
    <div className="app">
      <div className="container">
        {/* Header */}
        <header className="header">
          <h1>🏥 MedEase</h1>
          <p className="subtitle">Transform complex medical records into clear, understandable summaries</p>
        </header>

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
              </div>
            </div>

            <div className="disclaimer">
              <strong>⚠️ Medical Disclaimer:</strong> This summary is AI-generated and for informational purposes only.
              It is NOT medical advice. Always consult with your healthcare provider about your medical conditions and treatment.
            </div>

            <div className="summary-content">
              <ReactMarkdown>{summaryData.summary}</ReactMarkdown>
            </div>

            <div className="results-footer">
              <button onClick={handleNewUpload} className="upload-another-button">
                Upload Another Document
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
