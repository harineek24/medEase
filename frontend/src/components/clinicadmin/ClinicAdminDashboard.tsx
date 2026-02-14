import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Users,
  CalendarCheck,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { API_BASE_URL } from "@/api";

/* ---------- Types ---------- */
interface DashboardStats {
  active_intakes_today: number;
  intakes_trend: "up" | "down" | "flat";
  total_patients: number;
  kept_appointments: number;
  missed_appointments: number;
  no_show_rate: number;
  outstanding_balance: number;
  appointments_chart: { label: string; kept: number; missed: number }[];
  revenue_chart: { label: string; amount: number }[];
  recent_activity: {
    id: number;
    type: "appointment" | "billing";
    description: string;
    timestamp: string;
  }[];
}

/* ---------- Helpers ---------- */
const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    v,
  );

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35 },
  }),
};

/* ================================================================== */
/*  ClinicAdminDashboard                                               */
/* ================================================================== */
export default function ClinicAdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/clinicadmin/stats`);
      if (!res.ok) throw new Error(`Failed to fetch stats (${res.status})`);
      const data: DashboardStats = await res.json();
      setStats(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  /* ---------- Loading / Error ---------- */
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#45BFD3]" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-red-500">
        <AlertCircle className="h-10 w-10" />
        <p className="text-lg font-medium">{error ?? "No data available"}</p>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  /* ---------- Stat cards config ---------- */
  const statCards = [
    {
      title: "Active Intakes Today",
      value: stats.active_intakes_today,
      icon: Activity,
      trend: stats.intakes_trend,
    },
    {
      title: "Total Patients",
      value: stats.total_patients,
      icon: Users,
      trend: null,
    },
    {
      title: "Kept vs Missed Appts",
      value: `${stats.kept_appointments} / ${stats.missed_appointments}`,
      subtitle: `${stats.no_show_rate.toFixed(1)}% no-show rate`,
      icon: CalendarCheck,
      trend: null,
    },
    {
      title: "Outstanding Balance",
      value: currency(stats.outstanding_balance),
      icon: DollarSign,
      trend: null,
    },
  ];

  /* ---------- Chart helpers ---------- */
  const maxAppt = Math.max(
    ...stats.appointments_chart.flatMap((d) => [d.kept, d.missed]),
    1,
  );
  const maxRevenue = Math.max(
    ...stats.revenue_chart.map((d) => d.amount),
    1,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 md:p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          Clinic Admin Dashboard
        </h1>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* ---- Stat cards ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="rounded-xl bg-white p-5 shadow-sm border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">
                  {card.title}
                </span>
                <span className="rounded-lg bg-[#45BFD3]/10 p-2 text-[#45BFD3]">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-2xl font-bold text-gray-900">
                  {card.value}
                </span>
                {card.trend === "up" && (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                )}
                {card.trend === "down" && (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                )}
              </div>
              {card.subtitle && (
                <p className="mt-1 text-xs text-gray-400">{card.subtitle}</p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* ---- Charts section ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Appointments bar chart */}
        <motion.div
          variants={fadeUp}
          custom={4}
          initial="hidden"
          animate="visible"
          className="rounded-xl bg-white p-5 shadow-sm border border-gray-100"
        >
          <h2 className="mb-4 text-lg font-semibold text-gray-800">
            Appointments Overview
          </h2>
          <div className="flex items-end gap-3 overflow-x-auto pb-2">
            {stats.appointments_chart.map((d) => (
              <div key={d.label} className="flex flex-col items-center gap-1 min-w-[48px]">
                <div className="flex items-end gap-1 h-40">
                  {/* Kept bar */}
                  <div
                    className="w-5 rounded-t bg-green-500 transition-all"
                    style={{ height: `${(d.kept / maxAppt) * 100}%` }}
                    title={`Kept: ${d.kept}`}
                  />
                  {/* Missed bar */}
                  <div
                    className="w-5 rounded-t bg-red-400 transition-all"
                    style={{ height: `${(d.missed / maxAppt) * 100}%` }}
                    title={`Missed: ${d.missed}`}
                  />
                </div>
                <span className="text-xs text-gray-500">{d.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" /> Kept
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400" /> Missed
            </span>
          </div>
        </motion.div>

        {/* Revenue line chart (SVG) */}
        <motion.div
          variants={fadeUp}
          custom={5}
          initial="hidden"
          animate="visible"
          className="rounded-xl bg-white p-5 shadow-sm border border-gray-100"
        >
          <h2 className="mb-4 text-lg font-semibold text-gray-800">
            Revenue Overview
          </h2>
          <svg
            viewBox={`0 0 ${stats.revenue_chart.length * 80} 160`}
            className="w-full h-44"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            {[0, 40, 80, 120, 160].map((y) => (
              <line
                key={y}
                x1={0}
                y1={y}
                x2={stats.revenue_chart.length * 80}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth={0.5}
              />
            ))}
            {/* Area fill */}
            <path
              d={
                `M 0 160 ` +
                stats.revenue_chart
                  .map(
                    (d, i) =>
                      `L ${i * 80 + 40} ${160 - (d.amount / maxRevenue) * 140}`,
                  )
                  .join(" ") +
                ` L ${(stats.revenue_chart.length - 1) * 80 + 40} 160 Z`
              }
              fill="url(#revenueGrad)"
              opacity={0.15}
            />
            {/* Line */}
            <polyline
              fill="none"
              stroke="#45BFD3"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={stats.revenue_chart
                .map(
                  (d, i) =>
                    `${i * 80 + 40},${160 - (d.amount / maxRevenue) * 140}`,
                )
                .join(" ")}
            />
            {/* Dots */}
            {stats.revenue_chart.map((d, i) => (
              <circle
                key={i}
                cx={i * 80 + 40}
                cy={160 - (d.amount / maxRevenue) * 140}
                r={4}
                fill="#45BFD3"
              />
            ))}
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#45BFD3" />
                <stop offset="100%" stopColor="#45BFD3" stopOpacity={0} />
              </linearGradient>
            </defs>
          </svg>
          <div className="mt-2 flex justify-between text-xs text-gray-500 overflow-x-auto gap-2">
            {stats.revenue_chart.map((d) => (
              <span key={d.label} className="min-w-[48px] text-center">
                {d.label}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ---- Recent Activity ---- */}
      <motion.div
        variants={fadeUp}
        custom={6}
        initial="hidden"
        animate="visible"
        className="rounded-xl bg-white p-5 shadow-sm border border-gray-100"
      >
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Recent Activity
        </h2>
        {stats.recent_activity.length === 0 ? (
          <p className="text-sm text-gray-400">No recent activity.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {stats.recent_activity.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-3">
                <span
                  className={cn(
                    "mt-0.5 rounded-full p-1.5",
                    item.type === "appointment"
                      ? "bg-[#45BFD3]/10 text-[#45BFD3]"
                      : "bg-amber-50 text-amber-500",
                  )}
                >
                  {item.type === "appointment" ? (
                    <CalendarCheck className="h-4 w-4" />
                  ) : (
                    <DollarSign className="h-4 w-4" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{item.description}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    {new Date(item.timestamp).toLocaleString()}
                  </p>
                </div>
                <span
                  className={cn(
                    "mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    item.type === "appointment"
                      ? "bg-[#45BFD3]/10 text-[#45BFD3]"
                      : "bg-amber-50 text-amber-600",
                  )}
                >
                  {item.type}
                </span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}
