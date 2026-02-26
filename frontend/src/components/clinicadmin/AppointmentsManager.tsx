import { useState, useEffect, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarPlus,
  Check,
  X,
  UserX,
  Clock,
  User,
  Stethoscope,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { API_BASE_URL as API } from "@/api";

/* ---------- Types ---------- */
interface Appointment {
  id: number;
  time: string;
  patient_name: string;
  doctor_name: string;
  service: string;
  status: "scheduled" | "completed" | "no_show" | "cancelled";
  reason?: string;
  date: string;
}

interface DropdownOption {
  id: number;
  name: string;
}

type TabKey = "today" | "week" | "all";

const STATUS_MAP: Record<
  Appointment["status"],
  { label: string; bg: string; text: string }
> = {
  scheduled: { label: "Scheduled", bg: "bg-blue-100", text: "text-blue-700" },
  completed: { label: "Completed", bg: "bg-green-100", text: "text-green-700" },
  no_show: { label: "No Show", bg: "bg-red-100", text: "text-red-700" },
  cancelled: { label: "Cancelled", bg: "bg-gray-100", text: "text-gray-600" },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "all", label: "All" },
];

/* ================================================================== */
/*  AppointmentsManager                                                */
/* ================================================================== */
export default function AppointmentsManager() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [showModal, setShowModal] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  /* --- Dropdown data for form --- */
  const [patients, setPatients] = useState<DropdownOption[]>([]);
  const [doctors, setDoctors] = useState<DropdownOption[]>([]);
  const [services, setServices] = useState<DropdownOption[]>([]);

  /* --- Form state --- */
  const [form, setForm] = useState({
    patient_id: "",
    doctor_id: "",
    service_id: "",
    date: new Date().toISOString().split("T")[0],
    time: "09:00",
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);

  /* ---------- Fetch appointments ---------- */
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API}/api/clinicadmin/appointments/today`;
      if (activeTab === "week") url = `${API}/api/clinicadmin/appointments?range=week`;
      if (activeTab === "all") url = `${API}/api/clinicadmin/appointments?range=all`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch appointments (${res.status})`);
      const data: Appointment[] = await res.json();
      setAppointments(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  /* ---------- Fetch dropdown data when modal opens ---------- */
  useEffect(() => {
    if (!showModal) return;
    const load = async () => {
      try {
        const [pRes, dRes, sRes] = await Promise.all([
          fetch(`${API}/api/patients`),
          fetch(`${API}/api/doctors`),
          fetch(`${API}/api/services`),
        ]);
        if (pRes.ok) setPatients(await pRes.json());
        if (dRes.ok) setDoctors(await dRes.json());
        if (sRes.ok) setServices(await sRes.json());
      } catch {
        /* silent */
      }
    };
    load();
  }, [showModal]);

  /* ---------- Update appointment status ---------- */
  const updateStatus = async (id: number, status: Appointment["status"]) => {
    setUpdatingId(id);
    try {
      const res = await fetch(
        `${API}/api/clinicadmin/appointments/${id}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) throw new Error("Update failed");
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a)),
      );
    } catch {
      alert("Failed to update appointment status.");
    } finally {
      setUpdatingId(null);
    }
  };

  /* ---------- Create appointment ---------- */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/clinicadmin/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: Number(form.patient_id),
          doctor_id: Number(form.doctor_id),
          service_id: Number(form.service_id),
          date: form.date,
          time: form.time,
          reason: form.reason,
        }),
      });
      if (!res.ok) throw new Error("Create failed");
      setShowModal(false);
      setForm({
        patient_id: "",
        doctor_id: "",
        service_id: "",
        date: new Date().toISOString().split("T")[0],
        time: "09:00",
        reason: "",
      });
      fetchAppointments();
    } catch {
      alert("Failed to create appointment.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Derived counts ---------- */
  const counts = {
    scheduled: appointments.filter((a) => a.status === "scheduled").length,
    completed: appointments.filter((a) => a.status === "completed").length,
    no_show: appointments.filter((a) => a.status === "no_show").length,
  };

  /* ---------- Render ---------- */
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          Appointments
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition"
        >
          <CalendarPlus className="h-4 w-4" /> Schedule New
        </button>
      </div>

      {/* Stats header */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Scheduled", count: counts.scheduled, color: "text-blue-600 bg-blue-50" },
          { label: "Completed", count: counts.completed, color: "text-green-600 bg-green-50" },
          { label: "No-Show", count: counts.no_show, color: "text-red-600 bg-red-50" },
        ].map((s) => (
          <div
            key={s.label}
            className={cn(
              "rounded-xl p-4 text-center font-semibold",
              s.color,
            )}
          >
            <span className="block text-2xl">{s.count}</span>
            <span className="text-xs uppercase tracking-wide">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 rounded-md px-4 py-2 text-sm font-medium transition",
              activeTab === tab.key
                ? "bg-white text-[#45BFD3] shadow-sm"
                : "text-gray-500 hover:text-gray-700",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#45BFD3]" />
        </div>
      ) : error ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-red-500">
          <AlertCircle className="h-8 w-8" />
          <p>{error}</p>
          <button
            onClick={fetchAppointments}
            className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      ) : appointments.length === 0 ? (
        <p className="py-16 text-center text-gray-400">
          No appointments found for this period.
        </p>
      ) : (
        <div className="space-y-3">
          {appointments.map((appt, i) => {
            const badge = STATUS_MAP[appt.status];
            return (
              <motion.div
                key={appt.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
              >
                {/* Time */}
                <div className="flex items-center gap-2 text-sm font-semibold text-[#45BFD3] sm:w-24">
                  <Clock className="h-4 w-4" />
                  {appt.time}
                </div>

                {/* Details */}
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="flex items-center gap-1 font-medium text-gray-800">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      {appt.patient_name}
                    </span>
                    <span className="flex items-center gap-1 text-gray-500">
                      <Stethoscope className="h-3.5 w-3.5 text-gray-400" />
                      {appt.doctor_name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{appt.service}</p>
                </div>

                {/* Badge */}
                <span
                  className={cn(
                    "self-start rounded-full px-3 py-1 text-xs font-medium sm:self-center",
                    badge.bg,
                    badge.text,
                  )}
                >
                  {badge.label}
                </span>

                {/* Actions */}
                {appt.status === "scheduled" && (
                  <div className="flex gap-2 self-start sm:self-center">
                    <button
                      disabled={updatingId === appt.id}
                      onClick={() => updateStatus(appt.id, "completed")}
                      title="Mark completed"
                      className="rounded-lg border border-green-200 p-2 text-green-600 hover:bg-green-50 transition disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      disabled={updatingId === appt.id}
                      onClick={() => updateStatus(appt.id, "no_show")}
                      title="Mark no-show"
                      className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                    <button
                      disabled={updatingId === appt.id}
                      onClick={() => updateStatus(appt.id, "cancelled")}
                      title="Cancel"
                      className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-gray-50 transition disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ---- Schedule New Modal ---- */}
      <AnimatePresence>
        {showModal && (
          <Fragment>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setShowModal(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:inset-x-auto sm:w-full"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Schedule New Appointment
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                {/* Patient */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Patient
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={form.patient_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, patient_id: e.target.value }))
                      }
                      className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-8 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    >
                      <option value="">Select patient</option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-gray-400" />
                  </div>
                </div>

                {/* Doctor */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Doctor
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={form.doctor_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, doctor_id: e.target.value }))
                      }
                      className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-8 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    >
                      <option value="">Select doctor</option>
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-gray-400" />
                  </div>
                </div>

                {/* Service */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Service
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={form.service_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, service_id: e.target.value }))
                      }
                      className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-8 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    >
                      <option value="">Select service</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-gray-400" />
                  </div>
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Date
                    </label>
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, date: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Time
                    </label>
                    <input
                      type="time"
                      required
                      value={form.time}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, time: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    />
                  </div>
                </div>

                {/* Reason / Notes */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Reason / Notes
                  </label>
                  <textarea
                    rows={3}
                    value={form.reason}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, reason: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition resize-none"
                    placeholder="Optional notes..."
                  />
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition disabled:opacity-60"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Schedule
                  </button>
                </div>
              </form>
            </motion.div>
          </Fragment>
        )}
      </AnimatePresence>
    </div>
  );
}
