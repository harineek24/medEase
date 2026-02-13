import React, { useState, useEffect, useCallback } from 'react';
import { Pill, RefreshCw, Calendar, User, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Prescription {
  id: number;
  medication_name: string;
  dosage: string;
  frequency: string;
  prescribed_by: string;
  prescribed_date: string;
  refills_remaining: number;
  instructions: string;
  status: 'active' | 'expired';
}

interface PatientPrescriptionsProps {
  patientId: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Toast notification */
const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-[#8BC34A] px-5 py-3 text-white shadow-lg text-sm font-medium"
    >
      <CheckCircle className="h-5 w-5" />
      {message}
    </motion.div>
  );
};

/** Prescription card */
const PrescriptionCard: React.FC<{
  rx: Prescription;
  onRefill: (id: number) => void;
  refilling: number | null;
}> = ({ rx, onRefill, refilling }) => {
  const isActive = rx.status === 'active';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex items-center justify-center h-10 w-10 rounded-xl',
              isActive ? 'bg-[#8BC34A]/15' : 'bg-gray-100',
            )}
          >
            <Pill className={cn('h-5 w-5', isActive ? 'text-[#8BC34A]' : 'text-gray-400')} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{rx.medication_name}</h3>
            <p className="text-sm text-gray-500">
              {rx.dosage} &middot; {rx.frequency}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
            isActive ? 'bg-[#8BC34A]/10 text-[#6a9a2e]' : 'bg-gray-100 text-gray-400',
          )}
        >
          {isActive ? 'Active' : 'Expired'}
        </span>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-sm">
        <div className="flex items-center gap-2 text-gray-500">
          <User className="h-4 w-4 text-gray-400" />
          <span>
            Prescribed by <span className="font-medium text-gray-700">{rx.prescribed_by}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <Calendar className="h-4 w-4 text-gray-400" />
          <span>{formatDate(rx.prescribed_date)}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <RefreshCw className="h-4 w-4 text-gray-400" />
          <span>
            {rx.refills_remaining} refill{rx.refills_remaining !== 1 ? 's' : ''} remaining
          </span>
        </div>
      </div>

      {/* Instructions */}
      {rx.instructions && (
        <div className="flex items-start gap-2 rounded-xl bg-gray-50 px-4 py-3 mb-4">
          <AlertCircle className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-gray-600 leading-relaxed">{rx.instructions}</p>
        </div>
      )}

      {/* Refill button */}
      {isActive && rx.refills_remaining > 0 && (
        <button
          onClick={() => onRefill(rx.id)}
          disabled={refilling === rx.id}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors',
            refilling === rx.id
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-[#45BFD3] text-white hover:bg-[#3aacbf]',
          )}
        >
          <RefreshCw className={cn('h-4 w-4', refilling === rx.id && 'animate-spin')} />
          {refilling === rx.id ? 'Requesting...' : 'Request Refill'}
        </button>
      )}
    </motion.div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const PatientPrescriptions: React.FC<PatientPrescriptionsProps> = ({ patientId }) => {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refilling, setRefilling] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fetchPrescriptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/portal/patient/${patientId}/prescriptions`,
      );
      if (!res.ok) throw new Error(`Failed to fetch prescriptions (${res.status})`);
      const data: Prescription[] = await res.json();
      setPrescriptions(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchPrescriptions();
  }, [fetchPrescriptions]);

  const handleRefill = async (prescriptionId: number) => {
    setRefilling(prescriptionId);
    // Simulate a brief network delay, then show success toast
    await new Promise((r) => setTimeout(r, 1000));
    setRefilling(null);
    setToastMsg('Refill request submitted successfully!');
  };

  // Separate active and expired
  const active = prescriptions.filter((p) => p.status === 'active');
  const expired = prescriptions.filter((p) => p.status === 'expired');

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="h-10 w-10 rounded-full border-4 border-[#45BFD3] border-t-transparent"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-8 text-center text-red-600">
        <p className="font-semibold text-lg mb-1">Unable to load prescriptions</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchPrescriptions}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-white text-sm hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
      <AnimatePresence>
        {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-[#45BFD3]/15 p-2.5">
          <Pill className="h-5 w-5 text-[#45BFD3]" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">My Prescriptions</h2>
      </div>

      {prescriptions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Pill className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No prescriptions found</p>
          <p className="text-sm mt-1">Prescriptions from your doctor will appear here.</p>
        </div>
      ) : (
        <>
          {/* Active prescriptions */}
          {active.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Active ({active.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {active.map((rx) => (
                  <PrescriptionCard
                    key={rx.id}
                    rx={rx}
                    onRefill={handleRefill}
                    refilling={refilling}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Expired prescriptions */}
          {expired.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Expired ({expired.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {expired.map((rx) => (
                  <PrescriptionCard
                    key={rx.id}
                    rx={rx}
                    onRefill={handleRefill}
                    refilling={refilling}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default PatientPrescriptions;
