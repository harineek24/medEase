import { useState, useEffect, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/api";

const API = API_BASE_URL;

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

interface Statement {
  id: number;
  patient_name: string;
  statement_number: string;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  due_date: string;
  status: string;
  created_at: string;
}

interface PatientOption { id: number; name: string; }

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  open:      { label: "Open",      bg: "bg-yellow-100", text: "text-yellow-700" },
  partial:   { label: "Partial",   bg: "bg-orange-100", text: "text-orange-700" },
  paid:      { label: "Paid",      bg: "bg-green-100",  text: "text-green-700" },
  overdue:   { label: "Overdue",   bg: "bg-red-100",    text: "text-red-700" },
};

export default function StatementsDashboard() {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [form, setForm] = useState({ patient_id: "", total_amount: "", due_date: "", line_items: "" });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = statusFilter
        ? `${API}/api/clinicadmin/statements?status=${statusFilter}`
        : `${API}/api/clinicadmin/statements`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      setStatements(data.statements || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!showModal) return;
    fetch(`${API}/api/patients`).then(r => r.ok ? r.json() : []).then(setPatients).catch(() => {});
  }, [showModal]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/clinicadmin/statements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: Number(form.patient_id),
          total_amount: Number(form.total_amount),
          due_date: form.due_date || null,
          line_items: form.line_items || null,
        }),
      });
      if (!res.ok) throw new Error("Create failed");
      setShowModal(false);
      setForm({ patient_id: "", total_amount: "", due_date: "", line_items: "" });
      fetchData();
    } catch {
      alert("Failed to create statement.");
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

  const totalDue = statements.reduce((sum, s) => sum + (s.amount_due || 0), 0);
  const totalPaid = statements.reduce((sum, s) => sum + (s.amount_paid || 0), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Patient Statements</h1>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition">
          <Plus className="h-4 w-4" /> New Statement
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <span className="text-sm font-medium text-gray-500">Total Statements</span>
          <span className="mt-2 block text-2xl font-bold text-gray-900">{statements.length}</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.07 } }} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <span className="text-sm font-medium text-gray-500">Total Due</span>
          <span className="mt-2 block text-2xl font-bold text-amber-600">{currency(totalDue)}</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.14 } }} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <span className="text-sm font-medium text-gray-500">Total Collected</span>
          <span className="mt-2 block text-2xl font-bold text-green-600">{currency(totalPaid)}</span>
        </motion.div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["", "open", "partial", "paid", "overdue"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition",
              statusFilter === s ? "bg-[#45BFD3] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Statement #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Paid</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Due</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {statements.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No statements found.</td></tr>
              ) : statements.map((s, i) => {
                const badge = STATUS_STYLE[s.status] || STATUS_STYLE.open;
                return (
                  <tr key={s.id} className={cn("border-b border-gray-50 transition hover:bg-gray-50/50", i % 2 === 1 && "bg-gray-50/30")}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.statement_number}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{s.patient_name}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{currency(s.total_amount)}</td>
                    <td className="px-4 py-3 text-green-600">{currency(s.amount_paid)}</td>
                    <td className="px-4 py-3 font-medium text-amber-600">{currency(s.amount_due)}</td>
                    <td className="px-4 py-3 text-gray-500">{s.due_date ? new Date(s.due_date).toLocaleDateString() : "-"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", badge.bg, badge.text)}>{badge.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Statement Modal */}
      <AnimatePresence>
        {showModal && (
          <Fragment>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:inset-x-auto sm:w-full">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Create Statement</h2>
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">Total Amount ($)</label>
                  <input type="number" step="0.01" min="0.01" required value={form.total_amount}
                    onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" placeholder="0.00" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Line Items Description</label>
                  <textarea value={form.line_items} onChange={e => setForm(f => ({ ...f, line_items: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" rows={3} placeholder="Description of charges..." />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                  <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition disabled:opacity-60">
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create
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
