import { useState, useEffect, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Plus,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

interface ClaimsSummary {
  total_claims: number;
  by_status: Record<string, number>;
  total_charges: number;
  total_paid: number;
  outstanding: number;
}

interface Claim {
  id: number;
  claim_number: string;
  patient_name: string;
  provider_name: string;
  insurance_name: string;
  status: string;
  diagnosis_codes: string;
  total_charge: number;
  total_paid: number;
  date_of_service: string;
  created_at: string;
}

interface PatientOption { id: number; name: string; }
interface DoctorOption { id: number; first_name: string; last_name: string; }
interface CptResult { code: string; description: string; default_charge?: number; }

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  draft:        { label: "Draft",        bg: "bg-gray-100",   text: "text-gray-600" },
  validated:    { label: "Validated",    bg: "bg-blue-100",   text: "text-blue-700" },
  submitted:    { label: "Submitted",    bg: "bg-indigo-100", text: "text-indigo-700" },
  acknowledged: { label: "Acknowledged", bg: "bg-purple-100", text: "text-purple-700" },
  adjudicated:  { label: "Adjudicated",  bg: "bg-amber-100",  text: "text-amber-700" },
  paid:         { label: "Paid",         bg: "bg-green-100",  text: "text-green-700" },
  denied:       { label: "Denied",       bg: "bg-red-100",    text: "text-red-700" },
  appealed:     { label: "Appealed",     bg: "bg-orange-100", text: "text-orange-700" },
};

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

