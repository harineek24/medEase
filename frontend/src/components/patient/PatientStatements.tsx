import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Receipt, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

interface Statement {
  id: number;
  statement_number: string;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  due_date: string;
  status: string;
  created_at: string;
}

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  open:    { label: "Open",    bg: "bg-yellow-100", text: "text-yellow-700" },
  partial: { label: "Partial", bg: "bg-orange-100", text: "text-orange-700" },
  paid:    { label: "Paid",    bg: "bg-green-100",  text: "text-green-700" },
  overdue: { label: "Overdue", bg: "bg-red-100",    text: "text-red-700" },
};

export default function PatientStatements({ patientId }: { patientId: number }) {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/portal/patient/${patientId}/statements`);
      if (!res.ok) throw new Error("Failed to load statements");
      const data = await res.json();
      setStatements(data.statements || []);
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

  const totalDue = statements.reduce((sum, s) => sum + (s.amount_due || 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Statements</h1>
        {totalDue > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2">
            <span className="text-sm text-amber-700 font-medium">Total Due: {currency(totalDue)}</span>
          </div>
        )}
      </div>

      {statements.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <Receipt className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-lg font-medium text-gray-600">No statements yet</p>
          <p className="mt-1 text-sm text-gray-400">Your billing statements will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {statements.map((s, i) => {
            const badge = STATUS_STYLE[s.status] || STATUS_STYLE.open;
            return (
              <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
                className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm text-gray-500">{s.statement_number}</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">{currency(s.total_amount)}</p>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-medium", badge.bg, badge.text)}>{badge.label}</span>
                </div>
                <div className="mt-3 flex gap-6 text-sm">
                  <div><span className="text-gray-400">Paid:</span> <span className="text-green-600 font-medium">{currency(s.amount_paid)}</span></div>
                  <div><span className="text-gray-400">Due:</span> <span className="text-amber-600 font-medium">{currency(s.amount_due)}</span></div>
                  {s.due_date && <div><span className="text-gray-400">Due by:</span> <span className="text-gray-700">{new Date(s.due_date).toLocaleDateString()}</span></div>}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
