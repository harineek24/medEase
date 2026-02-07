import { useMemo } from "react";
import { Heart, Activity, Droplets, Wind } from "lucide-react";
import { cn } from "@/lib/utils";

interface VitalReading {
  heart_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  oxygen_level: number | null;
  recorded_at: string;
}

interface VitalsChartProps {
  vitals: VitalReading[];
  timeRange: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const GREEN = "#8BC34A";
const THEME = "#45BFD3";

function formatTime(iso: string, range: string): string {
  const d = new Date(iso);
  if (range === "1 day") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (range === "1 week") return d.toLocaleDateString([], { weekday: "short" });
  if (range === "1 month") return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", year: "2-digit" });
}

function stats(values: number[]): { min: number; max: number; avg: number } {
  if (values.length === 0) return { min: 0, max: 0, avg: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return { min, max, avg };
}

/* ------------------------------------------------------------------ */
/*  SVG Line Chart                                                    */
/* ------------------------------------------------------------------ */

function LineChart({
  data,
  labels,
  color,
  height = 160,
  width = 600,
}: {
  data: number[];
  labels: string[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        No data available
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minVal = Math.min(...data) - 5;
  const maxVal = Math.max(...data) + 5;
  const range = maxVal - minVal || 1;

  const points = data.map((v, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - ((v - minVal) / range) * chartH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const areaPath =
    linePath +
    ` L ${points[points.length - 1].x} ${padding.top + chartH}` +
    ` L ${points[0].x} ${padding.top + chartH} Z`;

  // Y-axis labels (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = minVal + (range * i) / 4;
    const y = padding.top + chartH - (i / 4) * chartH;
    return { val: Math.round(val), y };
  });

  // X-axis labels (max 6)
  const step = Math.max(1, Math.floor(labels.length / 6));
  const xTicks = labels
    .map((label, i) => ({
      label,
      x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
      show: i % step === 0 || i === labels.length - 1,
    }))
    .filter((t) => t.show);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {yTicks.map((t, i) => (
        <line
          key={i}
          x1={padding.left}
          y1={t.y}
          x2={width - padding.right}
          y2={t.y}
          stroke="#e5e7eb"
          strokeDasharray="4 4"
        />
      ))}

      {/* Y labels */}
      {yTicks.map((t, i) => (
        <text key={i} x={padding.left - 8} y={t.y + 4} textAnchor="end" className="text-[10px] fill-gray-400">
          {t.val}
        </text>
      ))}

      {/* X labels */}
      {xTicks.map((t, i) => (
        <text
          key={i}
          x={t.x}
          y={height - 5}
          textAnchor="middle"
          className="text-[10px] fill-gray-400"
        >
          {t.label}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaPath} fill={color} opacity={0.12} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="white" stroke={color} strokeWidth={2} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Blood Pressure Gauge (semicircle)                                 */
/* ------------------------------------------------------------------ */

function BPGauge({ systolic, diastolic }: { systolic: number; diastolic: number }) {
  // Systolic normal range 90-120, diastolic 60-80
  const sysNorm = Math.min(Math.max((systolic - 70) / 110, 0), 1); // 0-1 over 70-180
  const cx = 100;
  const cy = 90;
  const r = 70;

  const startAngle = Math.PI;
  const endAngle = 0;
  const needleAngle = startAngle - sysNorm * Math.PI;

  const arcPath = (startA: number, endA: number, radius: number) => {
    const x1 = cx + radius * Math.cos(startA);
    const y1 = cy - radius * Math.sin(startA);
    const x2 = cx + radius * Math.cos(endA);
    const y2 = cy - radius * Math.sin(endA);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  };

  const needleX = cx + (r - 15) * Math.cos(needleAngle);
  const needleY = cy - (r - 15) * Math.sin(needleAngle);

  const getColor = () => {
    if (systolic < 120 && diastolic < 80) return GREEN;
    if (systolic < 140 || diastolic < 90) return "#FFC107";
    return "#F44336";
  };

  const label = () => {
    if (systolic < 120 && diastolic < 80) return "Normal";
    if (systolic < 140 || diastolic < 90) return "Elevated";
    return "High";
  };

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-48">
        {/* Background arc */}
        <path d={arcPath(startAngle, endAngle, r)} fill="none" stroke="#e5e7eb" strokeWidth={12} strokeLinecap="round" />
        {/* Colored arc */}
        <path
          d={arcPath(startAngle, needleAngle, r)}
          fill="none"
          stroke={getColor()}
          strokeWidth={12}
          strokeLinecap="round"
        />
        {/* Needle */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#374151" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill="#374151" />
        {/* Value */}
        <text x={cx} y={cy + 2} textAnchor="middle" className="text-lg font-bold fill-gray-900" style={{ fontSize: 18 }}>
          {systolic}/{diastolic}
        </text>
      </svg>
      <span
        className={cn(
          "mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
          systolic < 120 && diastolic < 80
            ? "bg-green-100 text-green-700"
            : systolic < 140 || diastolic < 90
            ? "bg-yellow-100 text-yellow-700"
            : "bg-red-100 text-red-700"
        )}
      >
        {label()}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                         */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  unit,
  icon,
  color = GREEN,
}: {
  label: string;
  value: number | string;
  unit?: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}20` }}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-bold text-gray-900">
          {value}
          {unit && <span className="ml-0.5 text-xs font-normal text-gray-400">{unit}</span>}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function VitalsChart({ vitals, timeRange }: VitalsChartProps) {
  const sortedVitals = useMemo(
    () => [...vitals].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()),
    [vitals]
  );

  const hrData = useMemo(() => sortedVitals.filter((v) => v.heart_rate != null).map((v) => v.heart_rate!), [sortedVitals]);
  const hrLabels = useMemo(
    () => sortedVitals.filter((v) => v.heart_rate != null).map((v) => formatTime(v.recorded_at, timeRange)),
    [sortedVitals, timeRange]
  );
  const hrStats = useMemo(() => stats(hrData), [hrData]);

  const spO2Data = useMemo(() => sortedVitals.filter((v) => v.oxygen_level != null).map((v) => v.oxygen_level!), [sortedVitals]);
  const spO2Stats = useMemo(() => stats(spO2Data), [spO2Data]);

  const latestBP = useMemo(() => {
    const withBP = sortedVitals.filter((v) => v.systolic_bp != null && v.diastolic_bp != null);
    return withBP.length > 0 ? withBP[withBP.length - 1] : null;
  }, [sortedVitals]);

  const latestHR = hrData.length > 0 ? hrData[hrData.length - 1] : null;
  const latestSpO2 = spO2Data.length > 0 ? spO2Data[spO2Data.length - 1] : null;

  if (vitals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Activity className="h-12 w-12 text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No vitals data available</p>
        <p className="text-xs text-gray-400 mt-1">Vitals will appear here once recorded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Heart Rate Chart */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5" style={{ color: GREEN }} />
            <h4 className="font-semibold text-gray-900">Heart Rate</h4>
          </div>
          {latestHR !== null && (
            <span className="text-2xl font-bold text-gray-900">
              {latestHR}
              <span className="ml-1 text-sm font-normal text-gray-400">bpm</span>
            </span>
          )}
        </div>

        <LineChart data={hrData} labels={hrLabels} color={GREEN} />

        {/* Min / Max / Avg */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-green-50 p-3 text-center">
            <p className="text-xs text-gray-500">Min</p>
            <p className="text-lg font-bold" style={{ color: GREEN }}>
              {hrStats.min}
            </p>
          </div>
          <div className="rounded-lg bg-green-50 p-3 text-center">
            <p className="text-xs text-gray-500">Max</p>
            <p className="text-lg font-bold" style={{ color: GREEN }}>
              {hrStats.max}
            </p>
          </div>
          <div className="rounded-lg bg-green-50 p-3 text-center">
            <p className="text-xs text-gray-500">Avg</p>
            <p className="text-lg font-bold" style={{ color: GREEN }}>
              {hrStats.avg}
            </p>
          </div>
        </div>
      </div>

      {/* Blood Pressure */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <Droplets className="h-5 w-5 text-blue-500" />
          <h4 className="font-semibold text-gray-900">Blood Pressure</h4>
        </div>
        {latestBP ? (
          <BPGauge systolic={latestBP.systolic_bp!} diastolic={latestBP.diastolic_bp!} />
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">No blood pressure data</p>
        )}
      </div>

      {/* SpO2 & Pulse Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Oxygen Level (SpO2)"
          value={latestSpO2 !== null ? `${latestSpO2}%` : "--"}
          icon={<Wind className="h-5 w-5" style={{ color: THEME }} />}
          color={THEME}
        />
        <StatCard
          label="Pulse Rate"
          value={latestHR !== null ? latestHR : "--"}
          unit="bpm"
          icon={<Activity className="h-5 w-5" style={{ color: GREEN }} />}
          color={GREEN}
        />
      </div>

      {/* SpO2 Stats */}
      {spO2Data.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Wind className="h-5 w-5" style={{ color: THEME }} />
            <h4 className="font-semibold text-gray-900">SpO2 Trend</h4>
          </div>
          <LineChart
            data={spO2Data}
            labels={sortedVitals.filter((v) => v.oxygen_level != null).map((v) => formatTime(v.recorded_at, timeRange))}
            color={THEME}
          />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-cyan-50 p-3 text-center">
              <p className="text-xs text-gray-500">Min</p>
              <p className="text-lg font-bold" style={{ color: THEME }}>{spO2Stats.min}%</p>
            </div>
            <div className="rounded-lg bg-cyan-50 p-3 text-center">
              <p className="text-xs text-gray-500">Max</p>
              <p className="text-lg font-bold" style={{ color: THEME }}>{spO2Stats.max}%</p>
            </div>
            <div className="rounded-lg bg-cyan-50 p-3 text-center">
              <p className="text-xs text-gray-500">Avg</p>
              <p className="text-lg font-bold" style={{ color: THEME }}>{spO2Stats.avg}%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