export default function ClaimsDashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ClaimsSummary | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [cptSearch, setCptSearch] = useState("");
  const [cptResults, setCptResults] = useState<CptResult[]>([]);
  const [form, setForm] = useState({
    patient_id: "",
    provider_id: "",
    diagnosis_codes: "",
    date_of_service: "",
    place_of_service: "11",
    notes: "",
  });
  const [lines, setLines] = useState<Array<{ cpt_code: string; cpt_description: string; charge_amount: string; units: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = statusFilter
        ? `${API}/api/clinicadmin/claims?status=${statusFilter}`
        : `${API}/api/clinicadmin/claims`;
      const [sRes, cRes] = await Promise.all([
        fetch(`${API}/api/clinicadmin/claims/summary`),
        fetch(url),
      ]);
      if (!sRes.ok) throw new Error(`Summary fetch failed`);
      if (!cRes.ok) throw new Error(`Claims fetch failed`);
      setSummary(await sRes.json());
      const data = await cRes.json();
      setClaims(data.claims || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!showModal) return;
    Promise.all([
      fetch(`${API}/api/patients`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/api/doctors`).then(r => r.ok ? r.json() : { doctors: [] }),
    ]).then(([p, d]) => {
      setPatients(Array.isArray(p) ? p : []);
      setDoctors(d.doctors || []);
    }).catch(() => {});
  }, [showModal]);

  useEffect(() => {
    if (!cptSearch) { setCptResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${API}/api/codes/cpt?q=${encodeURIComponent(cptSearch)}&limit=10`)
        .then(r => r.json())
        .then(d => setCptResults(d.results || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [cptSearch]);

  const addLine = (cpt: CptResult) => {
    setLines(prev => [...prev, {
      cpt_code: cpt.code,
      cpt_description: cpt.description,
      charge_amount: String(cpt.default_charge || 0),
      units: "1",
    }]);
    setCptSearch("");
    setCptResults([]);
  };

  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/clinicadmin/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: Number(form.patient_id),
          provider_id: form.provider_id ? Number(form.provider_id) : null,
          diagnosis_codes: form.diagnosis_codes,
          date_of_service: form.date_of_service,
          place_of_service: form.place_of_service,
          notes: form.notes,
          lines: lines.map(l => ({
            cpt_code: l.cpt_code,
            cpt_description: l.cpt_description,
            charge_amount: Number(l.charge_amount),
            units: Number(l.units),
          })),
        }),
      });
      if (!res.ok) throw new Error("Create failed");
      setShowModal(false);
      setForm({ patient_id: "", provider_id: "", diagnosis_codes: "", date_of_service: "", place_of_service: "11", notes: "" });
      setLines([]);
      fetchData();
    } catch {
      alert("Failed to create claim.");
    } finally {
      setSubmitting(false);
    }
  };

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
        <button onClick={fetchData} className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  const statCards = [
    { title: "Total Claims", value: summary?.total_claims ?? 0, icon: FileText, color: "text-[#45BFD3] bg-[#45BFD3]/10" },
    { title: "Total Charges", value: currency(summary?.total_charges ?? 0), icon: FileText, color: "text-amber-600 bg-amber-50" },
    { title: "Total Paid", value: currency(summary?.total_paid ?? 0), icon: FileText, color: "text-green-600 bg-green-50" },
    { title: "Outstanding", value: currency(summary?.outstanding ?? 0), icon: FileText, color: "text-red-600 bg-red-50" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Claims Management</h1>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition">
          <Plus className="h-4 w-4" /> New Claim
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, i) => {
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

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {["", "draft", "validated", "submitted", "paid", "denied"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition",
              statusFilter === s ? "bg-[#45BFD3] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Claims table */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Claim #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Charges</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Paid</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">DOS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No claims found.</td></tr>
              ) : (
                claims.map((c, i) => {
                  const badge = STATUS_STYLE[c.status] || STATUS_STYLE.draft;
                  return (
                    <tr key={c.id} className={cn("border-b border-gray-50 transition hover:bg-gray-50/50", i % 2 === 1 && "bg-gray-50/30")}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.claim_number}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{c.patient_name}</td>
                      <td className="px-4 py-3 text-gray-600">{c.provider_name || "-"}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{currency(c.total_charge)}</td>
                      <td className="px-4 py-3 text-gray-600">{currency(c.total_paid)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", badge.bg, badge.text)}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{c.date_of_service ? new Date(c.date_of_service).toLocaleDateString() : "-"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => navigate(`/clinicadmin/claims/${c.id}`)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-[#45BFD3] transition" title="View details">
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Claim Modal */}
      <AnimatePresence>
        {showModal && (
          <Fragment>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[5%] z-50 mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-xl sm:inset-x-auto sm:w-full max-h-[85vh] overflow-y-auto">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Create New Claim</h2>
                <button onClick={() => setShowModal(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Patient</label>
                    <select required value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition">
                      <option value="">Select patient</option>
                      {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Provider</label>
                    <select value={form.provider_id} onChange={e => setForm(f => ({ ...f, provider_id: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition">
                      <option value="">Select provider</option>
                      {doctors.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Date of Service</label>
                    <input type="date" value={form.date_of_service} onChange={e => setForm(f => ({ ...f, date_of_service: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Place of Service</label>
                    <input type="text" value={form.place_of_service} onChange={e => setForm(f => ({ ...f, place_of_service: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" placeholder="11" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Diagnosis Codes (comma separated)</label>
                  <input type="text" value={form.diagnosis_codes} onChange={e => setForm(f => ({ ...f, diagnosis_codes: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" placeholder="I10, E11.9" />
                </div>

                {/* Line items */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Procedure Lines</label>
                  <div className="relative">
                    <input type="text" value={cptSearch} onChange={e => setCptSearch(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" placeholder="Search CPT codes..." />
                    {cptResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                        {cptResults.map(cpt => (
                          <button key={cpt.code} type="button" onClick={() => addLine(cpt)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-[#45BFD3]/10 transition flex justify-between">
                            <span><span className="font-mono font-medium">{cpt.code}</span> - {cpt.description}</span>
                            <span className="text-gray-400">${cpt.default_charge}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {lines.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {lines.map((line, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                          <span className="font-mono font-medium text-[#45BFD3]">{line.cpt_code}</span>
                          <span className="flex-1 text-gray-600 truncate">{line.cpt_description}</span>
                          <input type="number" value={line.units} onChange={e => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, units: e.target.value } : l))}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-center text-xs" min="1" />
                          <span className="text-xs text-gray-400">x</span>
                          <input type="number" step="0.01" value={line.charge_amount} onChange={e => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, charge_amount: e.target.value } : l))}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-xs" />
                          <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" rows={2} />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                  <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition disabled:opacity-60">
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create Claim
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
