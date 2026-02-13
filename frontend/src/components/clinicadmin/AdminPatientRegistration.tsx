import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserPlus,
  Search,
  Users,
  Shield,
  Phone,
  Mail,
  MapPin,
  Calendar,
  AlertCircle,
  Check,
  X,
  ClipboardCopy,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

/* ---------- Constants ---------- */
const INSURANCE_PROVIDERS = [
  "Aetna",
  "Blue Cross",
  "Cigna",
  "Humana",
  "Kaiser",
  "Medicaid",
  "United Healthcare",
  "Other",
] as const;

/* ---------- Types ---------- */
interface Patient {
  id: number;
  name: string;
  date_of_birth?: string;
  email?: string;
  phone?: string;
  username?: string;
  created_at: string;
}

interface Credentials {
  username: string;
  password: string;
}

interface FormData {
  full_name: string;
  date_of_birth: string;
  email: string;
  phone: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  insurance_provider: string;
  policy_number: string;
  group_number: string;
}

interface FormErrors {
  [key: string]: string;
}

const INITIAL_FORM: FormData = {
  full_name: "",
  date_of_birth: "",
  email: "",
  phone: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  insurance_provider: "",
  policy_number: "",
  group_number: "",
};

/* ---------- Validation helpers ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;

function validateForm(data: FormData): FormErrors {
  const errors: FormErrors = {};

  if (!data.full_name.trim()) {
    errors.full_name = "Full name is required";
  } else if (data.full_name.trim().length < 2) {
    errors.full_name = "Name must be at least 2 characters";
  }

  if (!data.date_of_birth) {
    errors.date_of_birth = "Date of birth is required";
  } else {
    const dob = new Date(data.date_of_birth);
    const today = new Date();
    if (dob >= today) {
      errors.date_of_birth = "Date of birth must be in the past";
    }
  }

  if (!data.email.trim()) {
    errors.email = "Email is required";
  } else if (!EMAIL_RE.test(data.email.trim())) {
    errors.email = "Please enter a valid email address";
  }

  if (!data.phone.trim()) {
    errors.phone = "Phone number is required";
  } else if (!PHONE_RE.test(data.phone.trim())) {
    errors.phone = "Please enter a valid phone number";
  }

  if (!data.address.trim()) {
    errors.address = "Address is required";
  }

  if (!data.emergency_contact_name.trim()) {
    errors.emergency_contact_name = "Emergency contact name is required";
  }

  if (!data.emergency_contact_phone.trim()) {
    errors.emergency_contact_phone = "Emergency contact phone is required";
  } else if (!PHONE_RE.test(data.emergency_contact_phone.trim())) {
    errors.emergency_contact_phone = "Please enter a valid phone number";
  }

  if (!data.insurance_provider) {
    errors.insurance_provider = "Insurance provider is required";
  }

  if (!data.policy_number.trim()) {
    errors.policy_number = "Policy number is required";
  }

  return errors;
}

/* ---------- Animation variants ---------- */
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.3 },
  }),
};

