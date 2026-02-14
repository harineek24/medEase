import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  X,
  Check,
  XCircle,
  Edit3,
  AlertCircle,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/api";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface DoctorCalendarProps {
  doctorId?: number; // optional override, used by admin
}

type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rejected";

interface Appointment {
  id: number;
  patient_id: number;
  patient_name: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  status: AppointmentStatus;
  reason?: string;
  notes?: string;
  service_name?: string;
}

type ViewMode = "week" | "day";

/* ------------------------------------------------------------------ */
/*  Date helpers                                                      */
/* ------------------------------------------------------------------ */

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Monday = 0, shift so Monday is first
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7..20

/* ------------------------------------------------------------------ */
/*  Status helpers                                                    */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<
  AppointmentStatus,
  { bg: string; text: string; label: string; border: string; stripe?: boolean }
> = {
  scheduled: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    label: "Scheduled",
    border: "border-blue-300",
  },
  confirmed: {
    bg: "bg-green-100",
    text: "text-green-800",
    label: "Confirmed",
    border: "border-green-300",
  },
  completed: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    label: "Completed",
    border: "border-gray-300",
  },
  cancelled: {
    bg: "bg-red-50",
    text: "text-red-700",
    label: "Cancelled",
    border: "border-red-300",
    stripe: true,
  },
  rejected: {
    bg: "bg-red-100",
    text: "text-red-800",
    label: "Rejected",
    border: "border-red-400",
  },
};

function parseTime(timeStr: string): { hour: number; minute: number } {
  const parts = timeStr.split(":");
  return {
    hour: parseInt(parts[0], 10),
    minute: parseInt(parts[1], 10),
  };
}

