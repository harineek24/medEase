import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ShieldPlus,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

const PAYERS = ["Aetna", "Blue Cross", "Cigna", "United Healthcare", "Kaiser", "Humana", "Medicaid"];

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

interface PatientOption { id: number; name: string; }

interface EligibilityResult {
  is_eligible: boolean;
  coverage_type: string | null;
  plan_name: string | null;
  copay: number | null;
  deductible: number | null;
  deductible_met: number | null;
  coinsurance_percent: number | null;
  out_of_pocket_max: number | null;
  out_of_pocket_met: number | null;
  effective_date: string | null;
  termination_date: string | null;
  denial_reason: string | null;
  checked_at: string;
}

interface HistoryRecord {
  id: number;
  patient_name: string;
  payer_name: string;
  is_eligible: number;
  plan_name: string;
  checked_at: string;
}

export default function EligibilityPage() {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ patient_id: "", payer_name: "", date_of_service: "" });
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<EligibilityResult | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, hRes] = await Promise.all([
        fetch(`${API}/api/patients`),
        fetch(`${API}/api/clinicadmin/eligibility/history`),
      ]);
      if (pRes.ok) setPatients(await pRes.json());
      if (hRes.ok) {
        const data = await hRes.json();
        setHistory(data.checks || []);
      }
    } catch {
      // silently ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/clinicadmin/eligibility/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: Number(form.patient_id),
          payer_name: form.payer_name,
          date_of_service: form.date_of_service || null,
        }),
      });
      if (!res.ok) throw new Error("Verification failed");
      const data: EligibilityResult = await res.json();
      setResult(data);
      fetchData(); // refresh history
    } catch {
      alert("Eligibility verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#45BFD3]" /></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Eligibility Verification</h1>

      {/* Verification Form */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Run Eligibility Check</h2>
        <form onSubmit={handleVerify} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Patient</label>
            <div className="relative">
              <select required value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-8 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition">
                <option value="">Select patient</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-gray-400" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Insurance Payer</label>
            <div className="relative">
              <select required value={form.payer_name} onChange={e => setForm(f => ({ ...f, payer_name: e.target.value }))}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-8 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition">
                <option value="">Select payer</option>
                {PAYERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-gray-400" />
            </div>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={verifying}
              className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition disabled:opacity-60 w-full justify-center">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldPlus className="h-4 w-4" />}
              Verify
            </button>
          </div>
        </form>
      </motion.div>

      {/* Result */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className={cn("rounded-xl border p-6 shadow-sm", result.is_eligible ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")}>
          <div className="flex items-center gap-3 mb-4">
            {result.is_eligible ? <CheckCircle2 className="h-8 w-8 text-green-600" /> : <XCircle className="h-8 w-8 text-red-600" />}
            <div>
              <h3 className={cn("text-lg font-bold", result.is_eligible ? "text-green-700" : "text-red-700")}>
                {result.is_eligible ? "Eligible" : "Not Eligible"}
              </h3>
              {result.denial_reason && <p className="text-sm text-red-600">{result.denial_reason}</p>}
            </div>
          </div>
          {result.is_eligible && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <InfoItem label="Plan" value={result.plan_name || "-"} />
              <InfoItem label="Coverage" value={result.coverage_type || "-"} />
              <InfoItem label="Copay" value={result.copay != null ? currency(result.copay) : "-"} />
              <InfoItem label="Deductible" value={result.deductible != null ? currency(result.deductible) : "-"} />
              <InfoItem label="Deductible Met" value={result.deductible_met != null ? currency(result.deductible_met) : "-"} />
              <InfoItem label="Coinsurance" value={result.coinsurance_percent != null ? `${result.coinsurance_percent}%` : "-"} />
              <InfoItem label="OOP Max" value={result.out_of_pocket_max != null ? currency(result.out_of_pocket_max) : "-"} />
              <InfoItem label="OOP Met" value={result.out_of_pocket_met != null ? currency(result.out_of_pocket_met) : "-"} />
              <InfoItem label="Effective" value={result.effective_date || "-"} />
              <InfoItem label="Terminates" value={result.termination_date || "-"} />
            </div>
          )}
        </motion.div>
      )}

      {/* History */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <h3 className="px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-100 bg-gray-50/60">Recent Checks</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/30">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Patient</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Payer</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Plan</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Result</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Checked</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No eligibility checks yet</td></tr>
              ) : history.map((h, i) => (
                <tr key={h.id} className={cn("border-b border-gray-50", i % 2 === 1 && "bg-gray-50/30")}>
                  <td className="px-4 py-2 font-medium text-gray-800">{h.patient_name}</td>
                  <td className="px-4 py-2 text-gray-600">{h.payer_name}</td>
                  <td className="px-4 py-2 text-gray-600">{h.plan_name || "-"}</td>
                  <td className="px-4 py-2">
                    {h.is_eligible ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <CheckCircle2 className="h-3 w-3" /> Eligible
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        <XCircle className="h-3 w-3" /> Ineligible
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{new Date(h.checked_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-gray-800">{value}</dd>
    </div>
  );
}
