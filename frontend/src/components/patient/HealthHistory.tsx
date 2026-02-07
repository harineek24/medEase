import { useState, useEffect, useCallback, useMemo } from 'react'
import { API_BASE_URL } from '../../api'
import {
  ChevronLeft,
  Heart,
  Droplets,
  Thermometer,
  Wind,
  Activity,
  TestTube,
  FileText,
  Upload,
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

const statusDot = (status: string) => {
  if (status === 'normal') return 'bg-[#8BC34A]'
  if (status === 'borderline') return 'bg-yellow-400'
  return 'bg-red-400'
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
  type View = 'overview' | 'detail' | 'summaries'
  const [view, setView] = useState<View>('overview')
  const [selectedTest, setSelectedTest] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<HealthTimeRange>('all')
  const [chartLoading, setChartLoading] = useState(false)

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
          // Kick off sparkline fetches for each (max 12)
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

  // Latest value for a test
  const latestValue = (testName: string) => {
    const pts = historyCache[testName]
    if (!pts || pts.length === 0) return null
    return pts[pts.length - 1]
  }

  // Sparkline values for a test
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

  // ─── Loading state ─────────────────────────────────────────────────
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

  // ─── Empty state ───────────────────────────────────────────────────
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

    // SVG chart
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
        {/* Back button */}
        <button
          onClick={() => { setView('overview'); setSelectedTest(null) }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {/* Header */}
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

        {/* Time range pills */}
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

        {/* Chart */}
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
              {/* Grid */}
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

              {/* Area fill */}
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8BC34A" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#8BC34A" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#chartGrad)" />

              {/* Line */}
              <path d={linePath} fill="none" stroke="#8BC34A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

              {/* Data points */}
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

              {/* Min / Max annotations */}
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

              {/* Legend */}
              <circle cx={pad.left} cy={svgH - 8} r={3} fill="#8BC34A" />
              <text x={pad.left + 8} y={svgH - 5} className="text-[8px] fill-gray-400">Min Value</text>
              <circle cx={pad.left + 70} cy={svgH - 8} r={3} fill="#8BC34A" />
              <text x={pad.left + 78} y={svgH - 5} className="text-[8px] fill-gray-400">Max Value</text>
            </svg>
          </div>
        )}

        {/* Stats row */}
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
  // SUMMARIES VIEW — chronological "What Happened" list
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
          {summaries.length} report{summaries.length !== 1 ? 's' : ''} in chronological order
        </p>

        <div className="space-y-4">
          {summaries.map((s) => {
            const dt = new Date(s.created_at)
            return (
              <div key={s.id} className="rounded-2xl border border-gray-100 bg-white p-5 hover:shadow-sm transition">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900">{s.patient_name || 'Medical Report'}</h3>
                    {s.diagnosis && (
                      <p className="text-sm text-[#8BC34A] font-medium mt-0.5">{s.diagnosis}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 ml-4">
                    {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                {s.visit_location && (
                  <p className="text-xs text-gray-400 mb-2">{s.visit_location}{s.visit_date ? ` · Visit: ${s.visit_date}` : ''}</p>
                )}
                {s.raw_summary && (
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-4 whitespace-pre-line">
                    {s.raw_summary.slice(0, 400)}{s.raw_summary.length > 400 ? '...' : ''}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // OVERVIEW — Health metric cards + What Happened
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-light text-gray-900 mb-1">Health Overview</h2>
      <p className="text-sm text-gray-400 mb-6">Tap a card to see detailed charts</p>

      {/* Health metric cards */}
      <div className="space-y-3 mb-6">
        {testNames.map((t) => {
          const Icon = iconFor(t.test_name)
          const latest = latestValue(t.test_name)
          const vals = sparklineValues(t.test_name)
          const color = sparkColor(t.status)

          return (
            <button
              key={t.test_name}
              onClick={() => openDetail(t.test_name)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all text-left group"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-[#8BC34A]/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-[#8BC34A]" />
              </div>

              {/* Name + value */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{t.test_name}</p>
                <p className="text-lg font-bold text-gray-900">
                  {latest?.value ?? '—'}
                  {latest?.unit && <span className="text-xs text-gray-400 ml-1 font-normal">{latest.unit}</span>}
                </p>
              </div>

              {/* Sparkline */}
              <div className="shrink-0">
                {vals.length >= 2 ? (
                  <Sparkline values={vals} color={color} />
                ) : (
                  <div className="w-20 h-8 rounded bg-gray-50" />
                )}
              </div>

              {/* Status dot */}
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot(t.status)}`} />
            </button>
          )
        })}
      </div>

      {/* What Happened card */}
      {summaries.length > 0 && (
        <button
          onClick={() => setView('summaries')}
          className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-[#8BC34A]/5 to-[#8BC34A]/10 border border-[#8BC34A]/20 hover:shadow-md hover:border-[#8BC34A]/30 transition-all text-left"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#8BC34A]/15 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6 text-[#8BC34A]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-gray-900">What Happened</p>
            <p className="text-sm text-gray-500 truncate">
              {summaries.length} medical report{summaries.length !== 1 ? 's' : ''} · {summaries[0]?.diagnosis || 'View all summaries'}
            </p>
          </div>
          <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180 shrink-0" />
        </button>
      )}
    </div>
  )
}