/* ================================================================== */
/*  Credentials Modal                                                  */
/* ================================================================== */
function CredentialsModal({
  credentials,
  patientName,
  onClose,
}: {
  credentials: Credentials;
  patientName: string;
  onClose: () => void;
}) {
  const [copiedField, setCopiedField] = useState<
    "username" | "password" | null
  >(null);

  const copyToClipboard = async (
    text: string,
    field: "username" | "password",
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", duration: 0.5 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Success icon */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <Check className="h-7 w-7 text-green-600" />
        </div>

        <h3 className="mb-1 text-center text-lg font-semibold text-gray-900">
          Patient Registered Successfully
        </h3>
        <p className="mb-5 text-center text-sm text-gray-500">
          Credentials for{" "}
          <span className="font-medium text-gray-700">{patientName}</span>
        </p>

        {/* HIPAA notice */}
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs leading-relaxed text-amber-700">
            These credentials are displayed only once. Please securely share
            them with the patient in accordance with HIPAA guidelines. Do not
            transmit via unencrypted channels.
          </p>
        </div>

        {/* Username */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Username
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <span className="flex-1 font-mono text-sm text-gray-900">
              {credentials.username}
            </span>
            <button
              onClick={() =>
                copyToClipboard(credentials.username, "username")
              }
              className={cn(
                "rounded p-1 transition-colors",
                copiedField === "username"
                  ? "text-green-600"
                  : "text-gray-400 hover:text-[#45BFD3]",
              )}
              title="Copy username"
            >
              {copiedField === "username" ? (
                <Check size={16} />
              ) : (
                <ClipboardCopy size={16} />
              )}
            </button>
          </div>
        </div>

        {/* Password */}
        <div className="mb-6">
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Temporary Password
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <span className="flex-1 font-mono text-sm text-gray-900">
              {credentials.password}
            </span>
            <button
              onClick={() =>
                copyToClipboard(credentials.password, "password")
              }
              className={cn(
                "rounded p-1 transition-colors",
                copiedField === "password"
                  ? "text-green-600"
                  : "text-gray-400 hover:text-[#45BFD3]",
              )}
              title="Copy password"
            >
              {copiedField === "password" ? (
                <Check size={16} />
              ) : (
                <ClipboardCopy size={16} />
              )}
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-lg bg-[#45BFD3] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#3badbf]"
        >
          Done
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ================================================================== */
/*  AdminPatientRegistration                                           */
/* ================================================================== */
export default function AdminPatientRegistration() {
  /* ---- Form state ---- */
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* ---- Credentials modal ---- */
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [registeredName, setRegisteredName] = useState("");

  /* ---- Patient list ---- */
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  /* ---------- Fetch patients ---------- */
  const fetchPatients = useCallback(async () => {
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/patients`);
      if (!res.ok) throw new Error(`Failed to load patients (${res.status})`);
      const data = await res.json();
      setPatients(Array.isArray(data) ? data : data.patients ?? []);
    } catch (err: unknown) {
      setPatientsError(
        err instanceof Error ? err.message : "Failed to load patients",
      );
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  /* ---------- Filtered patients ---------- */
  const filteredPatients = patients.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      p.username?.toLowerCase().includes(q)
    );
  });

  /* ---------- Form change handler ---------- */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear error for this field on change
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  /* ---------- Submit ---------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/clinicadmin/patients/register-full`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.detail ?? `Registration failed (${res.status})`,
        );
      }

      const data = await res.json();

      if (data.success && data.credentials) {
        setCredentials(data.credentials);
        setRegisteredName(form.full_name);
        setForm(INITIAL_FORM);
        setErrors({});
        // Refresh the patient list
        fetchPatients();
      } else {
        throw new Error(data.detail ?? "Registration failed");
      }
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Field renderer helper ---------- */
  const fieldClasses = (fieldName: string) =>
    cn(
      "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors outline-none",
      "focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20",
      errors[fieldName]
        ? "border-red-300 focus:border-red-400 focus:ring-red-200/50"
        : "border-gray-300",
    );

  const labelClasses = "mb-1 block text-sm font-medium text-gray-700";

  /* ---------- Format date for display ---------- */
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
      {/* ---- Page header ---- */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        custom={0}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#45BFD3]/10">
            <UserPlus className="h-5 w-5 text-[#45BFD3]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Patient Registration
            </h1>
            <p className="text-sm text-gray-500">
              Register new patients and manage existing records
            </p>
          </div>
        </div>
      </motion.div>

      {/* ---- HIPAA compliance banner ---- */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        custom={1}
        className="flex items-start gap-3 rounded-xl border border-[#45BFD3]/20 bg-[#45BFD3]/5 p-4"
      >
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#45BFD3]" />
        <div>
          <p className="text-sm font-medium text-gray-800">
            HIPAA Compliant Registration
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            All patient data is encrypted in transit and at rest. Access is
            logged and auditable. Credentials are auto-generated and shown only
            once.
          </p>
        </div>
      </motion.div>

      {/* ================================================================ */}
      {/*  Registration Form                                                */}
      {/* ================================================================ */}
      <motion.form
        onSubmit={handleSubmit}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        custom={2}
        className="rounded-2xl border border-gray-200 bg-white shadow-sm"
      >
        {/* ---- Personal Information ---- */}
        <div className="border-b border-gray-100 p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
            <Calendar className="h-4 w-4 text-[#45BFD3]" />
            Personal Information
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Full Name */}
            <div>
              <label htmlFor="full_name" className={labelClasses}>
                Full Name <span className="text-red-400">*</span>
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                value={form.full_name}
                onChange={handleChange}
                placeholder="John Doe"
                className={fieldClasses("full_name")}
                autoComplete="name"
              />
              {errors.full_name && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle size={12} /> {errors.full_name}
                </p>
              )}
            </div>

            {/* Date of Birth */}
            <div>
              <label htmlFor="date_of_birth" className={labelClasses}>
                Date of Birth <span className="text-red-400">*</span>
              </label>
              <input
                id="date_of_birth"
                name="date_of_birth"
                type="date"
                value={form.date_of_birth}
                onChange={handleChange}
                max={new Date().toISOString().split("T")[0]}
                className={fieldClasses("date_of_birth")}
              />
              {errors.date_of_birth && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle size={12} /> {errors.date_of_birth}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ---- Contact Information ---- */}
        <div className="border-b border-gray-100 p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
            <Mail className="h-4 w-4 text-[#45BFD3]" />
            Contact Information
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Email */}
            <div>
              <label htmlFor="email" className={labelClasses}>
                Email Address <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="patient@example.com"
                  className={cn(fieldClasses("email"), "pl-9")}
                  autoComplete="email"
                />
              </div>
              {errors.email && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle size={12} /> {errors.email}
                </p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className={labelClasses}>
                Phone Number <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                  className={cn(fieldClasses("phone"), "pl-9")}
                  autoComplete="tel"
                />
              </div>
              {errors.phone && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle size={12} /> {errors.phone}
                </p>
              )}
            </div>

            {/* Address - full width */}
            <div className="sm:col-span-2">
              <label htmlFor="address" className={labelClasses}>
                Address <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <textarea
                  id="address"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="123 Main St, City, State 12345"
                  rows={2}
                  className={cn(fieldClasses("address"), "resize-none pl-9")}
                />
              </div>
              {errors.address && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle size={12} /> {errors.address}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ---- Emergency Contact ---- */}
        <div className="border-b border-gray-100 p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
            <AlertCircle className="h-4 w-4 text-[#45BFD3]" />
            Emergency Contact
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Emergency Contact Name */}
            <div>
              <label
                htmlFor="emergency_contact_name"
                className={labelClasses}
              >
                Contact Name <span className="text-red-400">*</span>
              </label>
              <input
                id="emergency_contact_name"
                name="emergency_contact_name"
                type="text"
                value={form.emergency_contact_name}
                onChange={handleChange}
                placeholder="Jane Doe"
                className={fieldClasses("emergency_contact_name")}
              />
              {errors.emergency_contact_name && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle size={12} /> {errors.emergency_contact_name}
                </p>
              )}
            </div>

            {/* Emergency Contact Phone */}
            <div>
              <label
                htmlFor="emergency_contact_phone"
                className={labelClasses}
              >
                Contact Phone <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="emergency_contact_phone"
                  name="emergency_contact_phone"
                  type="tel"
                  value={form.emergency_contact_phone}
                  onChange={handleChange}
                  placeholder="(555) 987-6543"
                  className={cn(
                    fieldClasses("emergency_contact_phone"),
                    "pl-9",
                  )}
                />
              </div>
              {errors.emergency_contact_phone && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle size={12} />{" "}
                  {errors.emergency_contact_phone}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ---- Insurance Information ---- */}
        <div className="border-b border-gray-100 p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
            <Shield className="h-4 w-4 text-[#45BFD3]" />
            Insurance Information
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Insurance Provider */}
            <div>
              <label htmlFor="insurance_provider" className={labelClasses}>
                Insurance Provider <span className="text-red-400">*</span>
              </label>
              <select
                id="insurance_provider"
                name="insurance_provider"
                value={form.insurance_provider}
                onChange={handleChange}
                className={fieldClasses("insurance_provider")}
              >
                <option value="">Select provider</option>
                {INSURANCE_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {errors.insurance_provider && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle size={12} /> {errors.insurance_provider}
                </p>
              )}
            </div>

            {/* Policy Number */}
            <div>
              <label htmlFor="policy_number" className={labelClasses}>
                Policy Number <span className="text-red-400">*</span>
              </label>
              <input
                id="policy_number"
                name="policy_number"
                type="text"
                value={form.policy_number}
                onChange={handleChange}
                placeholder="POL-123456789"
                className={fieldClasses("policy_number")}
              />
              {errors.policy_number && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle size={12} /> {errors.policy_number}
                </p>
              )}
            </div>

            {/* Group Number */}
            <div>
              <label htmlFor="group_number" className={labelClasses}>
                Group Number
              </label>
              <input
                id="group_number"
                name="group_number"
                type="text"
                value={form.group_number}
                onChange={handleChange}
                placeholder="GRP-001"
                className={fieldClasses("group_number")}
              />
            </div>
          </div>
        </div>

        {/* ---- Submit area ---- */}
        <div className="flex flex-col items-center gap-3 p-5 sm:flex-row sm:justify-between sm:p-6">
          {submitError && (
            <div className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 sm:w-auto">
              <AlertCircle size={16} className="shrink-0" />
              {submitError}
            </div>
          )}
          <div className="flex w-full gap-3 sm:ml-auto sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setForm(INITIAL_FORM);
                setErrors({});
                setSubmitError(null);
              }}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:flex-none"
            >
              Clear Form
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-white transition-colors sm:flex-none",
                submitting
                  ? "cursor-not-allowed bg-[#45BFD3]/60"
                  : "bg-[#45BFD3] hover:bg-[#3badbf]",
              )}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Register Patient
                </>
              )}
            </button>
          </div>
        </div>
      </motion.form>

      {/* ================================================================ */}
      {/*  Registered Patients List                                         */}
      {/* ================================================================ */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        custom={3}
        className="rounded-2xl border border-gray-200 bg-white shadow-sm"
      >
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#45BFD3]" />
            <h2 className="text-base font-semibold text-gray-900">
              Registered Patients
            </h2>
            {!patientsLoading && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {filteredPatients.length}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, phone..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Table / Content */}
        <div className="p-5 sm:p-6">
          {patientsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#45BFD3]" />
              <span className="ml-2 text-sm text-gray-500">
                Loading patients...
              </span>
            </div>
          ) : patientsError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="mb-2 h-8 w-8 text-red-400" />
              <p className="text-sm text-red-600">{patientsError}</p>
              <button
                onClick={fetchPatients}
                className="mt-3 text-sm font-medium text-[#45BFD3] hover:underline"
              >
                Try again
              </button>
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">
                {searchQuery
                  ? "No patients match your search"
                  : "No patients registered yet"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="whitespace-nowrap pb-3 pr-4 font-medium text-gray-500">
                      Name
                    </th>
                    <th className="hidden whitespace-nowrap pb-3 pr-4 font-medium text-gray-500 sm:table-cell">
                      Email
                    </th>
                    <th className="hidden whitespace-nowrap pb-3 pr-4 font-medium text-gray-500 md:table-cell">
                      Phone
                    </th>
                    <th className="hidden whitespace-nowrap pb-3 pr-4 font-medium text-gray-500 lg:table-cell">
                      DOB
                    </th>
                    <th className="whitespace-nowrap pb-3 pr-4 font-medium text-gray-500">
                      Username
                    </th>
                    <th className="hidden whitespace-nowrap pb-3 font-medium text-gray-500 sm:table-cell">
                      Registered
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                    >
                      <td className="whitespace-nowrap py-3 pr-4 font-medium text-gray-900">
                        {patient.name}
                      </td>
                      <td className="hidden whitespace-nowrap py-3 pr-4 text-gray-600 sm:table-cell">
                        {patient.email || (
                          <span className="text-gray-300">--</span>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap py-3 pr-4 text-gray-600 md:table-cell">
                        {patient.phone || (
                          <span className="text-gray-300">--</span>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap py-3 pr-4 text-gray-600 lg:table-cell">
                        {patient.date_of_birth ? (
                          formatDate(patient.date_of_birth)
                        ) : (
                          <span className="text-gray-300">--</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4">
                        {patient.username ? (
                          <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
                            {patient.username}
                          </span>
                        ) : (
                          <span className="text-gray-300">--</span>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap py-3 text-gray-500 sm:table-cell">
                        {formatDate(patient.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {/* ---- Credentials Modal ---- */}
      <AnimatePresence>
        {credentials && (
          <CredentialsModal
            credentials={credentials}
            patientName={registeredName}
            onClose={() => setCredentials(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
