import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  AlertTriangle,
  ClipboardList,
  Activity,
  Pill,
  StickyNote,
  CalendarDays,
  FlaskConical,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/api";
import VitalsChart from "./VitalsChart";
import NoteComposer from "./NoteComposer";

/* ================================================================== */
/*  Types                                                             */
/* ================================================================== */

interface Diagnosis {
  name: string;
  date: string;
  status: string;
}

interface Prescription {
  id: number;
  medication_name: string;
  dosage: string;
  frequency: string;
  quantity: number;
  refills: number;
  instructions: string;
  pharmacy: string;
  active: boolean;
  prescribed_date: string;
}

interface VitalReading {
  heart_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  oxygen_level: number | null;
  recorded_at: string;
}

interface Note {
  id: number;
  content: string;
  note_type: "text" | "voice" | "both";
  audio_url: string | null;
  created_at: string;
}

interface AppointmentRecord {
  id: number;
  date: string;
  time: string;
  service: string;
  status: string;
}

interface LabResult {
  id: number;
  lab_type: string;
  test_name: string;
  value: string;
  unit: string;
  reference_range: string;
  status: "normal" | "abnormal" | "critical";
  date: string;
}

interface PatientDetailData {
  patient_id: number;
  patient_name: string;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  insurance_provider: string | null;
  provider_name: string | null;
  provider_specialty: string | null;
  diagnoses: Diagnosis[];
  prescriptions: Prescription[];
  vitals: VitalReading[];
  notes: Note[];
  appointments: AppointmentRecord[];
  lab_results: LabResult[];
}

interface PatientDetailProps {
  doctorId: number;
  patientId: number;
}

/* ================================================================== */
/*  Tabs config                                                       */
/* ================================================================== */

