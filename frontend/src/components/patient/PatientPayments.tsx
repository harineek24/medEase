import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2, AlertCircle, RefreshCw, DollarSign } from "lucide-react";

const API = "http://localhost:8000";

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

interface BillingRecord {
  id: number;
  description: string;
  amount: number;
  insurance_covered: number;
  patient_responsibility: number;
  status: string;
  created_at: string;
}

interface Payment {
  id: number;
  amount: number;
  payment_method: string;
  reference_number: string;
  created_at: string;
}

const METHODS = ["credit_card", "debit_card", "hsa", "fsa"];

export default function PatientPayments({ patientId }: { patientId: number }) {
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("credit_card");
  const [payBillingId, setPayBillingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bRes, pRes] = await Promise.all([
        fetch(`${API}/api/portal/patient/${patientId}/billing`),
        fetch(`${API}/api/portal/patient/${patientId}/payments`),
      ]);
      if (bRes.ok) {
        const bData = await bRes.json();
        setBilling(bData.billing || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setPayments(pData.payments || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(false);
    try {
      const res = await fetch(`${API}/api/portal/patient/${patientId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          amount: Number(payAmount),
          payment_method: payMethod,
          billing_id: payBillingId,
        }),
      });
      if (!res.ok) throw new Error("Payment failed");
      setSuccess(true);
      setPayAmount("");
      setPayBillingId(null);
      fetchData();
    } catch {
      alert("Payment failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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

  const pendingBills = billing.filter(b => b.status !== "paid");
  const totalOwed = pendingBills.reduce((sum, b) => sum + (b.patient_responsibility || 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-gray-900">Make a Payment</h1>

      {/* Balance card */}
      {totalOwed > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-gradient-to-r from-[#45BFD3] to-[#3caebb] p-6 text-white shadow-lg">
          <p className="text-sm opacity-80">Your Balance</p>
          <p className="text-3xl font-bold mt-1">{currency(totalOwed)}</p>
          <p className="text-sm mt-2 opacity-80">{pendingBills.length} pending charge{pendingBills.length !== 1 ? "s" : ""}</p>
        </motion.div>
      )}

      {/* Payment form */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.07 } }}
        className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pay Now</h2>
        {success && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
            Payment recorded successfully!
          </div>
        )}
        <form onSubmit={handlePay} className="space-y-4">
          {pendingBills.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Pay for (optional)</label>
              <select value={payBillingId ?? ""} onChange={e => setPayBillingId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition">
                <option value="">General payment</option>
                {pendingBills.map(b => <option key={b.id} value={b.id}>{b.description} - {currency(b.patient_responsibility)}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Amount ($)</label>
              <input type="number" step="0.01" min="0.01" required value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition" placeholder="0.00" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Payment Method</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition">
                {METHODS.map(m => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-6 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition disabled:opacity-60">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
            Submit Payment
          </button>
        </form>
      </motion.div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <h3 className="px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-100 bg-gray-50/60">Payment History</h3>
          <div className="divide-y divide-gray-50">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-green-700">{currency(p.amount)}</p>
                  <p className="text-xs text-gray-400">{p.payment_method.replace("_", " ")} &middot; {p.reference_number}</p>
                </div>
                <p className="text-xs text-gray-400">{new Date(p.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
