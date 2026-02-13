import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Heart, Activity, Droplets, Wind } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VitalReading {
  id: number;
  timestamp: string;
  heart_rate: number;
  systolic: number;
  diastolic: number;
  spo2: number;
  pulse_rate: number;
}

interface HealthDashboardProps {
  patientId: number;
}

type TimeRange = '1d' | '1w' | '1m' | '1y' | 'all';

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '1d': '1 day',
  '1w': '1 week',
  '1m': '1 month',
  '1y': '1 year',
  all: 'All',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterByTimeRange(vitals: VitalReading[], range: TimeRange): VitalReading[] {
  if (range === 'all') return vitals;

  const now = Date.now();
  const msMap: Record<Exclude<TimeRange, 'all'>, number> = {
    '1d': 86_400_000,
    '1w': 604_800_000,
    '1m': 2_592_000_000,
    '1y': 31_536_000_000,
  };
  const cutoff = now - msMap[range];
  return vitals.filter((v) => new Date(v.timestamp).getTime() >= cutoff);
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Pulsing heart icon */
const PulsingHeart: React.FC = () => (
  <motion.div
    animate={{ scale: [1, 1.2, 1] }}
    transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
    className="inline-flex"
  >
    <Heart className="h-8 w-8 text-red-500 fill-red-500" />
  </motion.div>
);

/** SVG line chart for heart rate */
const HeartRateChart: React.FC<{ data: VitalReading[] }> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-gray-400 text-sm">
        No data available for this range.
      </div>
    );
  }

  const sorted = [...data].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const rates = sorted.map((v) => v.heart_rate);
  const minHR = Math.min(...rates);
  const maxHR = Math.max(...rates);
  const rangeHR = maxHR - minHR || 1;

  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = 500;
  const height = 220;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const points = sorted.map((v, i) => {
    const x = padding.left + (i / Math.max(sorted.length - 1, 1)) * innerW;
    const y = padding.top + innerH - ((v.heart_rate - minHR) / rangeHR) * innerH;
    return { x, y, v };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) =>
    Math.round(minHR + (rangeHR * i) / (yTicks - 1)),
  );

  // X-axis labels (show up to 6)
  const xLabelCount = Math.min(6, sorted.length);
  const xLabels = Array.from({ length: xLabelCount }, (_, i) => {
    const idx = Math.round((i / Math.max(xLabelCount - 1, 1)) * (sorted.length - 1));
    return {
      label: formatTimestamp(sorted[idx].timestamp),
      x: points[idx].x,
    };
  });

  // Min / max annotation points
  const minPoint = points.reduce((a, b) => (a.v.heart_rate < b.v.heart_rate ? a : b));
  const maxPoint = points.reduce((a, b) => (a.v.heart_rate > b.v.heart_rate ? a : b));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* Grid lines */}
      {yTickValues.map((val) => {
        const y = padding.top + innerH - ((val - minHR) / rangeHR) * innerH;
        return (
          <g key={val}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="#e5e7eb"
              strokeDasharray="4 2"
            />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-400">
              {val}
            </text>
          </g>
        );
      })}

      {/* X-axis labels */}
      {xLabels.map((lbl, i) => (
        <text
          key={i}
          x={lbl.x}
          y={height - 6}
          textAnchor="middle"
          className="text-[9px] fill-gray-400"
        >
          {lbl.label}
        </text>
      ))}

      {/* Line */}
      <path d={linePath} fill="none" stroke="#8BC34A" strokeWidth={2.5} strokeLinecap="round" />

      {/* Data points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#8BC34A" stroke="#fff" strokeWidth={1.5} />
      ))}

      {/* Min annotation */}
      <text x={minPoint.x} y={minPoint.y + 16} textAnchor="middle" className="text-[9px] fill-gray-500 font-semibold">
        Min {minHR}
      </text>

      {/* Max annotation */}
      <text x={maxPoint.x} y={maxPoint.y - 10} textAnchor="middle" className="text-[9px] fill-gray-500 font-semibold">
        Max {maxHR}
      </text>
    </svg>
  );
};

