import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  DollarSign,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

interface ERASummary {
  id: string;
  check_number: string;
  payer_name: string;
  payer_id: string;
  payment_amount: number;
  claim_count: number;
  payment_date: string;
  payment_method: string;
  status: string;
}

interface ERAClaimAdjustment {
  group_code: string;
  reason_code: string;
  amount: number;
  description: string;
}

interface ERAServiceLine {
  procedure_code: string;
  charge_amount: number;
  paid_amount: number;
  units: number;
}

interface ERAClaim {
  patient_name: string;
  patient_control_number: string;
  claim_status: string;
  charge_amount: number;
  paid_amount: number;
  patient_responsibility: number;
  payer_claim_number: string;
  service_date: string;
  adjustments: ERAClaimAdjustment[];
  service_lines: ERAServiceLine[];
}

interface ERADetail {
  _source: string;
  id: string;
  check_number: string;
  payer_name: string;
  payment_amount: number;
  payment_date: string;
  payment_method: string;
  claims: ERAClaim[];
  claim_count: number;
}

interface ServiceStatus {
  mode: string;
  api_key_set: boolean;
}

const METHOD_LABELS: Record<string, string> = {
  ACH: "ACH Transfer",
  CHK: "Paper Check",
  NON: "Non-Payment",
};

const CLAIM_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  "1": { label: "Processed as Primary", color: "bg-green-100 text-green-700" },
  "2": { label: "Processed as Secondary", color: "bg-blue-100 text-blue-700" },
  "3": { label: "Processed as Tertiary", color: "bg-purple-100 text-purple-700" },
  "4": { label: "Denied", color: "bg-red-100 text-red-700" },
  "22": { label: "Reversal", color: "bg-amber-100 text-amber-700" },
};

