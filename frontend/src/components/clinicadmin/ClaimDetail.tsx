import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  RefreshCw,
  ClipboardCheck,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { API_BASE_URL } from "@/api";

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

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

interface ClaimLine {
  id: number;
  line_number: number;
  cpt_code: string;
  cpt_description: string;
  icd_codes: string;
  modifier: string;
  units: number;
  charge_amount: number;
  allowed_amount: number;
  paid_amount: number;
}

interface RevenueCycleEvent {
  id: number;
  event_type: string;
  old_status: string;
  new_status: string;
  details: string;
  created_at: string;
}

interface ClaimData {
  id: number;
  claim_number: string;
  patient_name: string;
  provider_name: string;
  insurance_name: string;
  status: string;
  claim_type: string;
  diagnosis_codes: string;
  total_charge: number;
  total_allowed: number;
  total_paid: number;
  patient_responsibility: number;
  place_of_service: string;
  date_of_service: string;
  notes: string;
  scrub_results: string;
  created_at: string;
  lines: ClaimLine[];
  events: RevenueCycleEvent[];
}

interface ScrubResult {
  passed: boolean;
  error_count: number;
  warning_count: number;
  errors: Array<{ category: string; message: string }>;
  warnings: Array<{ category: string; message: string }>;
}

interface ClaimStatusResult {
  success: boolean;
  source: string;
  overall_status: string;
  overall_description: string;
  statuses: Array<{
    category: string;
    category_description: string;
    status_code: string;
    status_description: string;
    effective_date: string;
    total_charge: string;
    claim_payment_amount: string;
  }>;
  payer_claim_number?: string;
  error?: string;
}