const TABS = [
  { key: "history", label: "Medical History", icon: ClipboardList },
  { key: "vitals", label: "Health Dashboard", icon: Activity },
  { key: "medications", label: "Medications", icon: Pill },
  { key: "notes", label: "Notes & Instructions", icon: StickyNote },
  { key: "appointments", label: "Appointments", icon: CalendarDays },
  { key: "labs", label: "Labs & Radiology", icon: FlaskConical },
  { key: "comms", label: "Communications", icon: MessageCircle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/* ================================================================== */
/*  Helpers                                                           */
/* ================================================================== */

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const apptStatusStyles: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  no_show: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

const labStatusStyles: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  normal: { bg: "bg-green-50", text: "text-green-700", icon: CheckCircle2 },
  abnormal: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
  critical: { bg: "bg-red-100", text: "text-red-800", icon: AlertTriangle },
};

/* ================================================================== */
/*  Main Component                                                    */
/* ================================================================== */

export default function PatientDetail({ doctorId, patientId }: PatientDetailProps) {
  const [data, setData] = useState<PatientDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("history");
  const [vitalsRange, setVitalsRange] = useState("1 week");

  /* Prescription form */
  const [showRxForm, setShowRxForm] = useState(false);
  const [rxForm, setRxForm] = useState({
    medication_name: "",
    dosage: "",
    frequency: "",
    quantity: "",
    refills: "",
    instructions: "",
    pharmacy: "",
  });
  const [rxSending, setRxSending] = useState(false);

  /* Appointment form */
  const [showApptForm, setShowApptForm] = useState(false);
  const [apptForm, setApptForm] = useState({
    date: "",
    time: "",
    service: "",
  });
  const [apptSending, setApptSending] = useState(false);

  /* Communications state */
  const [comms, setComms] = useState<Array<{
    id: number;
    reply_text: string;
    audio_url: string | null;
    original_update: string;
    update_date: string;
    created_at: string;
  }>>([]);
  const [commsLoading, setCommsLoading] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Fetch                                                           */
  /* ---------------------------------------------------------------- */

  const fetchComms = useCallback(async () => {
    setCommsLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/doctor/${doctorId}/patient/${patientId}/communications`
      );
      if (res.ok) {
        const json = await res.json();
        setComms(json.communications || []);
      }
    } catch (err) {
      console.error("Error fetching communications:", err);
    } finally {
      setCommsLoading(false);
    }
  }, [doctorId, patientId]);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/doctor/${doctorId}/patients/${patientId}/detail`
      );
      if (!res.ok) throw new Error(`Failed to load patient detail (${res.status})`);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load patient detail");
    } finally {
      setLoading(false);
    }
  }, [doctorId, patientId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Fetch communications when tab switches to comms
  useEffect(() => {
    if (tab === "comms" && comms.length === 0 && !commsLoading) {
      fetchComms();
    }
  }, [tab, comms.length, commsLoading, fetchComms]);

  /* ---------------------------------------------------------------- */
  /*  Actions                                                         */
  /* ---------------------------------------------------------------- */

  const handleRxSubmit = async () => {
    if (!rxForm.medication_name.trim()) return;
    setRxSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/doctor/${doctorId}/prescriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          ...rxForm,
          quantity: Number(rxForm.quantity) || 0,
          refills: Number(rxForm.refills) || 0,
        }),
      });
      if (!res.ok) throw new Error("Failed to create prescription");
      setShowRxForm(false);
      setRxForm({ medication_name: "", dosage: "", frequency: "", quantity: "", refills: "", instructions: "", pharmacy: "" });
      fetchDetail();
    } catch {
      // Error handled silently for now
    } finally {
      setRxSending(false);
    }
  };

  const handleApptSubmit = async () => {
    if (!apptForm.date || !apptForm.time || !apptForm.service.trim()) return;
    setApptSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/doctor/${doctorId}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          ...apptForm,
        }),
      });
      if (!res.ok) throw new Error("Failed to schedule appointment");
      setShowApptForm(false);
      setApptForm({ date: "", time: "", service: "" });
      fetchDetail();
    } catch {
      // Error handled silently for now
    } finally {
      setApptSending(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Loading / Error states                                          */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#45BFD3]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-50 px-5 py-4 text-sm text-red-600">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        {error || "Could not load patient data."}
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Tab content renderers                                           */
  /* ---------------------------------------------------------------- */

  const renderHistory = () => (
    <div className="space-y-6">
      {/* Registration info */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100 space-y-4">
        <h3 className="font-semibold text-gray-900">Registration Info</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label="Name" value={data.patient_name} />
          <InfoRow label="Date of Birth" value={data.date_of_birth ? new Date(data.date_of_birth).toLocaleDateString() : "--"} />
          <InfoRow label="Gender" value={data.gender || "--"} />
          <InfoRow label="Phone" value={data.phone || "--"} />
          <InfoRow label="Email" value={data.email || "--"} />
          <InfoRow label="Address" value={data.address || "--"} />
          <InfoRow label="Insurance" value={data.insurance_provider || "--"} />
        </div>
      </div>

      {/* Provider info */}
      {(data.provider_name || data.provider_specialty) && (
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100 space-y-3">
          <h3 className="font-semibold text-gray-900">Provider Info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <InfoRow label="Provider" value={data.provider_name || "--"} />
            <InfoRow label="Specialty" value={data.provider_specialty || "--"} />
          </div>
        </div>
      )}

      {/* Diagnoses */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100 space-y-3">
        <h3 className="font-semibold text-gray-900">Diagnoses</h3>
        {data.diagnoses.length === 0 ? (
          <p className="text-sm text-gray-400">No diagnoses recorded.</p>
        ) : (
          <div className="space-y-2">
            {data.diagnoses.map((dx, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-800">{dx.name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(dx.date).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    dx.status === "active" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"
                  )}
                >
                  {dx.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prescriptions summary */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100 space-y-3">
        <h3 className="font-semibold text-gray-900">Active Prescriptions</h3>
        {data.prescriptions.filter((p) => p.active).length === 0 ? (
          <p className="text-sm text-gray-400">No active prescriptions.</p>
        ) : (
          <div className="space-y-2">
            {data.prescriptions
              .filter((p) => p.active)
              .map((rx) => (
                <div key={rx.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{rx.medication_name}</p>
                    <p className="text-xs text-gray-500">{rx.dosage} &middot; {rx.frequency}</p>
                  </div>
                  <Pill className="h-4 w-4 text-[#45BFD3]" />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderVitals = () => (
    <div className="space-y-4">
      {/* Time range filter */}
      <div className="flex flex-wrap gap-2">
        {["1 day", "1 week", "1 month", "1 year"].map((range) => (
          <button
            key={range}
            onClick={() => setVitalsRange(range)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors",
              vitalsRange === range
                ? "bg-[#45BFD3] text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {range}
          </button>
        ))}
      </div>

      <VitalsChart vitals={data.vitals} timeRange={vitalsRange} />
    </div>
  );

  const renderMedications = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Prescriptions</h3>
        <button
          onClick={() => setShowRxForm(!showRxForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#45BFD3] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#3baab8] transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          New Prescription
        </button>
      </div>

      {/* New prescription form */}
      <AnimatePresence>
        {showRxForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl bg-white p-5 shadow-sm border border-[#45BFD3]/30 space-y-4">
              <h4 className="font-medium text-gray-800 text-sm">New Prescription</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Medication Name" value={rxForm.medication_name} onChange={(v) => setRxForm({ ...rxForm, medication_name: v })} placeholder="e.g., Lisinopril" />
                <FormField label="Dosage" value={rxForm.dosage} onChange={(v) => setRxForm({ ...rxForm, dosage: v })} placeholder="e.g., 10mg" />
                <FormField label="Frequency" value={rxForm.frequency} onChange={(v) => setRxForm({ ...rxForm, frequency: v })} placeholder="e.g., Once daily" />
                <FormField label="Quantity" value={rxForm.quantity} onChange={(v) => setRxForm({ ...rxForm, quantity: v })} placeholder="e.g., 30" type="number" />
                <FormField label="Refills" value={rxForm.refills} onChange={(v) => setRxForm({ ...rxForm, refills: v })} placeholder="e.g., 3" type="number" />
                <FormField label="Pharmacy" value={rxForm.pharmacy} onChange={(v) => setRxForm({ ...rxForm, pharmacy: v })} placeholder="e.g., CVS Main St" />
              </div>
              <FormField label="Instructions" value={rxForm.instructions} onChange={(v) => setRxForm({ ...rxForm, instructions: v })} placeholder="Take with food..." fullWidth />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowRxForm(false)} className="rounded-lg px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleRxSubmit}
                  disabled={rxSending || !rxForm.medication_name.trim()}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors",
                    rxSending || !rxForm.medication_name.trim()
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-[#45BFD3] text-white hover:bg-[#3baab8] shadow-sm"
                  )}
                >
                  {rxSending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save Prescription
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prescriptions list */}
      {data.prescriptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Pill className="h-10 w-10 text-gray-300 mb-2" />
          <p className="text-gray-500 text-sm">No prescriptions recorded.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.prescriptions.map((rx) => (
            <div
              key={rx.id}
              className={cn(
                "rounded-xl bg-white p-4 shadow-sm border transition-colors",
                rx.active ? "border-gray-100" : "border-gray-100 opacity-60"
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm">{rx.medication_name}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        rx.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      )}
                    >
                      {rx.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {rx.dosage} &middot; {rx.frequency} &middot; Qty: {rx.quantity} &middot; Refills: {rx.refills}
                  </p>
                  {rx.instructions && (
                    <p className="text-xs text-gray-400 mt-1 italic">{rx.instructions}</p>
                  )}
                  {rx.pharmacy && (
                    <p className="text-xs text-gray-400 mt-0.5">Pharmacy: {rx.pharmacy}</p>
                  )}
                </div>
                <p className="text-xs text-gray-400 shrink-0">
                  {new Date(rx.prescribed_date).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderNotes = () => (
    <div className="space-y-6">
      <NoteComposer doctorId={doctorId} patientId={patientId} onNoteSent={fetchDetail} />

      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900">Past Notes</h4>
        {data.notes.length === 0 ? (
          <p className="text-sm text-gray-400">No notes yet.</p>
        ) : (
          data.notes.map((note) => (
            <div key={note.id} className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 space-y-2">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                    note.note_type === "voice"
                      ? "bg-purple-100 text-purple-700"
                      : note.note_type === "both"
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-gray-100 text-gray-600"
                  )}
                >
                  {note.note_type}
                </span>
                <p className="text-xs text-gray-400">
                  {new Date(note.created_at).toLocaleString()}
                </p>
              </div>
              {note.content && (
                <p className="text-sm text-gray-700 leading-relaxed">{note.content}</p>
              )}
              {note.audio_url && (
                <audio controls src={note.audio_url} className="w-full h-8 mt-1" />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderAppointments = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Appointments</h3>
        <button
          onClick={() => setShowApptForm(!showApptForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#45BFD3] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#3baab8] transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Schedule New
        </button>
      </div>

      {/* New appointment form */}
      <AnimatePresence>
        {showApptForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl bg-white p-5 shadow-sm border border-[#45BFD3]/30 space-y-4">
              <h4 className="font-medium text-gray-800 text-sm">Schedule Appointment</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Date" value={apptForm.date} onChange={(v) => setApptForm({ ...apptForm, date: v })} type="date" />
                <FormField label="Time" value={apptForm.time} onChange={(v) => setApptForm({ ...apptForm, time: v })} type="time" />
                <FormField label="Service" value={apptForm.service} onChange={(v) => setApptForm({ ...apptForm, service: v })} placeholder="e.g., Follow-up" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowApptForm(false)} className="rounded-lg px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleApptSubmit}
                  disabled={apptSending || !apptForm.date || !apptForm.time || !apptForm.service.trim()}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors",
                    apptSending || !apptForm.date || !apptForm.time || !apptForm.service.trim()
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-[#45BFD3] text-white hover:bg-[#3baab8] shadow-sm"
                  )}
                >
                  {apptSending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Schedule
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Appointments list */}
      {data.appointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CalendarDays className="h-10 w-10 text-gray-300 mb-2" />
          <p className="text-gray-500 text-sm">No appointments recorded.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.appointments.map((appt) => (
            <div key={appt.id} className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
              <div className="flex flex-col items-center shrink-0 w-16 text-center">
                <Clock className="h-4 w-4 text-gray-400 mb-1" />
                <span className="text-xs font-semibold text-gray-900">
                  {new Date(`${appt.date}T${appt.time}`).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(appt.date).toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="w-px h-10 bg-gray-200" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{appt.service}</p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium shrink-0 capitalize",
                  apptStatusStyles[appt.status] ?? "bg-gray-100 text-gray-600"
                )}
              >
                {appt.status.replace("_", " ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderLabs = () => {
    // Group by lab_type
    const grouped: Record<string, LabResult[]> = {};
    data.lab_results.forEach((lab) => {
      if (!grouped[lab.lab_type]) grouped[lab.lab_type] = [];
      grouped[lab.lab_type].push(lab);
    });

    const groups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

    if (data.lab_results.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FlaskConical className="h-10 w-10 text-gray-300 mb-2" />
          <p className="text-gray-500 text-sm">No lab results available.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {groups.map(([labType, results]) => (
          <div key={labType} className="space-y-2">
            <h4 className="font-semibold text-gray-800 text-sm uppercase tracking-wide flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-[#45BFD3]" />
              {labType}
            </h4>
            <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Test</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Value</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Reference</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Status</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((lab) => {
                      const st = labStatusStyles[lab.status] ?? labStatusStyles.normal;
                      const StatusIcon = st.icon;
                      return (
                        <tr key={lab.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{lab.test_name}</td>
                          <td className="px-4 py-2.5 text-gray-700">
                            {lab.value} <span className="text-gray-400">{lab.unit}</span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500">{lab.reference_range}</td>
                          <td className="px-4 py-2.5">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", st.bg, st.text)}>
                              <StatusIcon className="h-3 w-3" />
                              {lab.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500">
                            {new Date(lab.date).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Communications tab                                              */
  /* ---------------------------------------------------------------- */

  const renderComms = () => {
    if (commsLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#45BFD3]" />
        </div>
      );
    }

    if (comms.length === 0) {
      return (
        <div className="text-center py-16 text-gray-400">
          <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No communications with this patient yet.</p>
          <p className="text-xs mt-1">Respond to patient updates from the Feed to start a conversation.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {comms.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {/* Original patient update */}
            <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Patient Update</p>
              <p className="text-sm text-gray-700 line-clamp-2">{c.original_update}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(c.update_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
            {/* Doctor reply */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-[#45BFD3] flex items-center justify-center">
                  <MessageCircle className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-900">Your Response</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.reply_text}</p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const tabContent: Record<TabKey, () => React.ReactNode> = {
    history: renderHistory,
    vitals: renderVitals,
    medications: renderMedications,
    notes: renderNotes,
    appointments: renderAppointments,
    labs: renderLabs,
    comms: renderComms,
  };

  /* ---------------------------------------------------------------- */
  /*  Main render                                                     */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      {/* Patient header */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#45BFD3]/15 text-lg font-bold text-[#45BFD3]">
          {initials(data.patient_name)}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{data.patient_name}</h1>
          <p className="text-sm text-gray-500">
            {data.gender && <span className="capitalize">{data.gender}</span>}
            {data.date_of_birth && (
              <span>
                {data.gender ? " \u00B7 " : ""}
                DOB: {new Date(data.date_of_birth).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
        <nav className="flex gap-1 min-w-max">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                tab === key
                  ? "border-[#45BFD3] text-[#45BFD3]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tabContent[tab]()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ================================================================== */
/*  Shared small components                                           */
/* ================================================================== */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  fullWidth,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20 focus:outline-none transition-colors"
      />
    </div>
  );
}
