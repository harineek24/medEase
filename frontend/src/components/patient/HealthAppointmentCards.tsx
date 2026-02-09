import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays,
  Clock,
  User,
  MapPin,
  XCircle,
  CheckCircle,
  Ban,
  AlertTriangle,
  CalendarPlus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/api';
import type { PatientView } from '@/App';

interface Appointment {
  id: number;
  date: string;
  time: string;
  doctor_name: string;
  doctor_specialty: string;
  service: string;
  clinic_name: string;
  status: string;
}

interface HealthAppointmentCardsProps {
  patientId: number;
  onNavigate: (view: PatientView) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.FC<{ className?: string }> }> = {
  scheduled: { label: 'Scheduled', color: 'text-[#45BFD3]', bg: 'bg-[#45BFD3]/10', icon: Clock },
  confirmed: { label: 'Confirmed', color: 'text-[#8BC34A]', bg: 'bg-[#8BC34A]/10', icon: CheckCircle },
  completed: { label: 'Completed', color: 'text-[#8BC34A]', bg: 'bg-[#8BC34A]/10', icon: CheckCircle },
  no_show: { label: 'No Show', color: 'text-amber-500', bg: 'bg-amber-50', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', color: 'text-gray-400', bg: 'bg-gray-100', icon: Ban },
};

const HealthAppointmentCards: React.FC<HealthAppointmentCardsProps> = ({ patientId, onNavigate }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/portal/patient/${patientId}/appointments`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const raw: Record<string, unknown>[] = data.appointments || data;
      setAppointments(
        raw.map((a) => ({
          id: a.id as number,
          date: (a.appointment_date || a.date) as string,
          time: (a.appointment_time || a.time) as string,
          doctor_name: (a.doctor_name || '') as string,
          doctor_specialty: (a.doctor_specialty || '') as string,
          service: (a.service_name || a.service || 'Consultation') as string,
          clinic_name: (a.clinic_name || '') as string,
          status: (a.status || 'scheduled') as string,
        }))
      );
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleCancel = async (id: number) => {
    setCancelling(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/portal/patient/${patientId}/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (res.ok) {
        setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'cancelled' } : a)));
      }
    } catch {
      // silently handle
    } finally {
      setCancelling(null);
    }
  };

  const activeStatuses = ['scheduled', 'confirmed'];
  const upcoming = appointments
    .filter((a) => isFuture(a.date, a.time) && activeStatuses.includes(a.status))
    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());

  const past = appointments
    .filter((a) => !isFuture(a.date, a.time) || !activeStatuses.includes(a.status))
    .sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());

  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <CalendarDays className="h-5 w-5 text-[#45BFD3]" />
          <h3 className="text-lg font-bold text-gray-900">My Appointments</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <div className="h-6 w-6 rounded-full border-2 border-[#45BFD3] border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-[#45BFD3]" />
          <h3 className="text-lg font-bold text-gray-900">My Appointments</h3>
        </div>
        <button
          onClick={() => onNavigate('appointments')}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#45BFD3] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3aacbf] transition-colors"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Book New
        </button>
      </div>

      {appointments.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-2xl text-gray-400">
          <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">No appointments yet</p>
          <p className="text-xs mt-1">Book an appointment to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Upcoming ({upcoming.length})
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {upcoming.map((appt) => {
                  const cfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled;
                  const Icon = cfg.icon;
                  return (
                    <motion.div
                      key={appt.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-3.5 w-3.5 text-[#45BFD3]" />
                          <span className="text-xs font-semibold text-gray-900">{formatDate(appt.date)}</span>
                          <span className="text-xs text-gray-400">{formatTime(appt.time)}</span>
                        </div>
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', cfg.bg, cfg.color)}>
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-900 mb-1">{appt.service}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-2">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3 text-gray-400" />
                          {appt.doctor_name}
                          {appt.doctor_specialty && <span className="text-gray-400">&middot; {appt.doctor_specialty}</span>}
                        </span>
                        {appt.clinic_name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-gray-400" />
                            {appt.clinic_name}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleCancel(appt.id)}
                        disabled={cancelling === appt.id}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors',
                          cancelling === appt.id
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-red-50 text-red-600 hover:bg-red-100',
                        )}
                      >
                        <XCircle className="h-3 w-3" />
                        {cancelling === appt.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Past ({past.length})
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {past.map((appt) => {
                  const cfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled;
                  const Icon = cfg.icon;
                  return (
                    <motion.div
                      key={appt.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 opacity-75"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-xs font-semibold text-gray-700">{formatDate(appt.date)}</span>
                          <span className="text-xs text-gray-400">{formatTime(appt.time)}</span>
                        </div>
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', cfg.bg, cfg.color)}>
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-700 mb-1">{appt.service}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3 text-gray-400" />
                          {appt.doctor_name}
                          {appt.doctor_specialty && <span className="text-gray-400">&middot; {appt.doctor_specialty}</span>}
                        </span>
                        {appt.clinic_name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-gray-400" />
                            {appt.clinic_name}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HealthAppointmentCards;