/** Semicircle blood pressure gauge */
const BPGauge: React.FC<{ systolic: number; diastolic: number }> = ({ systolic, diastolic }) => {
  // Map systolic to an angle on the semicircle (60 - 200 range → 0 - 180 degrees)
  const minBP = 60;
  const maxBP = 200;
  const clampedSys = Math.max(minBP, Math.min(maxBP, systolic));
  const fraction = (clampedSys - minBP) / (maxBP - minBP);
  const angleDeg = fraction * 180;
  const angleRad = (angleDeg * Math.PI) / 180;

  const cx = 150;
  const cy = 140;
  const r = 110;

  // Full arc from 180 to 0 degrees (left to right)
  const arcStart = { x: cx - r, y: cy };
  const arcEnd = { x: cx + r, y: cy };

  // Filled arc endpoint
  const fillEndX = cx - r * Math.cos(angleRad);
  const fillEndY = cy - r * Math.sin(angleRad);
  const largeArc = angleDeg > 180 ? 1 : 0;

  // Marker positions
  const markers = [
    { label: '0s', angle: 0 },
    { label: '15s', angle: 90 },
    { label: '20s', angle: 135 },
  ];

  return (
    <svg viewBox="0 0 300 170" className="w-full max-w-xs mx-auto h-auto">
      {/* Background arc */}
      <path
        d={`M ${arcStart.x},${arcStart.y} A ${r},${r} 0 0,1 ${arcEnd.x},${arcEnd.y}`}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={14}
        strokeLinecap="round"
      />

      {/* Filled arc */}
      <path
        d={`M ${arcStart.x},${arcStart.y} A ${r},${r} 0 ${largeArc},1 ${fillEndX},${fillEndY}`}
        fill="none"
        stroke="#8BC34A"
        strokeWidth={14}
        strokeLinecap="round"
      />

      {/* Markers */}
      {markers.map((m) => {
        const rad = (m.angle * Math.PI) / 180;
        const mx = cx - (r + 20) * Math.cos(rad);
        const my = cy - (r + 20) * Math.sin(rad);
        return (
          <text key={m.label} x={mx} y={my} textAnchor="middle" className="text-[10px] fill-gray-400 font-medium">
            {m.label}
          </text>
        );
      })}

      {/* Center indicator circle */}
      <circle cx={cx} cy={cy} r={18} fill="#8BC34A" />
      <Activity x={cx - 8} y={cy - 8} width={16} height={16} className="text-white" />

      {/* Needle / indicator dot at current position */}
      <circle cx={fillEndX} cy={fillEndY} r={6} fill="#8BC34A" stroke="#fff" strokeWidth={2} />

      {/* Diastolic label */}
      <text x={cx} y={cy + 40} textAnchor="middle" className="text-xs fill-gray-400">
        Dia: {diastolic} mmHg
      </text>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const HealthDashboard: React.FC<HealthDashboardProps> = ({ patientId }) => {
  const [vitals, setVitals] = useState<VitalReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1w');

  const fetchVitals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/portal/patient/${patientId}/vitals`);
      if (!res.ok) throw new Error(`Failed to fetch vitals (${res.status})`);
      const data: VitalReading[] = await res.json();
      setVitals(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchVitals();
  }, [fetchVitals]);

  const filtered = useMemo(() => filterByTimeRange(vitals, timeRange), [vitals, timeRange]);

  const latest = vitals.length > 0 ? vitals[vitals.length - 1] : null;

  const heartRates = filtered.map((v) => v.heart_rate);
  const hrMax = heartRates.length > 0 ? Math.max(...heartRates) : 0;
  const hrMin = heartRates.length > 0 ? Math.min(...heartRates) : 0;
  const hrAvg = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="h-10 w-10 rounded-full border-4 border-[#45BFD3] border-t-transparent"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-8 text-center text-red-600">
        <p className="font-semibold text-lg mb-1">Unable to load health data</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchVitals}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-white text-sm hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ----------------------------------------------------------------- */}
      {/* LEFT COLUMN: Heart Monitor                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {/* BPM header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500 font-medium">Heart Rate</p>
            <div className="flex items-end gap-2">
              <span className="text-5xl font-bold text-gray-900">
                {latest?.heart_rate ?? '--'}
              </span>
              <span className="text-lg text-gray-400 mb-1.5">bpm</span>
            </div>
          </div>
          <PulsingHeart />
        </div>

        {/* Time range filter */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((key) => (
            <button
              key={key}
              onClick={() => setTimeRange(key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                timeRange === key
                  ? 'bg-[#8BC34A] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
              )}
            >
              {TIME_RANGE_LABELS[key]}
            </button>
          ))}
        </div>

        {/* SVG chart */}
        <div className="bg-gray-50 rounded-xl p-3">
          <HeartRateChart data={filtered} />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="rounded-xl bg-[#8BC34A]/10 p-4 text-center">
            <p className="text-xs text-[#6a9a2e] font-semibold uppercase tracking-wide">Max</p>
            <p className="text-2xl font-bold text-[#6a9a2e]">{hrMax}</p>
            <p className="text-xs text-[#6a9a2e]">bpm</p>
          </div>
          <div className="rounded-xl bg-[#8BC34A]/10 p-4 text-center">
            <p className="text-xs text-[#6a9a2e] font-semibold uppercase tracking-wide">Min</p>
            <p className="text-2xl font-bold text-[#6a9a2e]">{hrMin}</p>
            <p className="text-xs text-[#6a9a2e]">bpm</p>
          </div>
          <div className="rounded-xl bg-gray-100 p-4 text-center">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Avg</p>
            <p className="text-2xl font-bold text-gray-700">{hrAvg}</p>
            <p className="text-xs text-gray-500">bpm</p>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* RIGHT COLUMN: Blood Pressure + Summary                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col gap-6">
        {/* Blood Pressure card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex-1">
          <p className="text-sm text-gray-500 font-medium mb-1">Blood Pressure</p>
          <div className="flex items-end gap-2 mb-4">
            <span className="text-4xl font-bold text-gray-900">
              {latest ? `${latest.systolic}/${latest.diastolic}` : '--/--'}
            </span>
            <span className="text-base text-gray-400 mb-1">mmhg</span>
          </div>

          {latest && <BPGauge systolic={latest.systolic} diastolic={latest.diastolic} />}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Oxygen Level */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="rounded-full bg-[#8BC34A]/15 p-2">
                <Wind className="h-5 w-5 text-[#8BC34A]" />
              </div>
              <span className="text-xs text-gray-500 font-medium">Oxygen Level</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {latest?.spo2 ?? '--'}
              <span className="text-sm text-gray-400 ml-1">%</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">SpO2</p>
          </div>

          {/* Pulse Rate */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="rounded-full bg-[#45BFD3]/15 p-2">
                <Droplets className="h-5 w-5 text-[#45BFD3]" />
              </div>
              <span className="text-xs text-gray-500 font-medium">Pulse Rate</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {latest?.pulse_rate ?? '--'}
              <span className="text-sm text-gray-400 ml-1">bpm</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">Pulse</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthDashboard;
