import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Search,
  ChevronDown,
  ChevronRight,
  Users,
  Building2,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

/* ---------- Types ---------- */
interface Patient {
  id: number;
  name: string;
}

interface InsuranceInfo {
  provider: string;
  policy_number: string;
  group_number: string;
  copay: number;
  deductible: number;
  status: string;
  effective_date?: string;
  expiry_date?: string;
  coverage_type?: string;
  notes?: string;
}

interface PatientInsurance {
  patient: Patient;
  insurance: InsuranceInfo | null;
}

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

/* ================================================================== */
/*  InsuranceDashboard                                                 */
/* ================================================================== */
export default function InsuranceDashboard() {
  const [data, setData] = useState<PatientInsurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  /* ---------- Fetch ---------- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pRes = await fetch(`${API}/api/patients`);
      if (!pRes.ok) throw new Error(`Patients fetch failed (${pRes.status})`);
      const patients: Patient[] = await pRes.json();

      const results: PatientInsurance[] = await Promise.all(
        patients.map(async (patient) => {
          try {
            const iRes = await fetch(
              `${API}/api/clinicadmin/insurance/${patient.id}`,
            );
            if (!iRes.ok) return { patient, insurance: null };
            const insurance: InsuranceInfo = await iRes.json();
            return { patient, insurance };
          } catch {
            return { patient, insurance: null };
          }
        }),
      );

      setData(results);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------- Derived data ---------- */
  const insuredPatients = data.filter((d) => d.insurance !== null);

  const providerCounts: Record<string, number> = {};
  insuredPatients.forEach((d) => {
    if (d.insurance) {
      const prov = d.insurance.provider;
      providerCounts[prov] = (providerCounts[prov] || 0) + 1;
    }
  });
  const providerBreakdown = Object.entries(providerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const filtered = data.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.patient.name.toLowerCase().includes(q) ||
      (d.insurance?.provider ?? "").toLowerCase().includes(q)
    );
  });

  /* ---------- Loading / Error ---------- */
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
        <button
          onClick={fetchData}
          className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
        Insurance Overview
      </h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total insured */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-white p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">
              Total Insured Patients
            </span>
            <span className="rounded-lg bg-[#45BFD3]/10 p-2 text-[#45BFD3]">
              <Users className="h-5 w-5" />
            </span>
          </div>
          <span className="mt-3 block text-2xl font-bold text-gray-900">
            {insuredPatients.length}{" "}
            <span className="text-base font-normal text-gray-400">
              / {data.length}
            </span>
          </span>
        </motion.div>

        {/* Top providers */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07 }}
          className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 sm:col-span-1 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">
              Common Providers
            </span>
            <span className="rounded-lg bg-green-50 p-2 text-green-600">
              <Building2 className="h-5 w-5" />
            </span>
          </div>
          {providerBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400">No provider data.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {providerBreakdown.map(([prov, count]) => (
                <span
                  key={prov}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-[#45BFD3]" />
                  {prov}
                  <span className="rounded-full bg-[#45BFD3]/20 px-1.5 text-[10px] font-bold text-[#45BFD3]">
                    {count}
                  </span>
                </span>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by patient or provider..."
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
        />
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60">
              <tr>
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Patient
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Provider
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Policy #
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Group #
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Copay
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Deductible
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    No patients found.
                  </td>
                </tr>
              ) : (
                filtered.map((row, i) => {
                  const ins = row.insurance;
                  const isExpanded = expandedId === row.patient.id;
                  return (
                    <motion.tr
                      key={row.patient.id}
                      layout
                      className={cn(
                        "border-b border-gray-50 cursor-pointer transition hover:bg-gray-50/50",
                        i % 2 === 1 && "bg-gray-50/30",
                      )}
                      onClick={() =>
                        setExpandedId(isExpanded ? null : row.patient.id)
                      }
                    >
                      <td className="px-4 py-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {row.patient.name}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {ins?.provider ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {ins?.policy_number ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {ins?.group_number ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {ins ? currency(ins.copay) : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {ins ? currency(ins.deductible) : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {ins ? (
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-medium",
                              ins.status === "active"
                                ? "bg-green-100 text-green-700"
                                : ins.status === "inactive"
                                  ? "bg-gray-100 text-gray-500"
                                  : "bg-yellow-100 text-yellow-700",
                            )}
                          >
                            {ins.status}
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-400">
                            No insurance
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Expanded detail panel (rendered below table as overlay) */}
        <AnimatePresence>
          {expandedId !== null && (() => {
            const row = data.find((d) => d.patient.id === expandedId);
            const ins = row?.insurance;
            if (!ins) return null;
            return (
              <motion.div
                key={expandedId}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-t border-gray-100 bg-[#45BFD3]/5"
              >
                <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Provider" value={ins.provider} />
                  <Detail label="Policy Number" value={ins.policy_number} />
                  <Detail label="Group Number" value={ins.group_number} />
                  <Detail label="Copay" value={currency(ins.copay)} />
                  <Detail label="Deductible" value={currency(ins.deductible)} />
                  <Detail label="Status" value={ins.status} />
                  {ins.effective_date && (
                    <Detail
                      label="Effective Date"
                      value={new Date(ins.effective_date).toLocaleDateString()}
                    />
                  )}
                  {ins.expiry_date && (
                    <Detail
                      label="Expiry Date"
                      value={new Date(ins.expiry_date).toLocaleDateString()}
                    />
                  )}
                  {ins.coverage_type && (
                    <Detail label="Coverage Type" value={ins.coverage_type} />
                  )}
                  {ins.notes && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <Detail label="Notes" value={ins.notes} />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* Small helper */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-800">{value}</dd>
    </div>
  );
}
