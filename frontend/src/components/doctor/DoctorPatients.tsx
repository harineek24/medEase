import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Loader2,
  AlertTriangle,
  Users,
  CalendarDays,
  Pill,
  FileText,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/api";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Patient {
  id: number;
  name: string;
  last_visit_date: string | null;
  active_prescriptions_count: number;
  summary_count: number;
}

interface DoctorPatientsProps {
  doctorId: number;
  onSelectPatient?: (patientId: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function DoctorPatients({ doctorId, onSelectPatient }: DoctorPatientsProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/doctor/${doctorId}/patients`);
      if (!res.ok) throw new Error(`Failed to load patients (${res.status})`);
      const data = await res.json();
      const list: Patient[] = Array.isArray(data) ? data : data.patients ?? [];
      list.sort((a, b) => a.name.localeCompare(b.name));
      setPatients(list);
    } catch (err: any) {
      setError(err.message || "Failed to load patients");
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const filtered = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.toLowerCase();
    return patients.filter((p) => p.name.toLowerCase().includes(q));
  }, [patients, search]);

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                         */
  /* ---------------------------------------------------------------- */

  function initials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#45BFD3]" />
          <h2 className="text-xl font-semibold text-gray-900">My Patients</h2>
          {!loading && (
            <span className="ml-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {filtered.length}
            </span>
          )}
        </div>

        {/* Search bar */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patients..."
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm placeholder:text-gray-400 focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-[#45BFD3]" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">
            {search.trim() ? "No patients match your search" : "No patients found"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((patient, idx) => (
            <motion.div
              key={patient.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              onClick={() => onSelectPatient?.(patient.id)}
              className={cn(
                "group rounded-xl bg-white p-5 shadow-sm border border-gray-100 transition-all",
                onSelectPatient && "cursor-pointer hover:shadow-md hover:border-[#45BFD3]/30"
              )}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#45BFD3]/10 text-sm font-semibold text-[#45BFD3]">
                  {initials(patient.name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 truncate text-sm">
                      {patient.name}
                    </h3>
                    {onSelectPatient && (
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-[#45BFD3] transition-colors shrink-0" />
                    )}
                  </div>

                  {/* Meta row */}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {patient.last_visit_date
                        ? new Date(patient.last_visit_date).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "No visits"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Pill className="h-3.5 w-3.5" />
                      {patient.active_prescriptions_count} Rx
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {patient.summary_count} summaries
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
