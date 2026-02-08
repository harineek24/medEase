import { useState, useEffect, useCallback, useMemo } from 'react'
import { API_BASE_URL } from '../../api'
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Droplets,
  Thermometer,
  Wind,
  Activity,
  TestTube,
  FileText,
  Upload,
  X,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────
interface TestName {
  test_name: string
  status: string
  latest_at: string
}

interface HistoryPoint {
  id: number
  test_name: string
  value: string
  unit: string | null
  status: string
  reference_range: string | null
  created_at: string
  original_filename: string | null
  visit_date: string | null
}

interface SummaryItem {
  id: number
  patient_name: string
  raw_summary: string
  diagnosis: string
  visit_date: string
  visit_location: string
  created_at: string
}

type HealthTimeRange = '1d' | '1w' | '1m' | '1y' | 'all'

interface HealthHistoryProps {
  onNavigate: (view: string) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────
const parseNumeric = (val: string): number => {
  const m = val.match(/[\d.]+/)
  return m ? parseFloat(m[0]) : 0
}

const iconFor = (name: string) => {
  const n = name.toLowerCase()
  if (n.includes('heart') || n.includes('pulse')) return Heart
  if (n.includes('blood') || n.includes('bp') || n.includes('systolic') || n.includes('diastolic')) return Droplets
  if (n.includes('temp')) return Thermometer
  if (n.includes('respiratory') || n.includes('oxygen') || n.includes('spo2')) return Wind
  if (n.includes('glucose') || n.includes('sugar') || n.includes('cholesterol')) return Activity
  return TestTube
}

const vitalKeywords = ['blood pressure', 'bp', 'systolic', 'diastolic', 'heart rate', 'pulse', 'oxygen', 'spo2', 'temperature', 'temp', 'respiratory', 'glucose', 'blood sugar']
const isVital = (name: string) => vitalKeywords.some(k => name.toLowerCase().includes(k))

/** Color classes based on test status */
const statusStyles = (status: string) => {
  if (status === 'normal') return {
    border: 'border-[#8BC34A]/40',
    bg: 'bg-[#8BC34A]/5',
    text: 'text-[#4a7c0f]',
    badge: 'bg-[#8BC34A]/15 text-[#4a7c0f]',
    value: 'text-[#4a7c0f]',
  }
  if (status === 'borderline') return {
    border: 'border-yellow-300',
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    badge: 'bg-yellow-100 text-yellow-700',
    value: 'text-yellow-700',
  }
  return {
    border: 'border-red-300',
    bg: 'bg-red-50',
    text: 'text-red-600',
    badge: 'bg-red-100 text-red-600',
    value: 'text-red-600',
  }
}

/** Extract "What Happened" section from raw_summary markdown */
const extractWhatHappened = (raw: string): string => {
  if (!raw) return ''
  // Look for the "What Happened" section
  const regex = /##\s*(?:❤️\s*)?What Happened\s*\n([\s\S]*?)(?=\n##\s|\n---|\n\*\*|$)/i
  const match = raw.match(regex)
  if (match && match[1]) {
    return match[1].trim().replace(/^[-*]\s+/gm, '').replace(/\n+/g, ' ').trim()
  }
  // Fallback: return first meaningful paragraph
  const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'))
  return lines.slice(0, 2).join(' ').trim()
}

// ─── Mini sparkline SVG ──────────────────────────────────────────────
function Sparkline({ values, color = '#8BC34A' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null
  const w = 80, h = 32, pad = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (w - pad * 2),
    y: pad + (1 - (v - min) / range) * (h - pad * 2),
  }))
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const area = line + ` L${points[points.length - 1].x},${h} L${points[0].x},${h} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-20 h-8">
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace('#', '')})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Main Component ──────────────────────────────────────────────────
export default function HealthHistory({ onNavigate }: HealthHistoryProps) {
  // Data
  const [testNames, setTestNames] = useState<TestName[]>([])
  const [historyCache, setHistoryCache] = useState<Record<string, HistoryPoint[]>>({})
  const [summaries, setSummaries] = useState<SummaryItem[]>([])
  const [loading, setLoading] = useState(true)

  // UI
  type View = 'overview' | 'detail' | 'summaries' | 'summary-detail'
  const [view, setView] = useState<View>('overview')
  const [selectedTest, setSelectedTest] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<HealthTimeRange>('all')
  const [chartLoading, setChartLoading] = useState(false)
  const [selectedSummary, setSelectedSummary] = useState<SummaryItem | null>(null)

  // ─── Data fetching ─────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [namesRes, summRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/test-results/names`),
          fetch(`${API_BASE_URL}/api/history?limit=50`),
        ])
        if (namesRes.ok) {
          const names: TestName[] = await namesRes.json()
          setTestNames(names)
          names.slice(0, 12).forEach(n => fetchHistory(n.test_name))
        }
        if (summRes.ok) {
          const data = await summRes.json()
          setSummaries(data.summaries || [])
        }
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const fetchHistory = useCallback(async (testName: string) => {
    if (historyCache[testName]) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/test-results/history/${encodeURIComponent(testName)}`)
      if (res.ok) {
        const data: HistoryPoint[] = await res.json()
        setHistoryCache(prev => ({ ...prev, [testName]: data }))
      }
    } catch {
      // silent
    }
  }, [historyCache])

  const openDetail = useCallback(async (testName: string) => {
    setSelectedTest(testName)
    setTimeRange('all')
    setView('detail')
    if (!historyCache[testName]) {
      setChartLoading(true)
      await fetchHistory(testName)
      setChartLoading(false)
    }
  }, [historyCache, fetchHistory])

  // ─── Chart data ────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!selectedTest || !historyCache[selectedTest]) return []
    return historyCache[selectedTest].map(p => ({
      value: parseNumeric(p.value || '0'),
      date: p.created_at,
      status: p.status,
    }))
  }, [selectedTest, historyCache])

  const filteredChart = useMemo(() => {
    if (timeRange === 'all') return chartData
    const now = Date.now()
    const ms: Record<string, number> = {
      '1d': 86_400_000, '1w': 604_800_000, '1m': 2_592_000_000, '1y': 31_536_000_000,
    }
    const cutoff = now - (ms[timeRange] || 0)
    return chartData.filter(d => new Date(d.date).getTime() >= cutoff)
  }, [chartData, timeRange])

  const chartStats = useMemo(() => {
    const vals = filteredChart.map(d => d.value)
    if (vals.length === 0) return { min: 0, max: 0, avg: 0 }
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    }
  }, [filteredChart])

  const latestValue = (testName: string) => {
    const pts = historyCache[testName]
    if (!pts || pts.length === 0) return null
    return pts[pts.length - 1]
  }

  const sparklineValues = (testName: string): number[] => {
    const pts = historyCache[testName]
    if (!pts || pts.length < 2) return []
    return pts.slice(-10).map(p => parseNumeric(p.value || '0'))
  }

  const sparkColor = (status: string) => {
    if (status === 'normal') return '#8BC34A'
    if (status === 'borderline') return '#f59e0b'
    return '#ef4444'
  }

  // Split tests into vitals and lab results
  const vitalTests = testNames.filter(t => isVital(t.test_name))
  const labTests = testNames.filter(t => !isVital(t.test_name))

  // ─── Loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#8BC34A] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading health history...</p>
        </div>
      </div>
    )
  }

  // ─── Empty ─────────────────────────────────────────────────────────
  if (testNames.length === 0 && summaries.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-[#8BC34A]/10 flex items-center justify-center mx-auto mb-4">
            <Activity className="w-8 h-8 text-[#8BC34A]" />
          </div>
          <h2 className="text-2xl font-light text-gray-900 mb-2">No Health History</h2>
          <p className="text-gray-500 text-sm mb-6">
            Upload medical documents to build your health history. Test results and summaries will appear here.
          </p>
          <button
            onClick={() => onNavigate('upload')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#8BC34A] text-white text-sm font-medium hover:brightness-95 transition"
          >
            <Upload className="w-4 h-4" />
            Upload Document
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // DETAIL VIEW — full chart for a single test
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'detail' && selectedTest) {
    const latest = latestValue(selectedTest)
    const latestVal = latest ? latest.value : '—'
    const latestUnit = latest?.unit || ''
    const Icon = iconFor(selectedTest)

    const svgW = 540, svgH = 220
    const pad = { top: 24, right: 24, bottom: 34, left: 50 }
    const innerW = svgW - pad.left - pad.right
    const innerH = svgH - pad.top - pad.bottom
    const range = chartStats.max - chartStats.min || 1

    const chartPoints = filteredChart.map((d, i) => ({
      x: pad.left + (filteredChart.length > 1 ? (i / (filteredChart.length - 1)) * innerW : innerW / 2),
      y: pad.top + innerH - ((d.value - chartStats.min) / range) * innerH,
      d,
    }))
    const linePath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    const areaPath = chartPoints.length > 0
      ? linePath + ` L${chartPoints[chartPoints.length - 1].x},${pad.top + innerH} L${chartPoints[0].x},${pad.top + innerH} Z`
      : ''

    const yTickCount = 5
    const yTicks = Array.from({ length: yTickCount }, (_, i) =>
      Math.round((chartStats.min + (range * i) / (yTickCount - 1)) * 10) / 10
    )
    const xLabelCount = Math.min(5, filteredChart.length)
    const xLabels = xLabelCount > 0 ? Array.from({ length: xLabelCount }, (_, i) => {
      const idx = Math.round((i / Math.max(xLabelCount - 1, 1)) * (filteredChart.length - 1))
      const dt = new Date(filteredChart[idx].date)
      return { label: `${dt.getMonth() + 1}/${dt.getDate()}`, x: chartPoints[idx].x }
    }) : []

    const timeLabels: Record<string, string> = { '1d': '1 day', '1w': '1 week', '1m': '1 month', '1y': '1 year', all: 'All' }

    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => { setView('overview'); setSelectedTest(null) }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-[#8BC34A]/10 flex items-center justify-center">
            <Icon className="w-6 h-6 text-[#8BC34A]" />
          </div>
          <div>
            <h2 className="text-sm text-gray-400 font-medium">{selectedTest}</h2>
            <p className="text-4xl font-light text-gray-900 leading-tight">
              {latestVal}
              {latestUnit && <span className="text-lg text-gray-400 ml-1">{latestUnit}</span>}
            </p>
          </div>
        </div>

        <div className="flex gap-2 my-6 flex-wrap">
          {(Object.keys(timeLabels) as HealthTimeRange[]).map(key => (
            <button
              key={key}
              onClick={() => setTimeRange(key)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                timeRange === key
                  ? 'bg-[#8BC34A] text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {timeLabels[key]}
            </button>
          ))}
        </div>

        {chartLoading ? (
          <div className="flex items-center justify-center h-56">
            <div className="h-8 w-8 rounded-full border-3 border-[#8BC34A] border-t-transparent animate-spin" />
          </div>
        ) : filteredChart.length === 0 ? (
          <div className="flex items-center justify-center h-56 text-gray-400 text-sm rounded-2xl bg-gray-50">
            No data for this time range.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto">
              {yTicks.map(val => {
                const y = pad.top + innerH - ((val - chartStats.min) / range) * innerH
                return (
                  <g key={val}>
                    <line x1={pad.left} x2={svgW - pad.right} y1={y} y2={y} stroke="#f0f0f0" strokeDasharray="4 2" />
                    <text x={pad.left - 8} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-400">{val}</text>
                  </g>
                )
              })}
              {xLabels.map((lbl, i) => (
                <text key={i} x={lbl.x} y={svgH - 8} textAnchor="middle" className="text-[9px] fill-gray-400">{lbl.label}</text>
              ))}
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8BC34A" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#8BC34A" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#chartGrad)" />
              <path d={linePath} fill="none" stroke="#8BC34A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {chartPoints.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={4} fill="#8BC34A" stroke="#fff" strokeWidth={2} />
                  {filteredChart.length <= 10 && (
                    <text x={p.x} y={p.y - 12} textAnchor="middle" className="text-[9px] fill-gray-600 font-semibold">
                      {p.d.value}
                    </text>
                  )}
                </g>
              ))}
              {filteredChart.length > 2 && (() => {
                const minPt = chartPoints.reduce((a, b) => a.d.value < b.d.value ? a : b)
                const maxPt = chartPoints.reduce((a, b) => a.d.value > b.d.value ? a : b)
                return (
                  <>
                    <circle cx={minPt.x} cy={minPt.y} r={5} fill="#8BC34A" stroke="#fff" strokeWidth={2} />
                    <circle cx={maxPt.x} cy={maxPt.y} r={5} fill="#8BC34A" stroke="#fff" strokeWidth={2} />
                    {filteredChart.length > 10 && (
                      <>
                        <text x={minPt.x} y={minPt.y + 18} textAnchor="middle" className="text-[9px] fill-[#e57373] font-semibold">Min {chartStats.min}</text>
                        <text x={maxPt.x} y={maxPt.y - 14} textAnchor="middle" className="text-[9px] fill-[#8BC34A] font-semibold">Max {chartStats.max}</text>
                      </>
                    )}
                  </>
                )
              })()}
            </svg>
          </div>
        )}

        {filteredChart.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {selectedTest.split(' ')[0]} Stats
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-[#8BC34A]/10 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-[#8BC34A]/20 flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5 text-[#6a9a2e]" />
                  </div>
                  <span className="text-xs text-[#6a9a2e] font-semibold">Max</span>
                </div>
                <p className="text-2xl font-bold text-[#6a9a2e]">{chartStats.max}</p>
              </div>
              <div className="rounded-2xl bg-[#8BC34A]/10 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-[#8BC34A]/20 flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5 text-[#6a9a2e]" />
                  </div>
                  <span className="text-xs text-[#6a9a2e] font-semibold">Min</span>
                </div>
                <p className="text-2xl font-bold text-[#6a9a2e]">{chartStats.min}</p>
              </div>
              <div className="rounded-2xl bg-gray-100 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-gray-200 flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5 text-gray-500" />
                  </div>
                  <span className="text-xs text-gray-500 font-semibold">Avg</span>
                </div>
                <p className="text-2xl font-bold text-gray-700">{chartStats.avg}</p>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY DETAIL — full summary modal
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'summary-detail' && selectedSummary) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => { setView('summaries'); setSelectedSummary(null) }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back to summaries
        </button>

        <div className="mb-6">
          <div className="flex items-start justify-between">
            <h2 className="text-2xl font-light text-gray-900">
              {selectedSummary.patient_name || 'Medical Report'}
            </h2>
            <button
              onClick={() => { setView('summaries'); setSelectedSummary(null) }}
              className="p-1 hover:bg-gray-100 rounded-lg transition"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          {selectedSummary.diagnosis && (
            <p className="text-sm text-[#8BC34A] font-medium mt-1">{selectedSummary.diagnosis}</p>
          )}
          <div className="flex gap-3 mt-2 text-xs text-gray-400">
            {selectedSummary.visit_location && <span>{selectedSummary.visit_location}</span>}
            {selectedSummary.visit_date && <span>Visit: {selectedSummary.visit_date}</span>}
            <span>{new Date(selectedSummary.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>

        {/* Full summary content */}
        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-line rounded-2xl bg-white border border-gray-100 p-6">
          {selectedSummary.raw_summary}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARIES LIST — "What Happened" entries
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'summaries') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => setView('overview')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        <h2 className="text-2xl font-light text-gray-900 mb-1">What Happened</h2>
        <p className="text-sm text-gray-400 mb-6">
          {summaries.length} report{summaries.length !== 1 ? 's' : ''} — tap to read the full summary
        </p>

        <div className="space-y-3">
          {summaries.map((s) => {
            const dt = new Date(s.created_at)
            const whatHappened = extractWhatHappened(s.raw_summary)

            return (
              <button
                key={s.id}
                onClick={() => { setSelectedSummary(s); setView('summary-detail') }}
                className="w-full text-left rounded-2xl border border-gray-100 bg-white p-5 hover:shadow-md hover:border-gray-200 transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900">{s.patient_name || 'Medical Report'}</h3>
                    {s.diagnosis && (
                      <p className="text-sm text-[#8BC34A] font-medium mt-0.5">{s.diagnosis}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span className="text-xs text-gray-400">
                      {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" />
                  </div>
                </div>
                {s.visit_location && (
                  <p className="text-xs text-gray-400 mb-2">
                    {s.visit_location}{s.visit_date ? ` · Visit: ${s.visit_date}` : ''}
                  </p>
                )}
                {whatHappened && (
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                    {whatHappened}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // OVERVIEW — matching Health Dashboard screenshot UI
  // ═══════════════════════════════════════════════════════════════════

  /** Render a single vitals card (large, like the Glucose card in screenshot) */
  const renderVitalCard = (t: TestName) => {
    const s = statusStyles(t.status)
    const latest = latestValue(t.test_name)
    const vals = sparklineValues(t.test_name)

    return (
      <button
        key={t.test_name}
        onClick={() => openDetail(t.test_name)}
        className={`w-full text-left rounded-2xl border-2 ${s.border} ${s.bg} p-5 hover:shadow-md transition-all`}
      >
        <p className={`text-xs font-bold uppercase tracking-wider ${s.text} mb-2`}>
          {t.test_name}
        </p>
        <div className="flex items-end justify-between">
          <div>
            <p className={`text-3xl font-bold ${s.value}`}>
              {latest?.value ?? '—'}
              {latest?.unit && <span className="text-sm font-normal ml-1">{latest.unit}</span>}
            </p>
            <span className={`inline-block mt-2 text-xs font-medium px-2.5 py-1 rounded-full ${s.badge}`}>
              {t.status}
            </span>
          </div>
          {vals.length >= 2 && (
            <Sparkline values={vals} color={sparkColor(t.status)} />
          )}
        </div>
      </button>
    )
  }

  /** Render a lab result card (compact, 2-col grid) */
  const renderLabCard = (t: TestName) => {
    const s = statusStyles(t.status)
    const latest = latestValue(t.test_name)
    const pts = historyCache[t.test_name]
    // Use explanation from the latest point if available
    const explanation = pts && pts.length > 0 ? pts[pts.length - 1].reference_range : null

    return (
      <button
        key={t.test_name}
        onClick={() => openDetail(t.test_name)}
        className={`w-full text-left rounded-2xl border-2 ${s.border} ${s.bg} p-4 hover:shadow-md transition-all`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${s.text}`}>{t.test_name}</p>
            {explanation && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{explanation}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            {latest?.value && latest.value !== 'Within range' ? (
              <p className={`text-lg font-bold ${s.value}`}>
                {latest.value}
                {latest.unit && <span className="text-xs font-normal ml-0.5">{latest.unit}</span>}
              </p>
            ) : (
              <p className={`text-sm font-bold ${s.value}`}>Within range</p>
            )}
            <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.badge}`}>
              {t.status}
            </span>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-full bg-[#8BC34A]/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-[#8BC34A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-light text-gray-900">Health Overview</h2>
          <p className="text-sm text-gray-400">Based off your latest report</p>
        </div>
      </div>

      {/* Vital cards */}
      {vitalTests.length > 0 && (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {vitalTests.map(renderVitalCard)}
        </div>
      )}

      {/* Lab Results */}
      {labTests.length > 0 && (
        <>
          <h3 className="text-lg font-semibold text-gray-900 mt-10 mb-4">Lab Results</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {labTests.map(renderLabCard)}
          </div>
        </>
      )}

      {/* What Happened card */}
      {summaries.length > 0 && (
        <div className="mt-10">
          <button
            onClick={() => setView('summaries')}
            className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-[#8BC34A]/5 to-[#8BC34A]/10 border-2 border-[#8BC34A]/20 hover:shadow-md hover:border-[#8BC34A]/30 transition-all text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#8BC34A]/15 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6 text-[#8BC34A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-gray-900">What Happened</p>
              <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
                {summaries.length} medical report{summaries.length !== 1 ? 's' : ''} · {summaries[0]?.diagnosis || 'View all summaries'}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
          </button>
        </div>
      )}
    </div>
  )
}
