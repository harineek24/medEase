import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../api'
import {
  FileText,
  Pill,
  TestTube,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Stethoscope,
  Upload,
  RefreshCw,
} from 'lucide-react'

interface SummaryItem {
  id: number
  patient_name: string
  diagnosis: string
  visit_date: string
  visit_location: string
  created_at: string
  original_filename: string
}

interface Medication {
  id: number
  name: string
  dosage?: string
  frequency?: string
  purpose?: string
}

interface TestResult {
  id: number
  test_name: string
  value: string
  unit?: string
  status: string
  explanation?: string
}

interface Interaction {
  id: number
  drug1: string
  drug2: string
  severity: string
  description: string
  recommendation: string
}

interface SummaryDetail extends SummaryItem {
  raw_summary: string
  medications: Medication[]
  test_results: TestResult[]
  interactions: Interaction[]
}

interface UpdatesProps {
  onNavigate: (view: string) => void
}

export default function Updates({ onNavigate }: UpdatesProps) {
  const [summaries, setSummaries] = useState<SummaryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailCache, setDetailCache] = useState<Record<number, SummaryDetail>>({})
  const [detailLoading, setDetailLoading] = useState<number | null>(null)

  const fetchSummaries = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/history?limit=20`)
      if (response.ok) {
        const data = await response.json()
        setSummaries(data.summaries || [])
        // Auto-expand the latest one
        if (data.summaries?.length > 0 && expandedId === null) {
          const latestId = data.summaries[0].id
          setExpandedId(latestId)
          fetchDetail(latestId)
        }
      } else {
        setError('Failed to load updates')
      }
    } catch {
      setError('Could not connect to server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummaries()
  }, [fetchSummaries])

  const fetchDetail = async (id: number) => {
    if (detailCache[id]) return
    setDetailLoading(id)
    try {
      const response = await fetch(`${API_BASE_URL}/api/history/${id}`)
      if (response.ok) {
        const data = await response.json()
        setDetailCache(prev => ({ ...prev, [id]: data }))
      }
    } catch {
      // silent fail - detail just won't expand
    } finally {
      setDetailLoading(null)
    }
  }

  const toggleExpand = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      fetchDetail(id)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    const diffDays = diffMs / (1000 * 60 * 60 * 24)

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`
    if (diffDays < 7) return `${Math.floor(diffDays)}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const statusColor = (status: string) => {
    if (status === 'normal') return 'bg-green-100 text-green-700'
    if (status === 'borderline') return 'bg-yellow-100 text-yellow-700'
    return 'bg-red-100 text-red-700'
  }

  const severityColor = (severity: string) => {
    const s = severity?.toLowerCase()
    if (s === 'severe' || s === 'high') return 'bg-red-100 text-red-700 border-red-200'
    if (s === 'moderate' || s === 'medium') return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    return 'bg-blue-100 text-blue-700 border-blue-200'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#45BFD3] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading your updates...</p>
        </div>
      </div>
    )
  }

  if (summaries.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-[#45BFD3]/10 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-[#45BFD3]" />
          </div>
          <h2 className="text-2xl font-light text-gray-900 mb-2">No Updates Yet</h2>
          <p className="text-gray-500 text-sm mb-6">
            Upload a medical document to see your health results and findings here. Your data is saved automatically and will always be available.
          </p>
          <button
            onClick={() => onNavigate('upload')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#45BFD3] text-white text-sm font-medium hover:bg-[#3dafc2] transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Document
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-light text-gray-900">Your Updates</h2>
          <p className="text-sm text-gray-400 mt-1">
            {summaries.length} report{summaries.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        <button
          onClick={fetchSummaries}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchSummaries} className="text-red-600 font-medium hover:underline">Retry</button>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-4">
        {summaries.map((summary, index) => {
          const isExpanded = expandedId === summary.id
          const detail = detailCache[summary.id]
          const isLoadingDetail = detailLoading === summary.id
          const isLatest = index === 0

          return (
            <div
              key={summary.id}
              className={`rounded-2xl border transition-all duration-200 ${
                isExpanded
                  ? 'border-[#45BFD3]/30 shadow-md bg-white'
                  : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
              }`}
            >
              {/* Card header - always visible */}
              <button
                onClick={() => toggleExpand(summary.id)}
                className="w-full p-5 flex items-start justify-between text-left"
              >
                <div className="flex items-start gap-4 min-w-0">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isLatest ? 'bg-[#45BFD3]/10' : 'bg-gray-100'
                  }`}>
                    <FileText className={`w-5 h-5 ${isLatest ? 'text-[#45BFD3]' : 'text-gray-400'}`} />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-gray-900 truncate">
                        {summary.patient_name || 'Medical Report'}
                      </h3>
                      {isLatest && (
                        <span className="px-2 py-0.5 rounded-full bg-[#45BFD3]/10 text-[#45BFD3] text-xs font-medium">
                          Latest
                        </span>
                      )}
                    </div>

                    {summary.diagnosis && (
                      <p className="text-sm text-gray-500 mt-0.5 truncate">
                        {summary.diagnosis}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(summary.created_at)}
                      </span>
                      {summary.visit_location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {summary.visit_location}
                        </span>
                      )}
                      {summary.visit_date && (
                        <span className="flex items-center gap-1">
                          <Stethoscope className="w-3 h-3" />
                          Visit: {summary.visit_date}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 ml-3 mt-1">
                  {isExpanded
                    ? <ChevronUp className="w-5 h-5 text-gray-400" />
                    : <ChevronDown className="w-5 h-5 text-gray-400" />
                  }
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-gray-50">
                  {isLoadingDetail ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-[#45BFD3] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : detail ? (
                    <div className="mt-4 space-y-5">
                      {/* Quick stats row */}
                      <div className="flex gap-3 flex-wrap">
                        {detail.test_results?.length > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 text-xs font-medium">
                            <TestTube className="w-3.5 h-3.5" />
                            {detail.test_results.length} test result{detail.test_results.length !== 1 ? 's' : ''}
                          </div>
                        )}
                        {detail.medications?.length > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                            <Pill className="w-3.5 h-3.5" />
                            {detail.medications.length} medication{detail.medications.length !== 1 ? 's' : ''}
                          </div>
                        )}
                        {detail.interactions?.length > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {detail.interactions.length} interaction{detail.interactions.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>

                      {/* Test Results */}
                      {detail.test_results?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                            <TestTube className="w-4 h-4 text-purple-500" />
                            Test Results
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {detail.test_results.map((test) => (
                              <div
                                key={test.id}
                                className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-800 truncate">{test.test_name}</p>
                                  {test.explanation && (
                                    <p className="text-xs text-gray-400 truncate">{test.explanation}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <span className="text-sm font-semibold text-gray-700">{test.value}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(test.status)}`}>
                                    {test.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Medications */}
                      {detail.medications?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                            <Pill className="w-4 h-4 text-blue-500" />
                            Medications
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {detail.medications.map((med) => (
                              <div
                                key={med.id}
                                className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-100"
                              >
                                <span className="text-sm font-medium text-blue-800">{med.name}</span>
                                {(med.dosage || med.frequency) && (
                                  <span className="text-xs text-blue-500 ml-1.5">
                                    {[med.dosage, med.frequency].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Interactions */}
                      {detail.interactions?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Drug Interactions
                          </h4>
                          <div className="space-y-2">
                            {detail.interactions.map((inter) => (
                              <div
                                key={inter.id}
                                className={`p-3 rounded-xl border ${severityColor(inter.severity)}`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium">
                                    {inter.drug1} + {inter.drug2}
                                  </span>
                                  <span className="text-xs font-semibold uppercase">
                                    {inter.severity}
                                  </span>
                                </div>
                                {inter.description && (
                                  <p className="text-xs opacity-80">{inter.description}</p>
                                )}
                                {inter.recommendation && (
                                  <p className="text-xs opacity-70 mt-1 italic">{inter.recommendation}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* No findings */}
                      {(!detail.test_results?.length && !detail.medications?.length && !detail.interactions?.length) && (
                        <p className="text-sm text-gray-400 text-center py-4">
                          No detailed findings were extracted from this document.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">
                      Could not load details for this report.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
