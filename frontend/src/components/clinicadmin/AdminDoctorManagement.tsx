import { useState, useEffect, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserPlus,
  Star,
  Phone,
  Mail,
  Calendar,
  X,
  DollarSign,
  GraduationCap,
  Languages,
  Stethoscope,
  Building2,
  Clock,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

/* ---------- Constants ---------- */

const SPECIALTIES = [
  "Family Medicine",
  "Internal Medicine",
  "Pediatrics",
  "Emergency Medicine",
  "Cardiology",
  "Dermatology",
  "Endocrinology",
  "Gastroenterology",
  "Neurology",
  "Obstetrics & Gynecology",
  "Oncology",
  "Ophthalmology",
  "Orthopedics",
  "Psychiatry",
  "Pulmonology",
  "Radiology",
  "Surgery",
  "Urology",
  "Physician Assistant",
] as const;

const INSURANCE_PROVIDERS = [
  "Aetna",
  "Blue Cross",
  "Cigna",
  "Humana",
  "Kaiser",
  "Medicaid",
  "United Healthcare",
] as const;

const TITLE_OPTIONS = ["MD", "DO", "NP", "PA-C"] as const;

/* ---------- Types ---------- */

interface Doctor {
  id: number;
  first_name: string;
  last_name: string;
  title: string;
  specialty: string;
  sub_specialty?: string;
  email: string;
  phone: string;
  bio?: string;
  languages: string[];
  education?: string;
  certifications?: string;
  consultation_fee: number;
  clinic_id?: number;
  clinic_name?: string;
  rating?: number;
  accepted_insurance: string[];
  photo_url?: string;
}

/** Normalize a languages value from the API (may be a string or array) into a string[]. */
function normalizeLanguages(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string" && val.trim()) {
    return val.split(",").map((l) => l.trim()).filter(Boolean);
  }
  return [];
}

/** Normalize an accepted_insurance value from the API (may be a string or array) into a string[]. */
function normalizeInsurance(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string" && val.trim()) {
    return val.split(",").map((p) => p.trim()).filter(Boolean);
  }
  return [];
}

/** Normalize a raw doctor object from the API. */
function normalizeDoctor(raw: Record<string, unknown>): Doctor {
  return {
    ...raw,
    languages: normalizeLanguages(raw.languages),
    accepted_insurance: normalizeInsurance(raw.accepted_insurance),
    consultation_fee: Number(raw.consultation_fee) || 0,
  } as Doctor;
}

interface Clinic {
  id: number;
  name: string;
}

interface CalendarAppointment {
  id: number;
  date: string;
  time: string;
  patient_name: string;
  status: "scheduled" | "confirmed" | "cancelled";
}

interface DoctorFormState {
  first_name: string;
  last_name: string;
  title: string;
  specialty: string;
  sub_specialty: string;
  email: string;
  phone: string;
  bio: string;
  languages: string;
  education: string;
  certifications: string;
  consultation_fee: string;
  clinic_id: string;
  accepted_insurance: string[];
}

const EMPTY_FORM: DoctorFormState = {
  first_name: "",
  last_name: "",
  title: "MD",
  specialty: "",
  sub_specialty: "",
  email: "",
  phone: "",
  bio: "",
  languages: "",
  education: "",
  certifications: "",
  consultation_fee: "",
  clinic_id: "",
  accepted_insurance: [],
};

/* ---------- Helpers ---------- */

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(v);