function formatTime12(timeStr: string): string {
  const { hour, minute } = parseTime(timeStr);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return `${h}:${String(minute).padStart(2, "0")} ${ampm}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function DoctorCalendar({ doctorId: propDoctorId }: DoctorCalendarProps) {
  const auth = useAuth();
  const doctorId = propDoctorId ?? auth.doctorId;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [focusDate, setFocusDate] = useState<Date>(today);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [modifying, setModifying] = useState(false);
  const [modifyDate, setModifyDate] = useState("");
  const [modifyTime, setModifyTime] = useState("");

  /* ---------- Computed date range ---------- */

  const weekStart = useMemo(() => startOfWeek(focusDate), [focusDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const dateRange = useMemo(() => {
    if (viewMode === "week") {
      return { start: weekStart, end: addDays(weekStart, 6) };
    }
    return { start: focusDate, end: focusDate };
  }, [viewMode, weekStart, focusDate]);

  /* ---------- Display month/year ---------- */

  const headerLabel = useMemo(() => {
    if (viewMode === "day") {
      return `${MONTH_NAMES[focusDate.getMonth()]} ${focusDate.getDate()}, ${focusDate.getFullYear()}`;
    }
    const startMonth = weekStart.getMonth();
    const endDate = addDays(weekStart, 6);
    const endMonth = endDate.getMonth();
    if (startMonth === endMonth) {
      return `${MONTH_NAMES[startMonth]} ${weekStart.getFullYear()}`;
    }
    if (weekStart.getFullYear() === endDate.getFullYear()) {
      return `${MONTH_NAMES[startMonth]} - ${MONTH_NAMES[endMonth]} ${weekStart.getFullYear()}`;
    }
    return `${MONTH_NAMES[startMonth]} ${weekStart.getFullYear()} - ${MONTH_NAMES[endMonth]} ${endDate.getFullYear()}`;
  }, [viewMode, focusDate, weekStart]);

  /* ---------- Fetch appointments ---------- */

  const fetchAppointments = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    setError(null);
    try {
      const startStr = formatDateISO(dateRange.start);
      const endStr = formatDateISO(dateRange.end);
      const res = await fetch(
        `${API_BASE_URL}/api/doctor/${doctorId}/calendar?start_date=${startStr}&end_date=${endStr}`
      );
      if (!res.ok) throw new Error(`Failed to load calendar (${res.status})`);
      const data = await res.json();
      const list: Appointment[] = Array.isArray(data)
        ? data
        : data.appointments ?? [];
      setAppointments(list);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load calendar";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [doctorId, dateRange.start, dateRange.end]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  /* ---------- Stats ---------- */

  const stats = useMemo(() => {
    const todayStr = formatDateISO(today);
    const todayAppts = appointments.filter(
      (a) => a.appointment_date === todayStr
    );
    const pending = appointments.filter((a) => a.status === "scheduled");
    return {
      todayCount: todayAppts.length,
      weekTotal: appointments.length,
      pendingCount: pending.length,
    };
  }, [appointments, today]);

  /* ---------- Appointment actions ---------- */

  const updateAppointment = useCallback(
    async (
      appointmentId: number,
      payload: {
        status?: AppointmentStatus;
        appointment_date?: string;
        appointment_time?: string;
        notes?: string;
      }
    ) => {
      if (!doctorId) return;
      setActionLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/doctor/${doctorId}/appointments/${appointmentId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) throw new Error(`Update failed (${res.status})`);
        const updated: Appointment = await res.json();
        // Update local state optimistically
        setAppointments((prev) =>
          prev.map((a) => (a.id === appointmentId ? { ...a, ...updated } : a))
        );
        setSelectedAppointment((prev) =>
          prev?.id === appointmentId ? { ...prev, ...updated } : prev
        );
        setModifying(false);
        // Refetch to ensure calendar is fully in sync (handles date/time moves)
        fetchAppointments();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Action failed";
        alert(message);
      } finally {
        setActionLoading(false);
      }
    },
    [doctorId, fetchAppointments]
  );

  /* ---------- Navigation ---------- */

  function navigatePrev() {
    if (viewMode === "week") {
      setFocusDate((d) => addDays(d, -7));
    } else {
      setFocusDate((d) => addDays(d, -1));
    }
  }

  function navigateNext() {
    if (viewMode === "week") {
      setFocusDate((d) => addDays(d, 7));
    } else {
      setFocusDate((d) => addDays(d, 1));
    }
  }

  function goToday() {
    setFocusDate(today);
  }

  /* ---------- Group appointments by date ---------- */

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of appointments) {
      const key = appt.appointment_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appt);
    }
    // Sort each day's appointments by time
    for (const list of map.values()) {
      list.sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
    }
    return map;
  }, [appointments]);

  /* ---------- Open side panel ---------- */

  function openPanel(appt: Appointment) {
    setSelectedAppointment(appt);
    setModifying(false);
    setModifyDate(appt.appointment_date);
    setModifyTime(appt.appointment_time);
  }

  /* ---------- Appointment block ---------- */

  function AppointmentBlock({
    appt,
    compact = false,
  }: {
    appt: Appointment;
    compact?: boolean;
  }) {
    const cfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled;
    return (
      <button
        onClick={() => openPanel(appt)}
        className={cn(
          "w-full text-left rounded-lg border px-2.5 py-1.5 transition-shadow hover:shadow-md cursor-pointer",
          cfg.bg,
          cfg.border,
          cfg.stripe &&
            "bg-[repeating-linear-gradient(-45deg,transparent,transparent_4px,rgba(239,68,68,0.08)_4px,rgba(239,68,68,0.08)_8px)]",
          selectedAppointment?.id === appt.id && "ring-2 ring-[#45BFD3] ring-offset-1"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            cfg.text
          )}
        >
          <Clock className="w-3 h-3 shrink-0" />
          {formatTime12(appt.appointment_time)}
        </div>
        {!compact && (
          <div className="mt-0.5 text-xs text-gray-800 font-medium truncate">
            {appt.patient_name}
          </div>
        )}
        {compact && (
          <div className="mt-0.5 text-[11px] text-gray-700 truncate">
            {appt.patient_name}
          </div>
        )}
      </button>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  if (!doctorId) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center text-gray-500">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-gray-400" />
          <p className="text-lg font-medium">No doctor selected</p>
          <p className="text-sm mt-1">
            Please log in as a doctor to view the calendar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ==================== Main Calendar Area ==================== */}
      <div
        className={cn(
          "flex-1 flex flex-col overflow-hidden transition-all duration-300",
          selectedAppointment ? "mr-0" : ""
        )}
      >
        {/* ---------- Stats Bar ---------- */}
        <div className="px-6 pt-6 pb-3">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-0.5">
                <Calendar className="w-4 h-4 text-[#45BFD3]" />
                Today
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {stats.todayCount}
              </p>
              <p className="text-xs text-gray-400">appointments</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-0.5">
                <CalendarDays className="w-4 h-4 text-[#45BFD3]" />
                This Week
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {stats.weekTotal}
              </p>
              <p className="text-xs text-gray-400">total</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-0.5">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Pending
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {stats.pendingCount}
              </p>
              <p className="text-xs text-gray-400">needs confirmation</p>
            </div>
          </div>
        </div>

        {/* ---------- Calendar Header ---------- */}
        <div className="px-6 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{headerLabel}</h1>
            <button
              onClick={goToday}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("week")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  viewMode === "week"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode("day")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  viewMode === "day"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                Day
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={navigatePrev}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={navigateNext}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                aria-label="Next"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* ---------- Calendar Body ---------- */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center text-gray-400">
                <div className="w-8 h-8 border-2 border-[#45BFD3] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">Loading calendar...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center text-red-500">
                <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm font-medium">{error}</p>
                <button
                  onClick={fetchAppointments}
                  className="mt-3 text-xs text-[#45BFD3] hover:underline"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : viewMode === "week" ? (
            /* ===== WEEKLY VIEW ===== */
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-gray-100">
                {weekDays.map((day, idx) => {
                  const isToday = isSameDay(day, today);
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "px-3 py-3 text-center border-r border-gray-50 last:border-r-0",
                        isToday && "bg-[#45BFD3]/5"
                      )}
                    >
                      <div className="text-xs font-medium text-gray-400 uppercase">
                        {DAY_LABELS[idx]}
                      </div>
                      <div
                        className={cn(
                          "mt-1 text-lg font-bold",
                          isToday ? "text-[#45BFD3]" : "text-gray-900"
                        )}
                      >
                        {day.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Day columns */}
              <div className="grid grid-cols-7 min-h-[420px]">
                {weekDays.map((day, idx) => {
                  const dateStr = formatDateISO(day);
                  const dayAppts = appointmentsByDate.get(dateStr) || [];
                  const isToday = isSameDay(day, today);
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "border-r border-gray-50 last:border-r-0 p-2 space-y-1.5",
                        isToday && "bg-[#45BFD3]/[0.02]"
                      )}
                    >
                      {dayAppts.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-[11px] text-gray-300">
                            No appointments
                          </p>
                        </div>
                      ) : (
                        dayAppts.map((appt) => (
                          <AppointmentBlock
                            key={appt.id}
                            appt={appt}
                            compact
                          />
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ===== DAILY VIEW ===== */
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {HOURS.map((hour) => {
                const hourAppts = (
                  appointmentsByDate.get(formatDateISO(focusDate)) || []
                ).filter((a) => {
                  const t = parseTime(a.appointment_time);
                  return t.hour === hour;
                });

                return (
                  <div
                    key={hour}
                    className="flex border-b border-gray-50 last:border-b-0 min-h-[64px]"
                  >
                    {/* Time gutter */}
                    <div className="w-20 shrink-0 px-3 py-2 text-right border-r border-gray-100">
                      <span className="text-xs font-medium text-gray-400">
                        {hour % 12 || 12}:00 {hour >= 12 ? "PM" : "AM"}
                      </span>
                    </div>

                    {/* Slot content */}
                    <div className="flex-1 p-1.5 space-y-1">
                      {hourAppts.length === 0 ? (
                        <div className="h-full" />
                      ) : (
                        hourAppts.map((appt) => {
                          const cfg =
                            STATUS_CONFIG[appt.status] ||
                            STATUS_CONFIG.scheduled;
                          const durationSlots = Math.max(
                            1,
                            Math.ceil((appt.duration_minutes || 30) / 30)
                          );
                          return (
                            <button
                              key={appt.id}
                              onClick={() => openPanel(appt)}
                              className={cn(
                                "w-full text-left rounded-lg border px-3 py-2 transition-shadow hover:shadow-md cursor-pointer",
                                cfg.bg,
                                cfg.border,
                                cfg.stripe &&
                                  "bg-[repeating-linear-gradient(-45deg,transparent,transparent_4px,rgba(239,68,68,0.08)_4px,rgba(239,68,68,0.08)_8px)]",
                                selectedAppointment?.id === appt.id &&
                                  "ring-2 ring-[#45BFD3] ring-offset-1"
                              )}
                              style={{
                                minHeight: `${durationSlots * 32}px`,
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div
                                  className={cn(
                                    "flex items-center gap-1.5 text-sm font-medium",
                                    cfg.text
                                  )}
                                >
                                  <Clock className="w-3.5 h-3.5 shrink-0" />
                                  {formatTime12(appt.appointment_time)}
                                  <span className="text-gray-400 font-normal">
                                    ({appt.duration_minutes || 30} min)
                                  </span>
                                </div>
                                <span
                                  className={cn(
                                    "text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full",
                                    cfg.bg,
                                    cfg.text
                                  )}
                                >
                                  {cfg.label}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-800">
                                <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                {appt.patient_name}
                              </div>
                              {appt.reason && (
                                <p className="mt-0.5 text-xs text-gray-500 truncate">
                                  {appt.reason}
                                </p>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ==================== Side Panel ==================== */}
      <AnimatePresence>
        {selectedAppointment && (
          <motion.aside
            key="appointment-panel"
            initial={{ x: 384, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 384, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="w-96 shrink-0 bg-white border-l border-gray-100 shadow-lg flex flex-col overflow-hidden"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                Appointment Details
              </h2>
              <button
                onClick={() => setSelectedAppointment(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                aria-label="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Patient info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#45BFD3]/10 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-[#45BFD3]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {selectedAppointment.patient_name}
                  </p>
                  <p className="text-xs text-gray-400">
                    Patient #{selectedAppointment.patient_id}
                  </p>
                </div>
              </div>

              {/* Status badge */}
              {(() => {
                const cfg =
                  STATUS_CONFIG[selectedAppointment.status] ||
                  STATUS_CONFIG.scheduled;
                return (
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
                      cfg.bg,
                      cfg.text
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        selectedAppointment.status === "scheduled" && "bg-blue-500",
                        selectedAppointment.status === "confirmed" && "bg-green-500",
                        selectedAppointment.status === "completed" && "bg-gray-400",
                        selectedAppointment.status === "cancelled" && "bg-red-500",
                        selectedAppointment.status === "rejected" && "bg-red-600"
                      )}
                    />
                    {cfg.label}
                  </div>
                );
              })()}

              {/* Details */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                  <div>
                    <p className="text-gray-500 text-xs">Date</p>
                    <p className="font-medium text-gray-900">
                      {new Date(
                        selectedAppointment.appointment_date + "T00:00:00"
                      ).toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                  <div>
                    <p className="text-gray-500 text-xs">Time</p>
                    <p className="font-medium text-gray-900">
                      {formatTime12(selectedAppointment.appointment_time)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                  <div>
                    <p className="text-gray-500 text-xs">Duration</p>
                    <p className="font-medium text-gray-900">
                      {selectedAppointment.duration_minutes || 30} minutes
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes / Reason */}
              {(selectedAppointment.reason || selectedAppointment.notes) && (
                <div className="bg-gray-50 rounded-lg p-3">
                  {selectedAppointment.reason && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-gray-500 mb-0.5">
                        Reason
                      </p>
                      <p className="text-sm text-gray-800">
                        {selectedAppointment.reason}
                      </p>
                    </div>
                  )}
                  {selectedAppointment.notes && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-0.5">
                        Notes
                      </p>
                      <p className="text-sm text-gray-800">
                        {selectedAppointment.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Modify form */}
              {modifying && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border border-gray-200 rounded-lg p-4 space-y-3"
                >
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Modify Appointment
                  </p>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={modifyDate}
                      onChange={(e) => setModifyDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Time
                    </label>
                    <input
                      type="time"
                      value={modifyTime}
                      onChange={(e) => setModifyTime(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#45BFD3]/40 focus:border-[#45BFD3]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={actionLoading}
                      onClick={() =>
                        updateAppointment(selectedAppointment.id, {
                          appointment_date: modifyDate,
                          appointment_time: modifyTime,
                        })
                      }
                      className="flex-1 px-3 py-2 text-xs font-medium text-white bg-[#45BFD3] rounded-lg hover:bg-[#3AACBF] disabled:opacity-50 transition-colors"
                    >
                      {actionLoading ? "Saving..." : "Save Changes"}
                    </button>
                    <button
                      onClick={() => setModifying(false)}
                      className="px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Panel actions */}
            <div className="border-t border-gray-100 p-4 space-y-2">
              {/* Accept / Confirm */}
              {(selectedAppointment.status === "scheduled") && (
                <button
                  disabled={actionLoading}
                  onClick={() =>
                    updateAppointment(selectedAppointment.id, {
                      status: "confirmed",
                    })
                  }
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  {actionLoading ? "Updating..." : "Accept"}
                </button>
              )}

              {/* Reject */}
              {(selectedAppointment.status === "scheduled") && (
                <button
                  disabled={actionLoading}
                  onClick={() =>
                    updateAppointment(selectedAppointment.id, {
                      status: "rejected",
                    })
                  }
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  {actionLoading ? "Updating..." : "Reject"}
                </button>
              )}

              {/* Modify */}
              {(selectedAppointment.status === "scheduled" ||
                selectedAppointment.status === "confirmed") &&
                !modifying && (
                  <button
                    onClick={() => {
                      setModifyDate(selectedAppointment.appointment_date);
                      setModifyTime(selectedAppointment.appointment_time);
                      setModifying(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-[#45BFD3] bg-[#45BFD3]/10 rounded-lg hover:bg-[#45BFD3]/20 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                    Modify
                  </button>
                )}

              {/* Complete */}
              {(selectedAppointment.status === "confirmed") && (
                <button
                  disabled={actionLoading}
                  onClick={() =>
                    updateAppointment(selectedAppointment.id, {
                      status: "completed",
                    })
                  }
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  {actionLoading ? "Updating..." : "Complete"}
                </button>
              )}

              {/* Cancel */}
              {(selectedAppointment.status === "scheduled" ||
                selectedAppointment.status === "confirmed") && (
                <button
                  disabled={actionLoading}
                  onClick={() =>
                    updateAppointment(selectedAppointment.id, {
                      status: "cancelled",
                    })
                  }
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  {actionLoading ? "Updating..." : "Cancel Appointment"}
                </button>
              )}

              {/* Already terminal states */}
              {(selectedAppointment.status === "completed" ||
                selectedAppointment.status === "cancelled" ||
                selectedAppointment.status === "rejected") && (
                <p className="text-center text-xs text-gray-400 py-2">
                  This appointment is{" "}
                  {STATUS_CONFIG[selectedAppointment.status]?.label.toLowerCase()}.
                  No further actions available.
                </p>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
