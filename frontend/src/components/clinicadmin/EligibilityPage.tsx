import { useState, useEffect, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldPlus,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Settings,
  X,
  Wifi,
  WifiOff,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { API_BASE_URL } from "@/api";

const PAYERS = ["Aetna", "Blue Cross", "Cigna", "United Healthcare", "Kaiser", "Humana", "Medicaid"];

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

interface PatientOption { id: number; name: string; }

interface BenefitBreakdown {
  copay: number | null;
  deductible: number | null;
  deductible_met: number | null;
  deductible_remaining: number | null;
  coinsurance: number | null;
  oop_max: number | null;
  oop_met: number | null;
  oop_remaining: number | null;
}

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
  _source?: string;
  _error?: string;
  subscriber?: {
    member_id?: string;
    group_number?: string;
    group_name?: string;
  };
  in_network?: BenefitBreakdown;
  out_of_network?: BenefitBreakdown;
  service_copays?: { service: string; amount: number; network: string }[];
  auth_required?: string[];
  payer_notes?: string[];
  visit_limits?: { service: string; limit: string }[];
}

interface HistoryRecord {
  id: number;
  patient_name: string;
  payer_name: string;
  is_eligible: number;
  plan_name: string;
  checked_at: string;
}

interface ServiceStatus {
  mode: string;
  is_sandbox?: boolean | null;
  api_key_set: boolean;
  provider_npi: string;
  provider_name: string;
  provider_org: string;
  note?: string;
}