const getInitials = (first: string, last: string) =>
  `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.3 },
  }),
};

const STATUS_BADGE: Record<
  CalendarAppointment["status"],
  { label: string; bg: string; text: string }
> = {
  scheduled: { label: "Scheduled", bg: "bg-blue-100", text: "text-blue-700" },
  confirmed: { label: "Confirmed", bg: "bg-green-100", text: "text-green-700" },
  cancelled: { label: "Cancelled", bg: "bg-red-100", text: "text-red-700" },
};

/* ================================================================== */
/*  AdminDoctorManagement                                              */
/* ================================================================== */
export default function AdminDoctorManagement() {
  /* --- Data state --- */
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* --- Modal state --- */
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<DoctorFormState>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /* --- Side panel state --- */
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarAppointments, setCalendarAppointments] = useState<
    CalendarAppointment[]
  >([]);

  /* ---------- Fetch doctors ---------- */
  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/doctors`);
      if (!res.ok) throw new Error(`Failed to fetch doctors (${res.status})`);
      const data = await res.json();
      const raw: Record<string, unknown>[] = data.doctors || data;
      setDoctors(raw.map(normalizeDoctor));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  /* ---------- Fetch clinics ---------- */
  const fetchClinics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/clinics`);
      if (!res.ok) return;
      const data = await res.json();
      setClinics(data.clinics || data);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchDoctors();
    fetchClinics();
  }, [fetchDoctors, fetchClinics]);

  /* ---------- Fetch calendar for a doctor ---------- */
  const fetchCalendar = useCallback(async (doctorId: number) => {
    setCalendarLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/doctor/${doctorId}/calendar`,
      );
      if (!res.ok) throw new Error("Failed to load calendar");
      const data = await res.json();
      setCalendarAppointments(data.appointments || data);
    } catch {
      setCalendarAppointments([]);
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  /* ---------- Select a doctor card ---------- */
  const handleSelectDoctor = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    fetchCalendar(doctor.id);
  };

  /* ---------- Close side panel ---------- */
  const closeSidePanel = () => {
    setSelectedDoctor(null);
    setCalendarAppointments([]);
  };

  /* ---------- Toggle insurance checkbox ---------- */
  const toggleInsurance = (provider: string) => {
    setForm((prev) => {
      const current = prev.accepted_insurance;
      const next = current.includes(provider)
        ? current.filter((p) => p !== provider)
        : [...current, provider];
      return { ...prev, accepted_insurance: next };
    });
  };

  /* ---------- Add doctor ---------- */
  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        title: form.title,
        specialty: form.specialty,
        sub_specialty: form.sub_specialty.trim() || undefined,
        email: form.email.trim(),
        phone: form.phone.trim(),
        bio: form.bio.trim() || undefined,
        languages: form.languages.trim() || "English",
        education: form.education.trim() || undefined,
        certifications: form.certifications.trim() || undefined,
        consultation_fee: parseFloat(form.consultation_fee) || 0,
        clinic_id: form.clinic_id ? Number(form.clinic_id) : undefined,
        accepted_insurance: form.accepted_insurance.join(",") || undefined,
      };

      const res = await fetch(`${API_BASE_URL}/api/clinicadmin/doctors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Failed to add doctor (${res.status})`);
      }

      setShowAddModal(false);
      setForm({ ...EMPTY_FORM });
      fetchDoctors();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to add doctor");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Loading / Error states ---------- */
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#45BFD3]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-red-500">
        <AlertCircle className="h-10 w-10" />
        <p className="text-lg font-medium">{error}</p>
        <button
          onClick={fetchDoctors}
          className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* ---- Header ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            Doctor Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {doctors.length} doctor{doctors.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition"
        >
          <UserPlus className="h-4 w-4" /> Add Doctor
        </button>
      </div>

      {/* ---- Content area (cards + side panel) ---- */}
      <div className="flex gap-6">
        {/* Doctor cards grid */}
        <div
          className={cn(
            "flex-1 min-w-0 transition-all duration-300",
            selectedDoctor ? "lg:pr-0" : "",
          )}
        >
          {doctors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <Stethoscope className="h-12 w-12 mb-3" />
              <p className="text-lg font-medium">No doctors yet</p>
              <p className="text-sm mt-1">
                Click &ldquo;Add Doctor&rdquo; to get started.
              </p>
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-4",
                selectedDoctor
                  ? "grid-cols-1 md:grid-cols-2"
                  : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
              )}
            >
              {doctors.map((doctor, i) => (
                <motion.div
                  key={doctor.id}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  onClick={() => handleSelectDoctor(doctor)}
                  className={cn(
                    "cursor-pointer rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md hover:border-[#45BFD3]/40",
                    selectedDoctor?.id === doctor.id
                      ? "border-[#45BFD3] ring-2 ring-[#45BFD3]/20"
                      : "border-gray-100",
                  )}
                >
                  {/* Top: avatar + name */}
                  <div className="flex items-start gap-4">
                    {/* Initials avatar */}
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#45BFD3]/10 text-[#45BFD3] text-lg font-bold">
                      {getInitials(doctor.first_name, doctor.last_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-gray-900">
                        {doctor.first_name} {doctor.last_name}
                        {doctor.title ? `, ${doctor.title}` : ""}
                      </h3>
                      <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
                        <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{doctor.specialty}</span>
                      </p>
                      {doctor.clinic_name && (
                        <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{doctor.clinic_name}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Rating */}
                  {doctor.rating != null && doctor.rating > 0 && (
                    <div className="mt-3 flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <Star
                          key={idx}
                          className={cn(
                            "h-4 w-4",
                            idx < Math.round(doctor.rating!)
                              ? "fill-amber-400 text-amber-400"
                              : "text-gray-200",
                          )}
                        />
                      ))}
                      <span className="ml-1 text-xs font-medium text-gray-500">
                        {doctor.rating.toFixed(1)}
                      </span>
                    </div>
                  )}

                  {/* Details */}
                  <div className="mt-4 space-y-2 text-sm text-gray-600">
                    {/* Consultation Fee */}
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-gray-400 shrink-0" />
                      <span>{currency(doctor.consultation_fee)}</span>
                    </div>

                    {/* Languages */}
                    {doctor.languages && doctor.languages.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Languages className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="truncate">
                          {doctor.languages.join(", ")}
                        </span>
                      </div>
                    )}

                    {/* Contact */}
                    {doctor.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="truncate">{doctor.email}</span>
                      </div>
                    )}
                    {doctor.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                        <span>{doctor.phone}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Side panel: Doctor calendar ---- */}
        <AnimatePresence>
          {selectedDoctor && (
            <motion.aside
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.25 }}
              className="hidden lg:block w-96 shrink-0"
            >
              <div className="sticky top-6 rounded-xl border border-gray-100 bg-white shadow-sm">
                {/* Panel header */}
                <div className="flex items-start justify-between border-b border-gray-100 p-5">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 truncate">
                      {selectedDoctor.first_name} {selectedDoctor.last_name}
                      {selectedDoctor.title
                        ? `, ${selectedDoctor.title}`
                        : ""}
                    </h2>
                    <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
                      <Stethoscope className="h-3.5 w-3.5" />
                      {selectedDoctor.specialty}
                    </p>
                  </div>
                  <button
                    onClick={closeSidePanel}
                    className="rounded-full p-1 text-gray-400 hover:bg-gray-100 transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Calendar content */}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-[#45BFD3]" />
                    <h3 className="text-sm font-semibold text-gray-800">
                      Upcoming Appointments
                    </h3>
                  </div>

                  {calendarLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-[#45BFD3]" />
                    </div>
                  ) : calendarAppointments.length === 0 ? (
                    <div className="py-10 text-center text-gray-400">
                      <Calendar className="mx-auto h-10 w-10 mb-2" />
                      <p className="text-sm">No upcoming appointments</p>
                    </div>
                  ) : (
                    <ul className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                      {calendarAppointments.map((appt) => {
                        const badge = STATUS_BADGE[appt.status] ?? STATUS_BADGE.scheduled;
                        return (
                          <li
                            key={appt.id}
                            className="rounded-lg border border-gray-100 bg-gray-50/50 p-3"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                                <Calendar className="h-3 w-3 text-gray-400" />
                                {appt.date}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  badge.bg,
                                  badge.text,
                                )}
                              >
                                {badge.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Clock className="h-3.5 w-3.5 text-gray-400" />
                              {appt.time}
                            </div>
                            <p className="mt-1 text-sm font-medium text-gray-800">
                              {appt.patient_name}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* View Full Calendar link */}
                  <button className="mt-4 w-full rounded-lg border border-[#45BFD3]/30 py-2 text-sm font-medium text-[#45BFD3] hover:bg-[#45BFD3]/5 transition">
                    View Full Calendar
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ---- Mobile side panel (overlay for smaller screens) ---- */}
      <AnimatePresence>
        {selectedDoctor && (
          <Fragment>
            {/* Mobile backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={closeSidePanel}
            />
            {/* Mobile slide-in panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-xl lg:hidden overflow-y-auto"
            >
              {/* Panel header */}
              <div className="flex items-start justify-between border-b border-gray-100 p-5">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">
                    {selectedDoctor.first_name} {selectedDoctor.last_name}
                    {selectedDoctor.title ? `, ${selectedDoctor.title}` : ""}
                  </h2>
                  <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
                    <Stethoscope className="h-3.5 w-3.5" />
                    {selectedDoctor.specialty}
                  </p>
                </div>
                <button
                  onClick={closeSidePanel}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Calendar content */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-5 w-5 text-[#45BFD3]" />
                  <h3 className="text-sm font-semibold text-gray-800">
                    Upcoming Appointments
                  </h3>
                </div>

                {calendarLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-[#45BFD3]" />
                  </div>
                ) : calendarAppointments.length === 0 ? (
                  <div className="py-10 text-center text-gray-400">
                    <Calendar className="mx-auto h-10 w-10 mb-2" />
                    <p className="text-sm">No upcoming appointments</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {calendarAppointments.map((appt) => {
                      const badge = STATUS_BADGE[appt.status] ?? STATUS_BADGE.scheduled;
                      return (
                        <li
                          key={appt.id}
                          className="rounded-lg border border-gray-100 bg-gray-50/50 p-3"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                              <Calendar className="h-3 w-3 text-gray-400" />
                              {appt.date}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                badge.bg,
                                badge.text,
                              )}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-gray-600">
                            <Clock className="h-3.5 w-3.5 text-gray-400" />
                            {appt.time}
                          </div>
                          <p className="mt-1 text-sm font-medium text-gray-800">
                            {appt.patient_name}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <button className="mt-4 w-full rounded-lg border border-[#45BFD3]/30 py-2 text-sm font-medium text-[#45BFD3] hover:bg-[#45BFD3]/5 transition">
                  View Full Calendar
                </button>
              </div>
            </motion.div>
          </Fragment>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/*  Add Doctor Modal                                                 */}
      {/* ================================================================ */}
      <AnimatePresence>
        {showAddModal && (
          <Fragment>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setShowAddModal(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[3%] bottom-[3%] z-50 mx-auto flex max-w-2xl flex-col rounded-2xl bg-white shadow-xl sm:inset-x-auto sm:w-full"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
                <h2 className="text-lg font-semibold text-gray-900">
                  Add New Doctor
                </h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal body (scrollable) */}
              <form
                onSubmit={handleAddDoctor}
                className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
              >
                {/* Error banner */}
                {formError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {formError}
                  </div>
                )}

                {/* Row: First Name / Last Name */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      First Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.first_name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, first_name: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                      placeholder="Jane"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Last Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.last_name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, last_name: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                      placeholder="Smith"
                    />
                  </div>
                </div>

                {/* Row: Title / Specialty */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Title <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <select
                        required
                        value={form.title}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, title: e.target.value }))
                        }
                        className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-8 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                      >
                        {TITLE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Specialty <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <select
                        required
                        value={form.specialty}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, specialty: e.target.value }))
                        }
                        className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-8 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                      >
                        <option value="">Select specialty</option>
                        {SPECIALTIES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                </div>

                {/* Sub-specialty */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Sub-specialty
                  </label>
                  <input
                    type="text"
                    value={form.sub_specialty}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sub_specialty: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    placeholder="e.g. Interventional Cardiology"
                  />
                </div>

                {/* Row: Email / Phone */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Email <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, email: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                        placeholder="jane@clinic.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Phone <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <input
                        type="tel"
                        required
                        value={form.phone}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, phone: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                </div>

                {/* Bio */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Bio
                  </label>
                  <textarea
                    rows={3}
                    value={form.bio}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, bio: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition resize-none"
                    placeholder="Brief professional biography..."
                  />
                </div>

                {/* Languages */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    <span className="flex items-center gap-1.5">
                      <Languages className="h-4 w-4 text-gray-400" />
                      Languages
                    </span>
                  </label>
                  <input
                    type="text"
                    value={form.languages}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, languages: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    placeholder="English, Spanish (comma-separated)"
                  />
                </div>

                {/* Row: Education / Certifications */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      <span className="flex items-center gap-1.5">
                        <GraduationCap className="h-4 w-4 text-gray-400" />
                        Education
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.education}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, education: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                      placeholder="Harvard Medical School"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Certifications
                    </label>
                    <input
                      type="text"
                      value={form.certifications}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          certifications: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                      placeholder="Board Certified"
                    />
                  </div>
                </div>

                {/* Row: Consultation Fee / Clinic */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      <span className="flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        Consultation Fee
                      </span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.consultation_fee}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          consultation_fee: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                      placeholder="150.00"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        Clinic
                      </span>
                    </label>
                    <div className="relative">
                      <select
                        value={form.clinic_id}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, clinic_id: e.target.value }))
                        }
                        className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-8 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                      >
                        <option value="">Select clinic</option>
                        {clinics.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                </div>

                {/* Accepted Insurance */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Accepted Insurance
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {INSURANCE_PROVIDERS.map((provider) => (
                      <label
                        key={provider}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition",
                          form.accepted_insurance.includes(provider)
                            ? "border-[#45BFD3] bg-[#45BFD3]/5 text-[#45BFD3]"
                            : "border-gray-200 text-gray-600 hover:border-gray-300",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={form.accepted_insurance.includes(provider)}
                          onChange={() => toggleInsurance(provider)}
                          className="h-4 w-4 rounded border-gray-300 text-[#45BFD3] focus:ring-[#45BFD3]/30"
                        />
                        <span className="truncate">{provider}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Submit row */}
                <div className="flex justify-end gap-3 pt-3 pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setForm({ ...EMPTY_FORM });
                      setFormError(null);
                    }}
                    className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition disabled:opacity-60"
                  >
                    {submitting && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Add Doctor
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
