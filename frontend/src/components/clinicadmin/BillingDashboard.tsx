import { useState, useEffect, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Plus,
  ArrowUpDown,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/api";

const API = API_BASE_URL;

/* ---------- Types ---------- */
interface BillingSummary {
  total_billed: number;
  insurance_covered: number;
  outstanding_balance: number;
  pending_claims: number;
}

interface BillingRecord {
  id: number;
  patient_name: string;
  description: string;
  amount: number;
  insurance_covered: number;
  patient_owes: number;
  status: "pending" | "paid" | "denied" | "partial";
  date: string;
}

interface PatientOption {
  id: number;
  name: string;
}

type SortField = keyof Pick<
  BillingRecord,
  "patient_name" | "description" | "amount" | "insurance_covered" | "patient_owes" | "status" | "date"
>;

const STATUS_STYLE: Record<
  BillingRecord["status"],
  { label: string; bg: string; text: string }
> = {
  pending: { label: "Pending", bg: "bg-yellow-100", text: "text-yellow-700" },
  paid: { label: "Paid", bg: "bg-green-100", text: "text-green-700" },
  denied: { label: "Denied", bg: "bg-red-100", text: "text-red-700" },
  partial: { label: "Partial", bg: "bg-orange-100", text: "text-orange-700" },
};

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.3 },
  }),
};

/* ================================================================== */
/*  BillingDashboard                                                   */
/* ================================================================== */
export default function BillingDashboard() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortField, setSortField] = useState<SortField>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [form, setForm] = useState({
    patient_id: "",
    description: "",
    amount: "",
    insurance_covered: "",
    patient_responsibility: "",
  });
  const [submitting, setSubmitting] = useState(false);

  /* ---------- Fetch data ---------- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`${API}/api/clinicadmin/billing/summary`),
        fetch(`${API}/api/clinicadmin/billing`),
      ]);
      if (!sRes.ok) throw new Error(`Summary fetch failed (${sRes.status})`);
      if (!rRes.ok) throw new Error(`Records fetch failed (${rRes.status})`);
      setSummary(await sRes.json());
      setRecords(await rRes.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* Fetch patients for form */
  useEffect(() => {
    if (!showModal) return;
    fetch(`${API}/api/patients`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setPatients)
      .catch(() => {});
  }, [showModal]);

  /* ---------- Sorting ---------- */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((p) => !p);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sorted = [...records].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    const av = a[sortField];
    const bv = b[sortField];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  /* ---------- Create record ---------- */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/clinicadmin/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: Number(form.patient_id),
          description: form.description,
          amount: Number(form.amount),
          insurance_covered: Number(form.insurance_covered),
          patient_responsibility: Number(form.patient_responsibility),
        }),
      });
      if (!res.ok) throw new Error("Create failed");
      setShowModal(false);
      setForm({
        patient_id: "",
        description: "",
        amount: "",
        insurance_covered: "",
        patient_responsibility: "",
      });
      fetchData();
    } catch {
      alert("Failed to create billing record.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Loading / Error ---------- */
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
          onClick={fetchData}
          className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  /* ---------- Summary cards config ---------- */
  const cards = [
    {
      title: "Total Billed",
      value: currency(summary?.total_billed ?? 0),
      icon: DollarSign,
      color: "text-[#45BFD3] bg-[#45BFD3]/10",
    },
    {
      title: "Insurance Covered",
      value: currency(summary?.insurance_covered ?? 0),
      icon: ShieldCheck,
      color: "text-green-600 bg-green-50",
    },
    {
      title: "Outstanding Balance",
      value: currency(summary?.outstanding_balance ?? 0),
      icon: AlertTriangle,
      color: "text-amber-600 bg-amber-50",
    },
    {
      title: "Pending Claims",
      value: summary?.pending_claims ?? 0,
      icon: FileText,
      color: "text-purple-600 bg-purple-50",
    },
  ];

  const SortHeader = ({
    field,
    label,
  }: {
    field: SortField;
    label: string;
  }) => (
    <th
      onClick={() => handleSort(field)}
      className="cursor-pointer whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 select-none hover:text-gray-700 transition"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </span>
    </th>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          Billing Dashboard
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition"
        >
          <Plus className="h-4 w-4" /> Create New
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => {
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
                <span className={cn("rounded-lg p-2", card.color)}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <span className="mt-3 block text-2xl font-bold text-gray-900">
                {card.value}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Records table */}
      <motion.div
        variants={fadeUp}
        custom={4}
        initial="hidden"
        animate="visible"
        className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60">
              <tr>
                <SortHeader field="patient_name" label="Patient" />
                <SortHeader field="description" label="Description" />
                <SortHeader field="amount" label="Amount" />
                <SortHeader field="insurance_covered" label="Insurance" />
                <SortHeader field="patient_owes" label="Patient Owes" />
                <SortHeader field="status" label="Status" />
                <SortHeader field="date" label="Date" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    No billing records found.
                  </td>
                </tr>
              ) : (
                sorted.map((rec, i) => {
                  const badge = STATUS_STYLE[rec.status];
                  return (
                    <tr
                      key={rec.id}
                      className={cn(
                        "border-b border-gray-50 transition hover:bg-gray-50/50",
                        i % 2 === 1 && "bg-gray-50/30",
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {rec.patient_name}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                        {rec.description}
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium">
                        {currency(rec.amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {currency(rec.insurance_covered)}
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium">
                        {currency(rec.patient_owes)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            badge.bg,
                            badge.text,
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(rec.date).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ---- Create New Modal ---- */}
      <AnimatePresence>
        {showModal && (
          <Fragment>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setShowModal(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:inset-x-auto sm:w-full"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Create Billing Record
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

                {/* Description */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <input
                    type="text"
                    required
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    placeholder="Service description"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.amount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    placeholder="0.00"
                  />
                </div>

                {/* Insurance Covered */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Insurance Covered ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.insurance_covered}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        insurance_covered: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    placeholder="0.00"
                  />
                </div>

                {/* Patient Responsibility */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Patient Responsibility ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.patient_responsibility}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        patient_responsibility: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    placeholder="0.00"
                  />
                </div>

                {/* Actions */}
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
                    Create
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
