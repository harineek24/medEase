import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ClipboardCheck,
  Send,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { API_BASE_URL as API } from "@/api";

interface Claim {
  id: number;
  claim_number: string;
  patient_name: string;
  status: string;
  total_charge: number;
  date_of_service: string;
}

interface ScrubResult {
  passed: boolean;
  error_count: number;
  warning_count: number;
  errors: Array<{ category: string; message: string }>;
  warnings: Array<{ category: string; message: string }>;
}

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

export default function ClearinghousePage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrubResults, setScrubResults] = useState<Record<number, ScrubResult>>({});
  const [processing, setProcessing] = useState<Set<number>>(new Set());

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/clinicadmin/claims`);
      if (!res.ok) throw new Error(`Fetch failed`);
      const data = await res.json();
      const eligible = (data.claims || []).filter((c: Claim) => ["draft", "validated"].includes(c.status));
      setClaims(eligible);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const scrubClaim = async (claimId: number) => {
    setProcessing(prev => new Set(prev).add(claimId));
    try {
      const res = await fetch(`${API}/api/clinicadmin/claims/${claimId}/scrub`, { method: "POST" });
      const data = await res.json();
      setScrubResults(prev => ({ ...prev, [claimId]: data }));
      fetchClaims();
    } catch {
      alert("Scrub failed");
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(claimId); return s; });
    }
  };

  const submitClaim = async (claimId: number) => {
    setProcessing(prev => new Set(prev).add(claimId));
    try {
      const res = await fetch(`${API}/api/clinicadmin/claims/${claimId}/submit`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        if (data.scrub_results) setScrubResults(prev => ({ ...prev, [claimId]: data.scrub_results }));
        else alert(data.detail || "Submit failed");
      } else {
        fetchClaims();
      }
    } catch {
      alert("Submit failed");
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(claimId); return s; });
    }
  };

  const scrubAll = async () => {
    for (const claim of claims.filter(c => c.status === "draft")) {
      await scrubClaim(claim.id);
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
        <button onClick={fetchClaims} className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Clearinghouse</h1>
          <p className="text-sm text-gray-500 mt-1">Scrub and submit claims for processing</p>
        </div>
        <button onClick={scrubAll} className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition">
          <ClipboardCheck className="h-4 w-4" /> Scrub All Draft Claims
        </button>
      </div>

      {claims.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-400" />
          <p className="mt-4 text-lg font-medium text-gray-700">All clear!</p>
          <p className="mt-1 text-sm text-gray-400">No draft or validated claims pending submission.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {claims.map((claim, i) => {
            const result = scrubResults[claim.id];
            const isProcessing = processing.has(claim.id);
            return (
              <motion.div key={claim.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
                className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{claim.claim_number}</h3>
                    <p className="text-sm text-gray-500">{claim.patient_name} &middot; {currency(claim.total_charge)} &middot; {claim.date_of_service || "No DOS"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium",
                      claim.status === "validated" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")}>
                      {claim.status}
                    </span>
                    {isProcessing ? (
                      <Loader2 className="h-5 w-5 animate-spin text-[#45BFD3]" />
                    ) : (
                      <>
                        {claim.status === "draft" && (
                          <button onClick={() => scrubClaim(claim.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#45BFD3] px-3 py-1.5 text-xs font-medium text-[#45BFD3] hover:bg-[#45BFD3]/10 transition">
                            <ClipboardCheck className="h-3.5 w-3.5" /> Scrub
                          </button>
                        )}
                        {claim.status === "validated" && (
                          <button onClick={() => submitClaim(claim.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#45BFD3] px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-[#3caebb] transition">
                            <Send className="h-3.5 w-3.5" /> Submit
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {result && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className={cn("mt-3 rounded-lg p-3 text-sm", result.passed ? "bg-green-50" : "bg-red-50")}>
                    <p className={cn("font-medium", result.passed ? "text-green-700" : "text-red-700")}>
                      {result.passed ? "Passed all edit checks" : `${result.error_count} error(s), ${result.warning_count} warning(s)`}
                    </p>
                    {result.errors.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 mt-1">
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        <span className="text-red-600">{e.message}</span>
                      </div>
                    ))}
                    {result.warnings.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 mt-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="text-amber-600">{w.message}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