export default function ClaimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [claim, setClaim] = useState<ClaimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrubResult, setScrubResult] = useState<ScrubResult | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [claimStatus, setClaimStatus] = useState<ClaimStatusResult | null>(null);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string; source?: string } | null>(null);

  const fetchClaim = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/clinicadmin/claims/${id}`);
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      setClaim(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchClaim(); }, [fetchClaim]);

  const handleScrub = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/clinicadmin/claims/${id}/scrub`, { method: "POST" });
      const data = await res.json();
      setScrubResult(data);
      fetchClaim();
    } catch {
      alert("Scrub failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmit = async () => {
    setActionLoading(true);
    setSubmitResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/clinicadmin/claims/${id}/submit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.scrub_results) setScrubResult(data.scrub_results);
        setSubmitResult({ success: false, message: data.message || data.detail || "Submit failed", source: data.submission?.source });
      } else {
        setSubmitResult({ success: true, message: data.message || "Submitted", source: data.submission?.source });
        fetchClaim();
      }
    } catch {
      setSubmitResult({ success: false, message: "Submit failed" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    setActionLoading(true);
    setClaimStatus(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/clinicadmin/claims/${id}/check-status`, { method: "POST" });
      const data = await res.json();
      setClaimStatus(data);
    } catch {
      setClaimStatus({ success: false, source: "error", overall_status: "error", overall_description: "Failed to check status", statuses: [], error: "Network error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/clinicadmin/claims/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Update failed");
      fetchClaim();
    } catch {
      alert("Status update failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#45BFD3]" /></div>;
  }

  if (error || !claim) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-red-500">
        <AlertCircle className="h-10 w-10" />
        <p className="text-lg font-medium">{error || "Claim not found"}</p>
        <button onClick={fetchClaim} className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  const badge = STATUS_STYLE[claim.status] || STATUS_STYLE.draft;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* Back + header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/clinicadmin/claims")} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{claim.claim_number}</h1>
          <p className="text-sm text-gray-500">{claim.patient_name} &middot; {claim.provider_name || "No provider"}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-medium", badge.bg, badge.text)}>{badge.label}</span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        {(claim.status === "draft" || claim.status === "validated") && (
          <button onClick={handleScrub} disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-[#45BFD3] px-4 py-2 text-sm font-medium text-[#45BFD3] hover:bg-[#45BFD3]/10 transition disabled:opacity-60">
            <ClipboardCheck className="h-4 w-4" /> Scrub Claim
          </button>
        )}
        {(claim.status === "draft" || claim.status === "validated") && (
          <button onClick={handleSubmit} disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition disabled:opacity-60">
            <Send className="h-4 w-4" /> Submit to Clearinghouse
          </button>
        )}
        {["submitted", "acknowledged", "adjudicated"].includes(claim.status) && (
          <button onClick={handleCheckStatus} disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-500 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition disabled:opacity-60">
            <Search className="h-4 w-4" /> Check Payer Status (276)
          </button>
        )}
        {claim.status === "submitted" && (
          <button onClick={() => handleStatusChange("acknowledged")} disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-purple-700 transition disabled:opacity-60">
            Acknowledge
          </button>
        )}
        {claim.status === "acknowledged" && (
          <>
            <button onClick={() => handleStatusChange("paid")} disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700 transition disabled:opacity-60">
              <CheckCircle2 className="h-4 w-4" /> Mark Paid
            </button>
            <button onClick={() => handleStatusChange("denied")} disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-red-700 transition disabled:opacity-60">
              <XCircle className="h-4 w-4" /> Deny
            </button>
          </>
        )}
      </div>

      {/* Submission result */}
      {submitResult && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className={cn("rounded-xl border p-4", submitResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")}>
          <div className="flex items-center gap-2">
            {submitResult.success ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
            <h3 className={cn("font-semibold", submitResult.success ? "text-green-700" : "text-red-700")}>{submitResult.message}</h3>
            {submitResult.source && (
              <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-500">{submitResult.source}</span>
            )}
          </div>
        </motion.div>
      )}

      {/* Scrub results */}
      {scrubResult && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className={cn("rounded-xl border p-4", scrubResult.passed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")}>
          <h3 className={cn("font-semibold", scrubResult.passed ? "text-green-700" : "text-red-700")}>
            {scrubResult.passed ? "Claim Passed All Edit Checks" : `Claim Failed: ${scrubResult.error_count} error(s), ${scrubResult.warning_count} warning(s)`}
          </h3>
          {scrubResult.errors.map((e, i) => (
            <p key={i} className="mt-1 text-sm text-red-600">{e.message}</p>
          ))}
          {scrubResult.warnings.map((w, i) => (
            <p key={i} className="mt-1 text-sm text-amber-600">{w.message}</p>
          ))}
        </motion.div>
      )}

      {/* Claim Status Result (276/277) */}
      {claimStatus && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-indigo-800">Payer Claim Status (277 Response)</h3>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-500">{claimStatus.source}</span>
          </div>
          {claimStatus.error ? (
            <p className="text-sm text-red-600">{claimStatus.error}</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className={cn("rounded-full px-3 py-1 text-sm font-medium",
                  claimStatus.overall_status === "finalized" ? "bg-green-100 text-green-700" :
                  claimStatus.overall_status === "acknowledged" ? "bg-purple-100 text-purple-700" :
                  claimStatus.overall_status === "rejected" ? "bg-red-100 text-red-700" :
                  claimStatus.overall_status === "pending" ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-600"
                )}>{claimStatus.overall_status}</span>
                <span className="text-sm text-gray-700">{claimStatus.overall_description}</span>
              </div>
              {claimStatus.payer_claim_number && (
                <p className="text-xs text-gray-500">Payer Claim #: <span className="font-mono">{claimStatus.payer_claim_number}</span></p>
              )}
              {claimStatus.statuses.length > 0 && (
                <div className="mt-2 space-y-1">
                  {claimStatus.statuses.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-indigo-600">{s.category}</span>
                      <span className="text-gray-700">{s.category_description || s.status_description}</span>
                      {s.total_charge && <span className="ml-auto text-gray-500">{currency(Number(s.total_charge))}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Claim info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Charges" value={currency(claim.total_charge)} />
        <InfoCard label="Total Paid" value={currency(claim.total_paid)} />
        <InfoCard label="Patient Resp." value={currency(claim.patient_responsibility)} />
        <InfoCard label="Date of Service" value={claim.date_of_service || "-"} />
        <InfoCard label="Claim Type" value={claim.claim_type} />
        <InfoCard label="Place of Service" value={claim.place_of_service} />
        <InfoCard label="Insurance" value={claim.insurance_name || "None"} />
        <InfoCard label="Diagnosis Codes" value={claim.diagnosis_codes || "-"} />
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <h3 className="px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-100 bg-gray-50/60">Line Items</h3>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/30">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">#</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">CPT</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Description</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Units</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Charge</th>
            </tr>
          </thead>
          <tbody>
            {claim.lines.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No line items</td></tr>
            ) : claim.lines.map(line => (
              <tr key={line.id} className="border-b border-gray-50">
                <td className="px-4 py-2 text-gray-500">{line.line_number}</td>
                <td className="px-4 py-2 font-mono font-medium text-[#45BFD3]">{line.cpt_code}</td>
                <td className="px-4 py-2 text-gray-600">{line.cpt_description || "-"}</td>
                <td className="px-4 py-2 text-gray-600">{line.units}</td>
                <td className="px-4 py-2 font-medium text-gray-800">{currency(line.charge_amount * line.units)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Revenue Cycle Events */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <h3 className="px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-100 bg-gray-50/60">Revenue Cycle Timeline</h3>
        <div className="p-4 space-y-3">
          {claim.events.length === 0 ? (
            <p className="text-sm text-gray-400">No events</p>
          ) : claim.events.map(ev => (
            <div key={ev.id} className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-gray-700">
                  {ev.details}
                  {ev.new_status && (
                    <span className={cn("ml-2 rounded-full px-2 py-0.5 text-xs font-medium",
                      (STATUS_STYLE[ev.new_status] || STATUS_STYLE.draft).bg,
                      (STATUS_STYLE[ev.new_status] || STATUS_STYLE.draft).text)}>
                      {ev.new_status}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400">{new Date(ev.created_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {claim.notes && (
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3>
          <p className="text-sm text-gray-600">{claim.notes}</p>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-gray-800">{value}</dd>
    </div>
  );
}
