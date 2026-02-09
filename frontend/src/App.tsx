import { useState, useRef, DragEvent, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { API_BASE_URL } from './api'
import './App.css'

// Import components
import PatientChat from './components/PatientChat'
import GeneralChat from './components/GeneralChat'
import HealthHistory from './components/patient/HealthHistory'
import PatientUpdates from './components/patient/PatientUpdates'
import AppointmentBooking from './components/patient/AppointmentBooking'
import HealthAppointmentCards from './components/patient/HealthAppointmentCards'
import VoiceConsult from './components/VoiceConsult'
import { HelixScene } from './components/ui/helix-scene'
import { Ripple } from './components/ui/material-design-3-ripple'
import BlurEffect from 'react-progressive-blur'
import { Upload, Shield, Zap, MessageSquare, Stethoscope } from 'lucide-react'
import AppRouter from '@/AppRouter'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'

type AppState = 'upload' | 'processing' | 'results'

// Extended view type that includes the new patient-portal views
export type PatientView = 'upload' | 'dashboard' | 'history' | 'chat' | 'consult' | 'config' | 'updates' | 'appointments'

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
  unit?: string
  reference_range?: string
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

/* ------------------------------------------------------------------ */
/*  PatientApp -- the full patient experience, used by PatientLayout   */
/* ------------------------------------------------------------------ */

interface PatientAppProps {
  currentView: PatientView
  onNavigate: (view: PatientView) => void
}

export function PatientApp({ currentView, onNavigate }: PatientAppProps) {
  const { patientId } = useAuth()
  // Upload flow state
  const [appState, setAppState] = useState<AppState>('upload')
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [error, setError] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  // Health dashboard chart state
  const [selectedHealthCard, setSelectedHealthCard] = useState<string | null>(null)
  const [chartData, setChartData] = useState<Array<{value: number; date: string; filename?: string}>>([])
  const [chartLoading, setChartLoading] = useState(false)
  type HealthTimeRange = '1d' | '1w' | '1m' | '1y' | 'all'
  const [healthTimeRange, setHealthTimeRange] = useState<HealthTimeRange>('all')

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
      const response = await fetch(`${API_BASE_URL}/api/summarize`, {
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
      // Auto-save happens in a separate useEffect after AI extraction completes
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
      const response = await fetch(`${API_BASE_URL}/api/save-summary`, {
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
            unit: t.unit || null,
            reference_range: t.reference_range || null,
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
    } catch (_err) {
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

  // Extract data from summary when it's generated, then auto-save
  useEffect(() => {
    const extractData = async () => {
      if (summaryData && summaryData.summary) {
        let extractedMeds: Medication[] = []
        let extractedInteractions: DrugInteraction[] = []
        let extractedTests: TestResult[] = []

        // Extract medications
        try {
          const medsResponse = await fetch(`${API_BASE_URL}/api/extract-medications`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ summary: summaryData.summary }),
          })

          if (medsResponse.ok) {
            const medsData = await medsResponse.json()
            extractedMeds = medsData.medications || []
            setMedications(extractedMeds)

            // Analyze medications for interactions
            if (extractedMeds.length > 1) {
              try {
                const analysisResponse = await fetch(`${API_BASE_URL}/api/analyze-medications`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ medications: extractedMeds }),
                })

                if (analysisResponse.ok) {
                  const analysisData = await analysisResponse.json()
                  extractedInteractions = analysisData.interactions || []
                  setInteractions(extractedInteractions)
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
          const overviewResponse = await fetch(`${API_BASE_URL}/api/extract-patient-overview`, {
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
          const testsResponse = await fetch(`${API_BASE_URL}/api/extract-test-results`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ summary: summaryData.summary }),
          })

          if (testsResponse.ok) {
            const testsData = await testsResponse.json()
            extractedTests = testsData.test_results || []
            setTestResults(extractedTests)
          }
        } catch (err) {
          console.error('Error extracting test results:', err)
        }

        // Filter summary to remove sections we're displaying separately
        const filtered = filterSummary(summaryData.summary)
        setFilteredSummary(filtered)

        // Auto-save to database AFTER all AI extraction is complete
        try {
          await fetch(`${API_BASE_URL}/api/save-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patient_name: summaryData.patient_name || 'Unknown Patient',
              raw_summary: summaryData.summary,
              file_path: summaryData.markdown_path,
              original_filename: fileName,
              diagnosis: '',
              visit_date: null,
              visit_location: null,
              medications: extractedMeds,
              test_results: extractedTests,
              interactions: extractedInteractions
            }),
          })
          setSaveStatus('saved')
        } catch {
          // Silent fail for auto-save — user can still manually save later
        }
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
      const response = await fetch(`${API_BASE_URL}/api/medication-details`, {
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
      // Get the heading line (first line of each section) and normalize it
      const headingLine = section.split('\n')[0].toLowerCase()
        .replace(/[^\w\s]/g, '') // strip emojis and special chars
        .trim()
      return !headingLine.includes('quick overview') &&
             !headingLine.includes('your medications') &&
             !headingLine.includes('test results') &&
             !headingLine.includes('drug interaction')
    })
    return filtered.join('\n')
  }

  // Parse numeric value from test result strings like "120/80 mmHg", "72 bpm", "98%"
  const parseNumeric = (val: string): number => {
    const m = val.match(/[\d.]+/)
    return m ? parseFloat(m[0]) : 0
  }

  // Fetch chart history when a card is clicked
  const fetchChartHistory = useCallback(async (testName: string) => {
    setSelectedHealthCard(testName)
    setChartLoading(true)
    setHealthTimeRange('all')
    try {
      const res = await fetch(`${API_BASE_URL}/api/test-results/history/${encodeURIComponent(testName)}`)
      if (res.ok) {
        const data = await res.json()
        const parsed = data.map((d: { value: string; created_at: string; original_filename?: string }) => ({
          value: parseNumeric(d.value || '0'),
          date: d.created_at,
          filename: d.original_filename
        }))
        setChartData(parsed)
      }
    } catch (err) {
      console.error('Error fetching chart history:', err)
    } finally {
      setChartLoading(false)
    }
  }, [])

  // Filter chart data by time range
  const getFilteredChartData = useCallback(() => {
    if (healthTimeRange === 'all') return chartData
    const now = Date.now()
    const msMap: Record<string, number> = {
      '1d': 86_400_000,
      '1w': 604_800_000,
      '1m': 2_592_000_000,
      '1y': 31_536_000_000,
    }
    const cutoff = now - (msMap[healthTimeRange] || 0)
    return chartData.filter(d => new Date(d.date).getTime() >= cutoff)
  }, [chartData, healthTimeRange])

  // Compact health dashboard for the updates page right column
  const renderHealthDashboard = () => {
    if (testResults.length === 0) return null

    const statusColor = (status: string) => {
      if (status === 'normal') return 'bg-green-50 border-green-200 text-green-700'
      if (status === 'borderline') return 'bg-yellow-50 border-yellow-200 text-yellow-700'
      return 'bg-red-50 border-red-200 text-red-700'
    }

    const statusBadge = (status: string) => {
      if (status === 'normal') return 'bg-green-100 text-green-700'
      if (status === 'borderline') return 'bg-yellow-100 text-yellow-700'
      return 'bg-red-100 text-red-700'
    }

    const vitalKeywords = ['blood pressure', 'bp', 'systolic', 'heart rate', 'pulse', 'oxygen', 'spo2', 'temperature', 'temp', 'respiratory', 'glucose', 'blood sugar']
    const vitalResults = testResults.filter(t => vitalKeywords.some(k => t.name.toLowerCase().includes(k)))
    const labResults = testResults.filter(t => !vitalKeywords.some(k => t.name.toLowerCase().includes(k)))

    const filteredChart = getFilteredChartData()
    const chartValues = filteredChart.map(d => d.value)
    const chartMin = chartValues.length > 0 ? Math.min(...chartValues) : 0
    const chartMax = chartValues.length > 0 ? Math.max(...chartValues) : 0
    const chartAvg = chartValues.length > 0 ? Math.round((chartValues.reduce((a, b) => a + b, 0) / chartValues.length) * 10) / 10 : 0
    const chartRange = chartMax - chartMin || 1

    const timeRangeLabels: Record<string, string> = { '1d': '1D', '1w': '1W', '1m': '1M', '1y': '1Y', all: 'All' }

    const svgW = 400, svgH = 180
    const pad = { top: 20, right: 15, bottom: 30, left: 40 }
    const innerW = svgW - pad.left - pad.right
    const innerH = svgH - pad.top - pad.bottom

    const chartPoints = filteredChart.map((d, i) => ({
      x: pad.left + (filteredChart.length > 1 ? (i / (filteredChart.length - 1)) * innerW : innerW / 2),
      y: pad.top + innerH - ((d.value - chartMin) / chartRange) * innerH,
      d,
    }))

    const linePath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    const areaPath = chartPoints.length > 0
      ? linePath + ` L${chartPoints[chartPoints.length - 1].x},${pad.top + innerH} L${chartPoints[0].x},${pad.top + innerH} Z`
      : ''
    const yTickCount = 4
    const yTicks = Array.from({ length: yTickCount }, (_, i) =>
      Math.round((chartMin + (chartRange * i) / (yTickCount - 1)) * 10) / 10
    )
    const xLabelCount = Math.min(4, filteredChart.length)
    const xLabels = xLabelCount > 0 ? Array.from({ length: xLabelCount }, (_, i) => {
      const idx = Math.round((i / Math.max(xLabelCount - 1, 1)) * (filteredChart.length - 1))
      const d = new Date(filteredChart[idx].date)
      return { label: `${d.getMonth() + 1}/${d.getDate()}`, x: chartPoints[idx].x }
    }) : []

    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#8BC34A]/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-[#8BC34A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Health Dashboard</h3>
            <p className="text-xs text-gray-400">From your latest document</p>
          </div>
        </div>

        {/* Vital cards - compact 2-column */}
        {vitalResults.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {vitalResults.map((test, i) => (
              <div
                key={i}
                onClick={() => fetchChartHistory(test.name)}
                className={`rounded-xl border p-3 cursor-pointer transition-all duration-200 hover:shadow-md ${
                  selectedHealthCard === test.name ? 'ring-2 ring-[#8BC34A] shadow-md' : ''
                } ${statusColor(test.status)}`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70 mb-0.5">{test.name}</p>
                <p className="text-xl font-bold">{test.value}</p>
                <span className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusBadge(test.status)}`}>
                  {test.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Expanded chart panel */}
        {selectedHealthCard && (
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">{selectedHealthCard}</h4>
                <p className="text-xs text-gray-400">{filteredChart.length} reading{filteredChart.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setSelectedHealthCard(null)} className="text-gray-400 hover:text-gray-600 text-sm">x</button>
            </div>
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {(Object.keys(timeRangeLabels) as HealthTimeRange[]).map(key => (
                <button
                  key={key}
                  onClick={() => setHealthTimeRange(key)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                    healthTimeRange === key
                      ? 'bg-[#8BC34A] text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {timeRangeLabels[key]}
                </button>
              ))}
            </div>

            {chartLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="h-6 w-6 rounded-full border-2 border-[#8BC34A] border-t-transparent animate-spin" />
              </div>
            ) : filteredChart.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-gray-400 text-xs">No data for this range.</div>
            ) : (
              <>
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto mb-3">
                  {yTicks.map(val => {
                    const y = pad.top + innerH - ((val - chartMin) / chartRange) * innerH
                    return (
                      <g key={val}>
                        <line x1={pad.left} x2={svgW - pad.right} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 2" />
                        <text x={pad.left - 4} y={y + 3} textAnchor="end" className="text-[9px] fill-gray-400">{val}</text>
                      </g>
                    )
                  })}
                  {xLabels.map((lbl, i) => (
                    <text key={i} x={lbl.x} y={svgH - 6} textAnchor="middle" className="text-[8px] fill-gray-400">{lbl.label}</text>
                  ))}
                  <path d={areaPath} fill="url(#healthGradCompact)" />
                  <defs>
                    <linearGradient id="healthGradCompact" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8BC34A" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#8BC34A" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <path d={linePath} fill="none" stroke="#8BC34A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  {chartPoints.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={3} fill="#8BC34A" stroke="#fff" strokeWidth={1.5} />
                  ))}
                </svg>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-[#8BC34A]/10 p-2 text-center">
                    <p className="text-[10px] text-[#6a9a2e] font-semibold">Max</p>
                    <p className="text-lg font-bold text-[#6a9a2e]">{chartMax}</p>
                  </div>
                  <div className="rounded-lg bg-[#8BC34A]/10 p-2 text-center">
                    <p className="text-[10px] text-[#6a9a2e] font-semibold">Min</p>
                    <p className="text-lg font-bold text-[#6a9a2e]">{chartMin}</p>
                  </div>
                  <div className="rounded-lg bg-gray-100 p-2 text-center">
                    <p className="text-[10px] text-gray-500 font-semibold">Avg</p>
                    <p className="text-lg font-bold text-gray-700">{chartAvg}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Lab Results - compact single column */}
        {labResults.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-800 mb-2">Lab Results</h4>
            <div className="space-y-2">
              {labResults.map((test, i) => (
                <div
                  key={i}
                  onClick={() => fetchChartHistory(test.name)}
                  className={`rounded-lg border p-3 flex items-center justify-between cursor-pointer transition-all hover:shadow-md ${
                    selectedHealthCard === test.name ? 'ring-2 ring-[#8BC34A] shadow-md' : ''
                  } ${statusColor(test.status)}`}
                >
                  <div>
                    <p className="font-medium text-xs">{test.name}</p>
                    {test.explanation && <p className="text-[10px] opacity-70 mt-0.5">{test.explanation}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{test.value}</p>
                    <span className={`inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusBadge(test.status)}`}>
                      {test.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Combined updates view: left column (appointments + queries), right column (doctor updates + health dashboard)
  const renderUpdatesView = () => {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            <HealthAppointmentCards patientId={patientId ?? 1} onNavigate={onNavigate} />
            <PatientUpdates />
          </div>

          {/* Right column — 1/3 */}
          <div className="space-y-6">
            {/* Doctor Updates placeholder */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-[#45BFD3]/10 flex items-center justify-center">
                  <Stethoscope className="w-4 h-4 text-[#45BFD3]" />
                </div>
                <h3 className="text-base font-semibold text-gray-900">Doctor Updates</h3>
              </div>
              <div className="text-center py-6">
                <Stethoscope className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-400">Updates from your doctor will appear here</p>
              </div>
            </div>

            {/* Health Dashboard (vitals, charts, labs) */}
            {renderHealthDashboard()}
          </div>
        </div>
      </div>
    )
  }

  // Render the appropriate view
  const renderView = () => {
    switch (currentView) {
      case 'history':
        return <HealthHistory onNavigate={(v) => onNavigate(v as PatientView)} />

      case 'chat':
        return <GeneralChat />

      case 'consult':
        return <VoiceConsult />

      case 'updates':
        return renderUpdatesView()

      case 'appointments':
        return <AppointmentBooking patientId={patientId ?? 1} />

      case 'upload':
      default:
        return renderUploadView()
    }
  }

  // Upload view (original functionality)
  const renderUploadView = () => (
    <>
      {/* Upload State - Full page with helix */}
      {appState === 'upload' && (
        <section className="relative min-h-screen w-full font-sans tracking-tight text-gray-900 bg-white overflow-hidden -mt-4">
          {/* 3D Helix Background */}
          <div className="absolute inset-0 z-0">
            <HelixScene />
          </div>

          {/* Content */}
          <div className="relative z-20 flex flex-col items-start justify-center min-h-screen px-6 md:px-12 max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-3 text-gray-900">
              Upload Document
            </h1>
            <p className="text-gray-600 text-base md:text-lg leading-relaxed font-light tracking-tight mb-8">
              Transform your medical records into clear, understandable insights
            </p>

            {/* Error message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm w-full">
                {error}
              </div>
            )}

            {/* Upload Card */}
            <div className="w-full max-w-md">
              <Ripple
                className="cursor-pointer rounded-2xl"
                color="text-[#45BFD3]"
                opacity={0.15}
              >
                <div
                  className={`p-8 bg-white/80 backdrop-blur-sm border-2 border-dashed rounded-2xl transition-all duration-200 ${
                    dragActive ? 'border-[#45BFD3] bg-[#45BFD3]/5' : 'border-gray-200 hover:border-[#45BFD3]/50'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-[#45BFD3]/10 flex items-center justify-center mb-4">
                      <Upload className="w-8 h-8 text-[#45BFD3]" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Drop your medical document here
                    </h3>
                    <p className="text-gray-500 text-sm mb-4">or</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        fileInputRef.current?.click()
                      }}
                      className="px-6 py-2.5 bg-[#45BFD3] hover:bg-[#3aa8ba] text-white font-medium rounded-lg transition-all duration-200 cursor-pointer"
                    >
                      Choose File
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleFileInput}
                      style={{ display: 'none' }}
                    />
                    <p className="text-gray-400 text-xs mt-4">
                      Supports PDF, PNG, JPG (max 25MB)
                    </p>
                  </div>
                </div>
              </Ripple>
            </div>

            {/* Feature highlights - minimal */}
            <div className="flex flex-wrap gap-6 mt-8 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#45BFD3]" />
                <span>Secure & Private</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#45BFD3]" />
                <span>Fast Processing</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#45BFD3]" />
                <span>Plain English</span>
              </div>
            </div>
          </div>

          {/* Blur effects */}
          <BlurEffect
            className="absolute bg-gradient-to-b from-transparent to-white/20 h-1/3 w-full bottom-0 z-10 pointer-events-none"
            position="bottom"
            intensity={50}
          />
          <BlurEffect
            className="absolute bg-gradient-to-b from-white/20 to-transparent h-1/3 w-full top-0 z-10 pointer-events-none"
            position="top"
            intensity={50}
          />
        </section>
      )}

      {/* Processing State */}
      {appState === 'processing' && (
        <section className="relative min-h-screen w-full font-sans tracking-tight text-gray-900 bg-white overflow-hidden -mt-4">
          <div className="absolute inset-0 z-0">
            <HelixScene />
          </div>
          <div className="relative z-20 flex flex-col items-center justify-center min-h-screen px-6">
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-12 shadow-xl border border-gray-100 text-center max-w-md">
              <div className="w-16 h-16 border-4 border-[#45BFD3] border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
              <h2 className="text-2xl font-light text-gray-900 mb-2">Analyzing {fileName}</h2>
              <p className="text-gray-500 text-sm mb-6">This usually takes 10-20 seconds</p>
              <div className="space-y-3 text-left">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-[#45BFD3] flex items-center justify-center text-white text-xs">1</div>
                  <span className="text-gray-700">Reading document</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-[#45BFD3] flex items-center justify-center text-white text-xs">2</div>
                  <span className="text-[#45BFD3] font-medium">Analyzing medical content...</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">3</div>
                  <span className="text-gray-400">Generating summary</span>
                </div>
              </div>
            </div>
          </div>
          <BlurEffect
            className="absolute bg-gradient-to-b from-transparent to-white/20 h-1/3 w-full bottom-0 z-10 pointer-events-none"
            position="bottom"
            intensity={50}
          />
        </section>
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
                New Upload
              </button>
              <button onClick={handlePrint} className="action-button secondary">
                Print
              </button>
              <button onClick={handleDownload} className="action-button primary">
                Download
              </button>
              <button
                onClick={handleSaveToHistory}
                className={`action-button ${saveStatus === 'saved' ? 'success' : 'save'}`}
                disabled={saveStatus === 'saving' || saveStatus === 'saved'}
              >
                {saveStatus === 'idle' && 'Save'}
                {saveStatus === 'saving' && 'Saving...'}
                {saveStatus === 'saved' && 'Saved'}
                {saveStatus === 'error' && 'Retry'}
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
            <strong>Medical Disclaimer:</strong> This summary is AI-generated and for informational purposes only.
            It is NOT medical advice. Always consult with your healthcare provider about your medical conditions and treatment.
          </div>

          {/* Patient Overview - Simple Bullet Points */}
          {patientOverview && (
            <div className="patient-overview-simple">
              <h3>Patient Overview</h3>
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
                <h3>Your Test Results</h3>
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
                        {test.status === 'normal' && 'Normal'}
                        {test.status === 'borderline' && 'Borderline'}
                        {test.status === 'abnormal' && 'Abnormal'}
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
                <h3>Your Medications</h3>
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
                      {med.frequency && <span> - {med.frequency}</span>}
                    </div>
                    <div className="pill-tap-hint">Tap to analyze</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Drug Interactions Alert */}
          {interactions.length > 0 && (
            <div className="interactions-alert">
              <h3>Drug Interactions Found</h3>
              <div className="interactions-list">
                {interactions.map((interaction, index) => (
                  <div key={index} className={`interaction-card ${interaction.severity}`}>
                    <div className="interaction-header">
                      <span className="interaction-drugs">
                        {interaction.drug1} - {interaction.drug2}
                      </span>
                      <span className={`interaction-severity ${interaction.severity}`}>
                        {interaction.severity}
                      </span>
                    </div>
                    <p className="interaction-description">{interaction.description}</p>
                    {interaction.recommendation && (
                      <p className="interaction-recommendation">
                        {interaction.recommendation}
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
            <button className="modal-close" onClick={closeMedicationModal}>x</button>

            <div className="modal-header">
              <h2>{selectedMedication}</h2>
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
                  <h3>Drug Profile</h3>
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
                  <h3>Natural Support & Diet Tips</h3>
                  <div className="detail-content">
                    {medicationDetails.dietary_recommendations.beneficial_foods.length > 0 && (
                      <div className="diet-subsection">
                        <h4>Foods that support this medication:</h4>
                        <ul>
                          {medicationDetails.dietary_recommendations.beneficial_foods.map((food, i) => (
                            <li key={i}>{food}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {medicationDetails.dietary_recommendations.foods_to_avoid.length > 0 && (
                      <div className="diet-subsection">
                        <h4>Foods to avoid:</h4>
                        <ul className="warning-list">
                          {medicationDetails.dietary_recommendations.foods_to_avoid.map((food, i) => (
                            <li key={i}>{food}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {medicationDetails.dietary_recommendations.nutritional_support && (
                      <p className="nutritional-tip">
                        <strong>Tip:</strong> {medicationDetails.dietary_recommendations.nutritional_support}
                      </p>
                    )}
                  </div>
                </div>

                {/* Your Analysis */}
                {medicationDetails.your_analysis && (
                  <div className="detail-section">
                    <h3>Your Medication Analysis</h3>
                    <div className="detail-content">
                      {/* Dosage Status */}
                      <div className="analysis-item">
                        <h4>Dosage Status:</h4>
                        <div className={`dosage-badge ${medicationDetails.your_analysis.dosage_status.severity}`}>
                          {medicationDetails.your_analysis.dosage_status.dosage_provided || 'N/A'}
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
                          <h4>Interactions Found: {medicationDetails.your_analysis.interactions.length}</h4>
                          {medicationDetails.your_analysis.interactions.map((interaction, i) => (
                            <div key={i} className={`interaction-card ${interaction.severity}`}>
                              <div className="interaction-badge">{interaction.severity.toUpperCase()}</div>
                              <p className="interaction-drugs">
                                {interaction.drug1} - {interaction.drug2}
                              </p>
                              <p className="interaction-description">{interaction.description}</p>
                              <p className="interaction-recommendation">
                                {interaction.recommendation}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {medicationDetails.your_analysis.interactions.length === 0 && (
                        <div className="no-interactions">
                          <p>No interactions found with your other medications</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Side Effects */}
                {medicationDetails.common_side_effects.length > 0 && (
                  <div className="detail-section">
                    <h3>Common Side Effects</h3>
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
                  <h3>How It Works</h3>
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
            <button className="modal-close" onClick={() => setSelectedTest(null)}>x</button>

            <div className="modal-header">
              <h2>{selectedTest.name}</h2>
            </div>

            <div className="modal-body">
              <div className="detail-section">
                <h3>Your Result</h3>
                <div className="detail-content">
                  <div className={`test-result-display ${selectedTest.status}`}>
                    <div className="result-value">{selectedTest.value}</div>
                    <div className={`result-status ${selectedTest.status}`}>
                      {selectedTest.status === 'normal' && 'Within Normal Range'}
                      {selectedTest.status === 'borderline' && 'Borderline - May Need Attention'}
                      {selectedTest.status === 'abnormal' && 'Outside Normal Range'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>What This Test Measures</h3>
                <div className="detail-content">
                  <p>{selectedTest.explanation || 'This test provides important information about your health.'}</p>
                </div>
              </div>

              <div className="detail-section">
                <h3>What You Can Do</h3>
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

  // Render the patient content (Navigation is handled by PatientLayout)
  return (
    <div className={currentView === 'upload' && appState === 'upload' ? '' : 'container'}>
      {currentView === 'upload' && appState === 'results' && (
        <header className="header">
          <h1>MedEase</h1>
          <p className="subtitle">Transform complex medical records into clear, understandable summaries</p>
        </header>
      )}

      {renderView()}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Default export -- the routed App with AuthProvider + AppRouter      */
/* ------------------------------------------------------------------ */

function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}

export default App
