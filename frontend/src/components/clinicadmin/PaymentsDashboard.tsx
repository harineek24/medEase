import { useState, useEffect, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Clock,
  Plus,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

interface PaymentSummary {
  total_collected: number;
  patient_payments: number;
  insurance_payments: number;
  recent_transactions: number;
}

interface Payment {
  id: number;
  patient_name: string;
  amount: number;
  payment_method: string;
  payment_type: string;
  reference_number: string;
  notes: string;
  created_at: string;
}

interface PatientOption { id: number; name: string; }

const METHODS = ["credit_card", "debit_card", "cash", "check", "hsa", "fsa", "ach"];
const TYPES = ["patient", "insurance"];

export default function PaymentsDashboard() {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [form, setForm] = useState({ patient_id: "", amount: "", payment_method: "credit_card", payment_type: "patient", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, pRes] = await Promise.all([
        fetch(`${API}/api/clinicadmin/payments/summary`),
        fetch(`${API}/api/clinicadmin/payments`),
      ]);
      if (sRes.ok) setSummary(await sRes.json());
      if (pRes.ok) {
        const data = await pRes.json();
        setPayments(data.payments || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!showModal) return;
    fetch(`${API}/api/patients`).then(r => r.ok ? r.json() : []).then(setPatients).catch(() => {});
  }, [showModal]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/clinicadmin/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: Number(form.patient_id),
          amount: Number(form.amount),
          payment_method: form.payment_method,
          payment_type: form.payment_type,
          notes: form.notes,
        }),
      });
      if (!res.ok) throw new Error("Create failed");
      setShowModal(false);
      setForm({ patient_id: "", amount: "", payment_method: "credit_card", payment_type: "patient", notes: "" });
      fetchData();
    } catch {
      alert("Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#45BFD3]" /></div>;
  }

  if (error) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-red-500">
        <AlertCircle className="h-10 w-10" />
        <p className="text-lg font-medium">{error}</p>
        <button onClick={fetchData} className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  const cards = [
    { title: "Total Collected", value: currency(summary?.total_collected ?? 0), icon: DollarSign, color: "text-[#45BFD3] bg-[#45BFD3]/10" },
    { title: "Patient Payments", value: currency(summary?.patient_payments ?? 0), icon: CreditCard, color: "text-green-600 bg-green-50" },
    { title: "Insurance Payments", value: currency(summary?.insurance_payments ?? 0), icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
    { title: "Recent (30 days)", value: summary?.recent_transactions ?? 0, icon: Clock, color: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Payments</h1>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition">
          <Plus className="h-4 w-4" /> Record Payment
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.title} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.07 } }} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">{card.title}</span>
                <span className={cn("rounded-lg p-2", card.color)}><Icon className="h-5 w-5" /></span>
              </div>
              <span className="mt-3 block text-2xl font-bold text-gray-900">{card.value}</span>
            </motion.div>
          );
        })}
      </div>

      {/* Payments table */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Method</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No payments recorded.</td></tr>
              ) : payments.map((p, i) => (
                <tr key={p.id} className={cn("border-b border-gray-50 transition hover:bg-gray-50/50", i % 2 === 1 && "bg-gray-50/30")}>
                  <td className="px-4 py-3 font-medium text-gray-800">{p.patient_name}</td>
                  <td className="px-4 py-3 font-medium text-green-700">{currency(p.amount)}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{p.payment_method.replace("_", " ")}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium",
                      p.payment_type === "patient" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700")}>
                      {p.payment_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.reference_number || "-"}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Payment Modal */}
      <AnimatePresence>
        {showModal && (
          <Fragment>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:inset-x-auto sm:w-full">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
                <button onClick={() => setShowModal(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Patient</label>
                  <select required value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition">
                    <option value="">Select patient</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Amount ($)</label>
                  <input type="number" step="0.01" min="0.01" required value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" placeholder="0.00" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Method</label>
                    <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition">
                      {METHODS.map(m => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
                    <select value={form.payment_type} onChange={e => setForm(f => ({ ...f, payment_type: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition">
                      {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                  <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" placeholder="Optional notes" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                  <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition disabled:opacity-60">
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Record
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