export default function EligibilityPage() {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ServiceStatus | null>(null);

  const [form, setForm] = useState({ patient_id: "", payer_name: "", date_of_service: "" });
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<EligibilityResult | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ api_key: "", provider_npi: "", provider_name: "", provider_org: "" });
  const [savingSettings, setSavingSettings] = useState(false);

  const [payerQuery, setPayerQuery] = useState("");
  const [payerResults, setPayerResults] = useState<{ stedi_id: string; name: string; payer_id: string; aliases: string[] }[]>([]);
  const [searchingPayers, setSearchingPayers] = useState(false);

  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string; is_sandbox?: boolean } | null>(null);
  const [testing, setTesting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, hRes, sRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/patients`),
        fetch(`${API_BASE_URL}/api/clinicadmin/eligibility/history`),
        fetch(`${API_BASE_URL}/api/clinicadmin/eligibility/status`),
      ]);
      if (pRes.ok) setPatients(await pRes.json());
      if (hRes.ok) {
        const data = await hRes.json();
        setHistory(data.checks || []);
      }
      if (sRes.ok) {
        const s: ServiceStatus = await sRes.json();
        setStatus(s);
        setSettings(prev => ({
          ...prev,
          provider_npi: s.provider_npi || "",
          provider_name: s.provider_name || "",
          provider_org: s.provider_org || "",
        }));
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
      const res = await fetch(`${API_BASE_URL}/api/clinicadmin/eligibility/verify`, {
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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/clinicadmin/eligibility/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: settings.api_key || null,
          provider_npi: settings.provider_npi || null,
          provider_name: settings.provider_name || null,
          provider_org: settings.provider_org || null,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated: ServiceStatus = await res.json();
      setStatus(updated);
      setShowSettings(false);
      setSettings(prev => ({ ...prev, api_key: "" }));
    } catch {
      alert("Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handlePayerSearch = async () => {
    if (!payerQuery || payerQuery.length < 2) return;
    setSearchingPayers(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/clinicadmin/eligibility/payers?query=${encodeURIComponent(payerQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setPayerResults(data.payers || []);
      }
    } catch { /* ignore */ } finally {
      setSearchingPayers(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/clinicadmin/eligibility/test`, { method: "POST" });
      if (res.ok) setTestResult(await res.json());
      else setTestResult({ success: false, error: "Request failed" });
    } catch { setTestResult({ success: false, error: "Network error" }); } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#45BFD3]" /></div>;
  }

  const isLive = status?.mode === "live";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Eligibility Verification</h1>
        <div className="flex items-center gap-3">
          {/* Mode badge */}
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            !isLive ? "bg-amber-100 text-amber-700" :
            status?.is_sandbox ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
          )}>
            {isLive ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {!isLive ? "Simulated" : status?.is_sandbox ? "Sandbox (Stedi)" : "Live (Stedi)"}
          </span>
          <button onClick={() => setShowSettings(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            <Settings className="h-4 w-4" /> Settings
          </button>
        </div>
      </div>

      {/* Info banner */}
      {!isLive ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Running in <strong>simulated mode</strong>. To connect to real payer systems, click <strong>Settings</strong> and enter your Stedi API key.
          <a href="https://www.stedi.com" target="_blank" rel="noopener noreferrer" className="ml-1 underline hover:text-amber-900">Get a free key</a>
        </div>
      ) : status?.note && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {status.note}
        </div>
      )}

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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {result.is_eligible ? <CheckCircle2 className="h-8 w-8 text-green-600" /> : <XCircle className="h-8 w-8 text-red-600" />}
              <div>
                <h3 className={cn("text-lg font-bold", result.is_eligible ? "text-green-700" : "text-red-700")}>
                  {result.is_eligible ? "Eligible" : "Not Eligible"}
                </h3>
                {result.denial_reason && <p className="text-sm text-red-600">{result.denial_reason}</p>}
              </div>
            </div>
            {/* Source badge */}
            {result._source && (
              <span className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                result._source === "stedi_live" ? "bg-green-100 text-green-700" :
                result._source === "stedi_sandbox" ? "bg-blue-100 text-blue-700" :
                result._source === "simulated_fallback" ? "bg-orange-100 text-orange-700" :
                "bg-gray-100 text-gray-600"
              )}>
                {result._source === "stedi_live" ? "Live Data" :
                 result._source === "stedi_sandbox" ? "Sandbox Data" :
                 result._source === "simulated_fallback" ? "Fallback (API error)" :
                 "Simulated"}
              </span>
            )}
          </div>
          {result._error && (
            <div className="mb-3 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-700">
              API error: {result._error} — showing simulated data as fallback.
            </div>
          )}
          {result.is_eligible && (
            <div className="space-y-5">
              {/* Plan & subscriber info */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <InfoItem label="Plan" value={result.plan_name || "-"} />
                <InfoItem label="Coverage" value={result.coverage_type || "-"} />
                <InfoItem label="Effective" value={result.effective_date || "-"} />
                <InfoItem label="Terminates" value={result.termination_date || "-"} />
                {result.subscriber?.member_id && <InfoItem label="Member ID" value={result.subscriber.member_id} />}
                {result.subscriber?.group_number && <InfoItem label="Group #" value={result.subscriber.group_number} />}
                {result.subscriber?.group_name && <InfoItem label="Group Name" value={result.subscriber.group_name} />}
              </div>

              {/* In-Network / Out-of-Network breakdown */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <BenefitCard title="In-Network" data={result.in_network} fallback={result} />
                {hasData(result.out_of_network) && (
                  <BenefitCard title="Out-of-Network" data={result.out_of_network} />
                )}
              </div>

              {/* Per-service copays */}
              {result.service_copays && result.service_copays.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Service Copays</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.service_copays.map((sc, i) => (
                      <span key={i} className="rounded-full bg-white border border-gray-200 px-3 py-1 text-xs text-gray-700">
                        <span className="font-medium">{sc.service}</span>: {currency(sc.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Prior auth required */}
              {result.auth_required && result.auth_required.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                  <span className="font-semibold">Prior authorization required:</span> {result.auth_required.join(", ")}
                </div>
              )}

              {/* Visit limits */}
              {result.visit_limits && result.visit_limits.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Visit Limits</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.visit_limits.map((vl, i) => (
                      <span key={i} className="rounded-full bg-white border border-gray-200 px-3 py-1 text-xs text-gray-700">
                        <span className="font-medium">{vl.service}</span>: {vl.limit}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Payer notes */}
              {result.payer_notes && result.payer_notes.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Payer Notes</h4>
                  <ul className="space-y-1">
                    {result.payer_notes.map((note, i) => (
                      <li key={i} className="text-xs text-gray-600 leading-relaxed">{note}</li>
                    ))}
                  </ul>
                </div>
              )}
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

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <Fragment>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowSettings(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[8%] z-50 mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:inset-x-auto sm:w-full">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Eligibility API Settings</h2>
                <button onClick={() => setShowSettings(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
              </div>

              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                <p className="font-medium text-gray-800 mb-1">Current Mode: <span className={isLive ? "text-green-700" : "text-amber-700"}>{isLive ? "Live (Stedi API)" : "Simulated"}</span></p>
                <p>Connect to <a href="https://www.stedi.com" target="_blank" rel="noopener noreferrer" className="text-[#45BFD3] underline">Stedi</a> for real-time eligibility checks against 3,400+ payers. Free sandbox + 100 free production transactions/month.</p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Stedi API Key</label>
                  <input type="password" value={settings.api_key}
                    onChange={e => setSettings(s => ({ ...s, api_key: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    placeholder={status?.api_key_set ? "Key configured (enter new to change)" : "Enter your Stedi API key"} />
                  <p className="mt-1 text-xs text-gray-400">Leave blank to keep current key. Clear to switch to simulation mode.</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Provider NPI</label>
                  <input type="text" value={settings.provider_npi}
                    onChange={e => setSettings(s => ({ ...s, provider_npi: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                    placeholder="10-digit NPI" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Provider Name</label>
                    <input type="text" value={settings.provider_name}
                      onChange={e => setSettings(s => ({ ...s, provider_name: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Organization</label>
                    <input type="text" value={settings.provider_org}
                      onChange={e => setSettings(s => ({ ...s, provider_org: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowSettings(false)} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                  <button type="submit" disabled={savingSettings} className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition disabled:opacity-60">
                    {savingSettings && <Loader2 className="h-4 w-4 animate-spin" />} Save Settings
                  </button>
                </div>
              </form>

              {/* Test Connection */}
              {isLive && (
                <div className="mt-4 border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">Test Connection</h3>
                      <p className="text-xs text-gray-500">Send a mock request to verify your API key works.</p>
                    </div>
                    <button type="button" onClick={handleTestConnection} disabled={testing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} Test
                    </button>
                  </div>
                  {testResult && (
                    <div className={cn(
                      "mt-3 rounded-lg border px-3 py-2 text-sm",
                      testResult.success ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"
                    )}>
                      {testResult.success ? (
                        <>
                          <p className="font-medium">Connection successful</p>
                          {testResult.is_sandbox && (
                            <p className="mt-1 text-xs">Sandbox/test key detected. Real patient lookups require a <strong>production</strong> API key. Eligibility checks with real patient data will use simulated fallback until you switch to a production key.</p>
                          )}
                        </>
                      ) : (
                        <p>{testResult.error}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Payer Search */}
              {isLive && (
                <div className="mt-5 border-t border-gray-200 pt-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">Payer Directory Search</h3>
                  <p className="text-xs text-gray-500 mb-3">Look up the correct Stedi payer ID for an insurance company.</p>
                  <div className="flex gap-2">
                    <input type="text" value={payerQuery}
                      onChange={e => setPayerQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handlePayerSearch())}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
                      placeholder="e.g. Blue Cross, Aetna, 60054..." />
                    <button type="button" onClick={handlePayerSearch} disabled={searchingPayers || payerQuery.length < 2}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition disabled:opacity-50">
                      {searchingPayers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
                    </button>
                  </div>
                  {payerResults.length > 0 && (
                    <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                      {payerResults.map(p => (
                        <div key={p.stedi_id} className="flex items-center justify-between border-b border-gray-100 px-3 py-2 last:border-0 hover:bg-gray-50">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                            <p className="text-xs text-gray-500">ID: <span className="font-mono">{p.payer_id}</span></p>
                          </div>
                          <span className="ml-2 shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-600">{p.payer_id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </Fragment>
        )}
      </AnimatePresence>
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

function hasData(b?: BenefitBreakdown | null): boolean {
  if (!b) return false;
  return [b.copay, b.deductible, b.coinsurance, b.oop_max].some(v => v != null);
}

function BenefitCard({ title, data, fallback }: { title: string; data?: BenefitBreakdown | null; fallback?: EligibilityResult }) {
  const c = (v: number | null | undefined) => v != null ? currency(v) : "-";
  const pct = (v: number | null | undefined) => v != null ? `${v}%` : "-";

  // Use in_network data if present, fallback to top-level flat fields
  const copay = data?.copay ?? fallback?.copay ?? null;
  const deductible = data?.deductible ?? fallback?.deductible ?? null;
  const deductibleMet = data?.deductible_met ?? fallback?.deductible_met ?? null;
  const deductibleRemaining = data?.deductible_remaining ?? null;
  const coinsurance = data?.coinsurance ?? fallback?.coinsurance_percent ?? null;
  const oopMax = data?.oop_max ?? fallback?.out_of_pocket_max ?? null;
  const oopMet = data?.oop_met ?? fallback?.out_of_pocket_met ?? null;
  const oopRemaining = data?.oop_remaining ?? null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoItem label="Copay" value={c(copay)} />
        <InfoItem label="Coinsurance" value={pct(coinsurance)} />
        <InfoItem label="Deductible" value={c(deductible)} />
        <InfoItem label="Deductible Met" value={c(deductibleMet)} />
        {deductibleRemaining != null && <InfoItem label="Deductible Remaining" value={c(deductibleRemaining)} />}
        <InfoItem label="OOP Max" value={c(oopMax)} />
        <InfoItem label="OOP Met" value={c(oopMet)} />
        {oopRemaining != null && <InfoItem label="OOP Remaining" value={c(oopRemaining)} />}
      </div>
    </div>
  );
}
