import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Loader2,
  AlertCircle,
  XCircle,
  Shield,
  User,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { API_BASE_URL as API } from "@/api";

interface Coverage {
  payer_name: string;
  payer_id: string;
  plan_name: string;
  plan_type: string;
  member_id: string;
  group_number: string;
  group_name: string;
  coverage_status: string;
  effective_date: string;
  termination_date: string;
  relationship: string;
  subscriber_name: string;
}

interface DiscoveryResult {
  _source: string;
  coverages: Coverage[];
  count: number;
  searched_at: string;
  _error?: string;
}

interface ServiceStatus {
  mode: string;
  api_key_set: boolean;
}

export default function InsuranceDiscoveryPage() {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    gender: "U",
    address1: "",
    city: "",
    state: "",
    postal_code: "",
  });
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [status, setStatus] = useState<ServiceStatus | null>(null);

  useEffect(() => {
    fetch(`${API}/api/clinicadmin/insurance-discovery/status`)
      .then(r => r.ok ? r.json() : null)
      .then(setStatus)
      .catch(() => {});
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/clinicadmin/insurance-discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      setResult(await res.json());
    } catch (err: unknown) {
      setResult({
        _source: "error",
        coverages: [],
        count: 0,
        searched_at: new Date().toISOString(),
        _error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSearching(false);
    }
  };

  const sourceLabel = (src: string) => {
    if (src === "stedi_live") return { text: "Live Data", color: "bg-green-100 text-green-700" };
    if (src === "simulated_fallback") return { text: "Fallback", color: "bg-amber-100 text-amber-700" };
    return { text: "Simulated", color: "bg-gray-100 text-gray-600" };
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Insurance Discovery</h1>
          <p className="text-sm text-gray-500 mt-1">
            Find patient insurance coverage using demographics only — no member ID needed
          </p>
        </div>
        {status && (
          <span className={cn("rounded-full px-3 py-1 text-xs font-medium",
            status.mode === "live" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
            {status.mode === "live" ? "Live (Stedi)" : "Simulated"}
          </span>
        )}
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <User className="h-5 w-5 text-[#45BFD3]" />
          <h2 className="text-lg font-semibold text-gray-800">Patient Demographics</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">First Name *</label>
            <input type="text" required value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Last Name *</label>
            <input type="text" required value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Date of Birth *</label>
            <input type="date" required value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Gender</label>
            <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition">
              <option value="U">Unknown</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 mb-2">
          <MapPin className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-500">Address (optional, improves accuracy)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <input type="text" value={form.address1} onChange={e => setForm(f => ({ ...f, address1: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" placeholder="Street address" />
          </div>
          <div>
            <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" placeholder="City" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} maxLength={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" placeholder="ST" />
            <input type="text" value={form.postal_code} onChange={e => setForm(f => ({ ...f, postal_code: e.target.value }))} maxLength={5}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" placeholder="ZIP" />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={searching}
            className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition disabled:opacity-60">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Discover Insurance
          </button>
        </div>
      </form>

      {/* Results */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              {result.count === 0 ? "No Coverage Found" : `${result.count} Coverage${result.count > 1 ? "s" : ""} Found`}
            </h2>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", sourceLabel(result._source).color)}>
              {sourceLabel(result._source).text}
            </span>
          </div>

          {result._error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <AlertCircle className="inline h-4 w-4 mr-1" /> {result._error}
            </div>
          )}

          {result.count === 0 && !result._error && (
            <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
              <XCircle className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-gray-500">No active insurance coverage found for this patient.</p>
              <p className="mt-1 text-sm text-gray-400">Try adding address details or check the spelling of the name.</p>
            </div>
          )}

          {result.coverages.map((cov, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
              className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-[#45BFD3]/10 p-2">
                    <Shield className="h-5 w-5 text-[#45BFD3]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{cov.payer_name}</h3>
                    <p className="text-sm text-gray-500">{cov.plan_name}</p>
                  </div>
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium",
                  cov.coverage_status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600")}>
                  {cov.coverage_status || "unknown"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                <InfoItem label="Member ID" value={cov.member_id} />
                <InfoItem label="Group #" value={cov.group_number} />
                <InfoItem label="Plan Type" value={cov.plan_type} />
                <InfoItem label="Payer ID" value={cov.payer_id} />
                <InfoItem label="Effective" value={cov.effective_date} />
                <InfoItem label="Terminates" value={cov.termination_date} />
                <InfoItem label="Relationship" value={cov.relationship} />
                <InfoItem label="Subscriber" value={cov.subscriber_name} />
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-700">{value || "-"}</dd>
    </div>
  );
}
