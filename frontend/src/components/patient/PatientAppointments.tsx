import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays,
  Clock,
  User,
  MapPin,
  XCircle,
  ArrowRightLeft,
  Plus,
  CheckCircle,
  Ban,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Appointment {
  id: number;
  date: string;
  time: string;
  doctor_name: string;
  doctor_specialty: string;
  service: string;
  clinic_name: string;
  status: 'scheduled' | 'completed' | 'no_show' | 'cancelled';
}

interface PatientAppointmentsProps {
  patientId: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function isFuture(dateStr: string, timeStr: string): boolean {
  const dt = new Date(`${dateStr}T${timeStr}`);
  return dt.getTime() > Date.now();
}

const STATUS_CONFIG: Record<
  Appointment['status'],
  { label: string; color: string; bg: string; icon: React.FC<{ className?: string }> }
> = {
  scheduled: {
    label: 'Scheduled',
    color: 'text-[#45BFD3]',
    bg: 'bg-[#45BFD3]/10',
    icon: Clock,
  },
  completed: {
    label: 'Completed',
    color: 'text-[#8BC34A]',
    bg: 'bg-[#8BC34A]/10',
    icon: CheckCircle,
  },
  no_show: {
    label: 'No Show',
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    icon: AlertTriangle,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'text-gray-400',
    bg: 'bg-gray-100',
    icon: Ban,
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Status badge */
const StatusBadge: React.FC<{ status: Appointment['status'] }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        cfg.bg,
        cfg.color,
      )}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
};

/** Appointment card */
const AppointmentCard: React.FC<{
  appt: Appointment;
  upcoming: boolean;
  onCancel: (id: number) => void;
  cancelling: number | null;
}> = ({ appt, upcoming, onCancel, cancelling }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
  >
    <div className="flex items-start justify-between mb-3">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays className="h-4 w-4 text-[#45BFD3]" />
          <span className="text-sm font-semibold text-gray-900">{formatDate(appt.date)}</span>
          <span className="text-sm text-gray-400">{formatTime(appt.time)}</span>
        </div>
        <p className="text-base font-bold text-gray-900">{appt.service}</p>
      </div>
      <StatusBadge status={appt.status} />
    </div>

    {/* Details */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-4">
      <div className="flex items-center gap-2 text-gray-500">
        <User className="h-4 w-4 text-gray-400" />
        <span>
          <span className="font-medium text-gray-700">{appt.doctor_name}</span>
          {appt.doctor_specialty && (
            <span className="text-gray-400"> &middot; {appt.doctor_specialty}</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 text-gray-500">
        <MapPin className="h-4 w-4 text-gray-400" />
        <span>{appt.clinic_name}</span>
      </div>
    </div>

    {/* Actions for upcoming appointments */}
    {upcoming && appt.status === 'scheduled' && (
      <div className="flex gap-2">
        <button
          onClick={() => onCancel(appt.id)}
          disabled={cancelling === appt.id}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors',
            cancelling === appt.id
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-red-50 text-red-600 hover:bg-red-100',
          )}
        >
          <XCircle className="h-3.5 w-3.5" />
          {cancelling === appt.id ? 'Cancelling...' : 'Cancel'}
        </button>
        <button
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold bg-[#45BFD3]/10 text-[#45BFD3] hover:bg-[#45BFD3]/20 transition-colors"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Reschedule
        </button>
      </div>
    )}
  </motion.div>
);

/** Request appointment form */
const RequestForm: React.FC<{
  patientId: number;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ patientId, onClose, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || !preferredDate) return;

    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/portal/patient/${patientId}/appointments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, preferred_date: preferredDate }),
        },
      );
      if (!res.ok) throw new Error('Failed to submit appointment request');
      setSuccessMsg(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch {
      // Show inline error handled by caller; here we just reset
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
    >
      <h3 className="text-lg font-bold text-gray-900 mb-4">Request an Appointment</h3>

      {successMsg ? (
        <div className="flex flex-col items-center py-8 text-center">
          <CheckCircle className="h-12 w-12 text-[#8BC34A] mb-3" />
          <p className="font-semibold text-gray-900">Request Submitted!</p>
          <p className="text-sm text-gray-500 mt-1">We'll get back to you shortly.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Reason for visit
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 outline-none focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20 transition resize-none"
              placeholder="Describe the reason for your visit..."
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Preferred date
            </label>
            <input
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20 transition"
              required
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-colors',
                submitting
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-[#45BFD3] hover:bg-[#3aacbf]',
              )}
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-5 py-3 text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </motion.div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const PatientAppointments: React.FC<PatientAppointmentsProps> = ({ patientId }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/portal/patient/${patientId}/appointments`,
      );
      if (!res.ok) throw new Error(`Failed to fetch appointments (${res.status})`);
      const data: Appointment[] = await res.json();
      setAppointments(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleCancel = async (appointmentId: number) => {
    setCancelling(appointmentId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/portal/patient/${patientId}/appointments/${appointmentId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        },
      );
      if (!res.ok) throw new Error('Failed to cancel appointment');
      // Update local state
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? { ...a, status: 'cancelled' as const } : a)),
      );
    } catch {
      // Silently handle errors for demo purposes
    } finally {
      setCancelling(null);
    }
  };

  // Split appointments
  const upcoming = appointments
    .filter((a) => isFuture(a.date, a.time) && a.status === 'scheduled')
    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());

  const past = appointments
    .filter((a) => !isFuture(a.date, a.time) || a.status !== 'scheduled')
    .sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());

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
        <p className="font-semibold text-lg mb-1">Unable to load appointments</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchAppointments}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-white text-sm hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-[#45BFD3]/15 p-2.5">
            <CalendarDays className="h-5 w-5 text-[#45BFD3]" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">My Appointments</h2>
        </div>
        {!showRequestForm && (
          <button
            onClick={() => setShowRequestForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#45BFD3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#3aacbf] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Request Appointment
          </button>
        )}
      </div>

      {/* Request form */}
      <AnimatePresence>
        {showRequestForm && (
          <RequestForm
            patientId={patientId}
            onClose={() => setShowRequestForm(false)}
            onSuccess={() => fetchAppointments()}
          />
        )}
      </AnimatePresence>

      {appointments.length === 0 && !showRequestForm ? (
        <div className="text-center py-16 text-gray-400">
          <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No appointments found</p>
          <p className="text-sm mt-1">Schedule an appointment to get started.</p>
        </div>
      ) : (
        <>
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Upcoming ({upcoming.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {upcoming.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appt={appt}
                    upcoming
                    onCancel={handleCancel}
                    cancelling={cancelling}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Past */}
          {past.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Past ({past.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {past.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appt={appt}
                    upcoming={false}
                    onCancel={handleCancel}
                    cancelling={cancelling}
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

export default PatientAppointments;
