import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Loader2, AlertCircle, RefreshCw } from "lucide-react";

import { API_BASE_URL as API } from "@/api";

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

interface InsuranceRecord {
  id: number;
  provider_name: string;
  policy_number: string;
  group_number: string;
  subscriber_name: string;
  effective_date: string;
  expiration_date: string;
  copay: number;
  deductible: number;
  deductible_met: number;
  is_primary: number;
}

export default function PatientInsuranceView({ patientId }: { patientId: number }) {
  const [insurance, setInsurance] = useState<InsuranceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/portal/patient/${patientId}/insurance`);
      if (!res.ok) throw new Error("Failed to load insurance info");
      const data = await res.json();
      setInsurance(data.insurance || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#45BFD3]" /></div>;
  }

  if (error) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-red-500">
        <AlertCircle className="h-10 w-10" />
        <p>{error}</p>
        <button onClick={fetchData} className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-gray-900">My Insurance</h1>

      {insurance.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-lg font-medium text-gray-600">No insurance on file</p>
          <p className="mt-1 text-sm text-gray-400">Contact your clinic to add insurance information.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {insurance.map((ins, i) => (
            <motion.div key={ins.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.07 } }}
              className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#45BFD3]/10 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-[#45BFD3]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{ins.provider_name}</h3>
                    <p className="text-xs text-gray-500">{ins.is_primary ? "Primary Insurance" : "Secondary Insurance"}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <InfoItem label="Policy #" value={ins.policy_number || "-"} />
                <InfoItem label="Group #" value={ins.group_number || "-"} />
                <InfoItem label="Subscriber" value={ins.subscriber_name || "-"} />
                <InfoItem label="Copay" value={ins.copay != null ? currency(ins.copay) : "-"} />
                <InfoItem label="Deductible" value={ins.deductible != null ? currency(ins.deductible) : "-"} />
                <InfoItem label="Deductible Met" value={ins.deductible_met != null ? currency(ins.deductible_met) : "-"} />
                {ins.effective_date && <InfoItem label="Effective" value={new Date(ins.effective_date).toLocaleDateString()} />}
                {ins.expiration_date && <InfoItem label="Expires" value={new Date(ins.expiration_date).toLocaleDateString()} />}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-800">{value}</dd>
    </div>
  );
}