export default function ERAPage() {
  const [eras, setEras] = useState<ERASummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [selectedEra, setSelectedEra] = useState<ERADetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedClaim, setExpandedClaim] = useState<string | null>(null);

  const fetchEras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eraRes, statusRes] = await Promise.all([
        fetch(`${API}/api/clinicadmin/era`),
        fetch(`${API}/api/clinicadmin/era/status`),
      ]);
      if (eraRes.ok) {
        const data = await eraRes.json();
        setEras(data.eras || []);
      }
      if (statusRes.ok) setStatus(await statusRes.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEras(); }, [fetchEras]);

  const handleViewDetail = async (eraId: string) => {
    if (selectedEra?.id === eraId) {
      setSelectedEra(null);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await fetch(`${API}/api/clinicadmin/era/${eraId}`);
      if (!res.ok) throw new Error("Failed to load ERA detail");
      setSelectedEra(await res.json());
    } catch {
      alert("Failed to load ERA details");
    } finally {
      setDetailLoading(false);
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
        <button onClick={fetchEras} className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  const totalPayments = eras.reduce((sum, e) => sum + e.payment_amount, 0);
  const totalClaims = eras.reduce((sum, e) => sum + e.claim_count, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">ERA / Remittance Advice</h1>
          <p className="text-sm text-gray-500 mt-1">Electronic Remittance Advice (835) — payer payment explanations</p>
        </div>
        <div className="flex items-center gap-3">
          {status && (
            <span className={cn("rounded-full px-3 py-1 text-xs font-medium",
              status.mode === "live" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
              {status.mode === "live" ? "Live (Stedi)" : "Simulated"}
            </span>
          )}
          <button onClick={fetchEras} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 transition">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Total Remittance</span>
            <span className="rounded-lg p-2 bg-green-50 text-green-600"><DollarSign className="h-5 w-5" /></span>
          </div>
          <span className="mt-3 block text-2xl font-bold text-gray-900">{currency(totalPayments)}</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.07 } }}
          className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">ERA Reports</span>
            <span className="rounded-lg p-2 bg-[#45BFD3]/10 text-[#45BFD3]"><FileText className="h-5 w-5" /></span>
          </div>
          <span className="mt-3 block text-2xl font-bold text-gray-900">{eras.length}</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.14 } }}
          className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Claims Covered</span>
            <span className="rounded-lg p-2 bg-purple-50 text-purple-600"><CreditCard className="h-5 w-5" /></span>
          </div>
          <span className="mt-3 block text-2xl font-bold text-gray-900">{totalClaims}</span>
        </motion.div>
      </div>

      {/* ERA list */}
      <div className="space-y-3">
        {eras.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
            <FileText className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-4 text-lg font-medium text-gray-700">No ERA reports</p>
            <p className="mt-1 text-sm text-gray-400">Remittance advice will appear here when payers process claims.</p>
          </div>
        ) : eras.map((era, i) => (
          <motion.div key={era.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}>
            <div className={cn("rounded-xl border bg-white shadow-sm overflow-hidden transition",
              selectedEra?.id === era.id ? "border-[#45BFD3]" : "border-gray-100")}>
              {/* Summary row */}
              <button onClick={() => handleViewDetail(era.id)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50/50 transition">
                <div className="rounded-lg bg-[#45BFD3]/10 p-2 shrink-0">
                  <FileText className="h-5 w-5 text-[#45BFD3]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{era.payer_name}</h3>
                    <span className="text-xs font-mono text-gray-400">#{era.check_number}</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {era.claim_count} claim{era.claim_count !== 1 ? "s" : ""} &middot; {METHOD_LABELS[era.payment_method] || era.payment_method} &middot; {era.payment_date}
                  </p>
                </div>
                <span className="text-lg font-bold text-green-700">{currency(era.payment_amount)}</span>
                {detailLoading && selectedEra?.id !== era.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" />
                ) : selectedEra?.id === era.id ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                )}
              </button>

              {/* Detail panel */}
              <AnimatePresence>
                {selectedEra?.id === era.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-100">
                    <div className="p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-700">Claim Payment Details</h4>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                          selectedEra._source === "stedi_live" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600")}>
                          {selectedEra._source === "stedi_live" ? "Live" : "Simulated"}
                        </span>
                      </div>

                      {selectedEra.claims.map((claim, ci) => {
                        const claimKey = `${era.id}-${ci}`;
                        const isExpanded = expandedClaim === claimKey;
                        const claimStatus = CLAIM_STATUS_LABELS[claim.claim_status] || { label: claim.claim_status, color: "bg-gray-100 text-gray-600" };

                        return (
                          <div key={ci} className="rounded-lg border border-gray-100 overflow-hidden">
                            <button onClick={() => setExpandedClaim(isExpanded ? null : claimKey)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/50 transition">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-800">{claim.patient_name || "Patient"}</span>
                                  <span className="font-mono text-xs text-gray-400">{claim.patient_control_number}</span>
                                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", claimStatus.color)}>{claimStatus.label}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Service: {claim.service_date || "N/A"} &middot; Payer Claim: {claim.payer_claim_number}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-medium text-gray-800">Charged: {currency(claim.charge_amount)}</p>
                                <p className="text-sm font-bold text-green-700">Paid: {currency(claim.paid_amount)}</p>
                              </div>
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                            </button>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                  className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 space-y-3">
                                  {claim.patient_responsibility > 0 && (
                                    <p className="text-sm text-amber-700">
                                      Patient Responsibility: <span className="font-medium">{currency(claim.patient_responsibility)}</span>
                                    </p>
                                  )}

                                  {claim.adjustments.length > 0 && (
                                    <div>
                                      <h5 className="text-xs font-semibold uppercase text-gray-500 mb-1">Adjustments</h5>
                                      {claim.adjustments.map((adj, ai) => (
                                        <div key={ai} className="flex items-center gap-2 text-sm py-0.5">
                                          <span className={cn("rounded px-1.5 py-0.5 text-xs font-mono",
                                            adj.group_code === "PR" ? "bg-amber-100 text-amber-700" :
                                            adj.group_code === "CO" ? "bg-blue-100 text-blue-700" :
                                            "bg-gray-100 text-gray-600")}>{adj.group_code}-{adj.reason_code}</span>
                                          <span className="text-gray-600 flex-1">{adj.description}</span>
                                          <span className="font-medium text-gray-800">{currency(adj.amount)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {claim.service_lines.length > 0 && (
                                    <div>
                                      <h5 className="text-xs font-semibold uppercase text-gray-500 mb-1">Service Lines</h5>
                                      {claim.service_lines.map((sl, si) => (
                                        <div key={si} className="flex items-center gap-2 text-sm py-0.5">
                                          <span className="font-mono text-[#45BFD3]">{sl.procedure_code}</span>
                                          <span className="text-gray-500">x{sl.units}</span>
                                          <span className="text-gray-600 flex-1">Charged: {currency(sl.charge_amount)}</span>
                                          <span className="font-medium text-green-700">Paid: {currency(sl.paid_amount)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
