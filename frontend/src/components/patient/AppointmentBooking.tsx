import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Star,
  MapPin,
  Clock,
  DollarSign,
  Calendar,
  X,
  Check,
  Stethoscope,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Doctor {
  id: number;
  first_name: string;
  last_name: string;
  title: string;
  specialty: string;
  sub_specialty?: string;
  rating: number;
  review_count: number;
  clinic_name: string;
  clinic_city?: string;
  clinic_address?: string;
  consultation_fee: number;
  nearest_available?: string;
  accepted_insurance?: string;
  bio?: string;
  languages?: string;
  education?: string;
  available_hours?: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

interface SearchSuggestion {
  type: 'doctor' | 'specialty';
  id?: number;
  label: string;
  subtitle?: string;
}

interface Filters {
  location: string;
  minRating: number;
  maxFee: number;
  insurance: string;
  timeOfDay: string[];
}

interface AppointmentBookingProps {
  patientId: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: Filters = {
  location: '',
  minRating: 0,
  maxFee: 500,
  insurance: '',
  timeOfDay: [],
};

const TIME_PERIODS = [
  { key: 'morning', label: 'Morning', range: '8 AM - 12 PM' },
  { key: 'afternoon', label: 'Afternoon', range: '12 - 5 PM' },
  { key: 'evening', label: 'Evening', range: '5 - 8 PM' },
] as const;

const INSURANCE_PROVIDERS = [
  'Aetna',
  'Blue Cross Blue Shield',
  'Cigna',
  'Humana',
  'Kaiser Permanente',
  'UnitedHealthcare',
  'Medicare',
  'Medicaid',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDayName(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function formatDayNumber(date: Date): string {
  return date.getDate().toString();
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatReadableDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getInitials(name: string): string {
  const words = name.replace(/^Dr\.?\s*/i, '').split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return (words[0]?.[0] ?? '').toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
    'bg-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function doctorFullName(d: Doctor): string {
  return `Dr. ${d.first_name} ${d.last_name}`;
}

function buildWeek(startDate: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Spinner for loading states */
const Spinner: React.FC<{ size?: string }> = ({ size = 'h-10 w-10' }) => (
  <motion.div
    animate={{ rotate: 360 }}
    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    className={cn(size, 'rounded-full border-4 border-[#45BFD3] border-t-transparent')}
  />
);

/** Star rating display */
const StarRating: React.FC<{ rating: number; count: number }> = ({ rating, count }) => (
  <div className="flex items-center gap-1">
    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
    <span className="text-sm font-semibold text-gray-800">{rating.toFixed(1)}</span>
    <span className="text-xs text-gray-400">({count} reviews)</span>
  </div>
);

/** Search autocomplete dropdown */
const SearchDropdown: React.FC<{
  suggestions: SearchSuggestion[];
  onSelect: (s: SearchSuggestion) => void;
  visible: boolean;
}> = ({ suggestions, onSelect, visible }) => (
  <AnimatePresence>
    {visible && suggestions.length > 0 && (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15 }}
        className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl bg-white border border-gray-200 shadow-lg overflow-hidden max-h-72 overflow-y-auto"
      >
        {suggestions.map((s, i) => (
          <button
            key={`${s.type}-${s.id ?? s.label}-${i}`}
            onClick={() => onSelect(s)}
            className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
          >
            <div
              className={cn(
                'flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center',
                s.type === 'doctor' ? 'bg-[#45BFD3]/10' : 'bg-violet-50',
              )}
            >
              {s.type === 'doctor' ? (
                <Stethoscope className="h-4 w-4 text-[#45BFD3]" />
              ) : (
                <Search className="h-4 w-4 text-violet-500" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{s.label}</p>
              {s.subtitle && (
                <p className="text-xs text-gray-400 truncate">{s.subtitle}</p>
              )}
            </div>
            <span
              className={cn(
                'ml-auto flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full',
                s.type === 'doctor'
                  ? 'bg-[#45BFD3]/10 text-[#45BFD3]'
                  : 'bg-violet-50 text-violet-500',
              )}
            >
              {s.type}
            </span>
          </button>
        ))}
      </motion.div>
    )}
  </AnimatePresence>
);

/** Date navigation pill bar */
const DateNavigator: React.FC<{
  weekStart: Date;
  selectedDate: string;
  onSelect: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
}> = ({ weekStart, selectedDate, onSelect, onPrev, onNext }) => {
  const days = useMemo(() => buildWeek(weekStart), [weekStart]);
  const today = formatDate(new Date());

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onPrev}
        className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        aria-label="Previous week"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-none flex-1 justify-center">
        {days.map((d) => {
          const ds = formatDate(d);
          const isSelected = ds === selectedDate;
          const isToday = ds === today;
          return (
            <button
              key={ds}
              onClick={() => onSelect(ds)}
              className={cn(
                'flex flex-col items-center px-3 py-2 rounded-xl text-sm transition-all min-w-[52px]',
                isSelected
                  ? 'bg-[#45BFD3] text-white shadow-md shadow-[#45BFD3]/25'
                  : isToday
                    ? 'bg-[#45BFD3]/10 text-[#45BFD3] hover:bg-[#45BFD3]/20'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100',
              )}
            >
              <span className={cn('text-[11px] font-medium', isSelected ? 'text-white/80' : 'text-gray-400')}>
                {formatDayName(d)}
              </span>
              <span className="text-base font-bold leading-tight">{formatDayNumber(d)}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onNext}
        className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        aria-label="Next week"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
};

/** Filter modal overlay */
const FilterModal: React.FC<{
  filters: Filters;
  onChange: (f: Filters) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
}> = ({ filters, onChange, onApply, onClear, onClose }) => {
  const handleTimeToggle = (key: string) => {
    const next = filters.timeOfDay.includes(key)
      ? filters.timeOfDay.filter((t) => t !== key)
      : [...filters.timeOfDay, key];
    onChange({ ...filters, timeOfDay: next });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-[#45BFD3]" />
            <h3 className="text-lg font-bold text-gray-900">Filters</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-7">
          {/* Location */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={filters.location}
                onChange={(e) => onChange({ ...filters, location: e.target.value })}
                placeholder="City, state, or zip code"
                className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 outline-none focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20 transition"
              />
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Minimum Rating</label>
            <div className="flex gap-2">
              {[
                { value: 0, label: 'Any' },
                { value: 3, label: '3+' },
                { value: 4, label: '4+' },
                { value: 4.5, label: '4.5+' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onChange({ ...filters, minRating: opt.value })}
                  className={cn(
                    'flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                    filters.minRating === opt.value
                      ? 'bg-[#45BFD3] text-white shadow-sm'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100',
                  )}
                >
                  {opt.value > 0 && <Star className="h-3.5 w-3.5 fill-current" />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price range */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Max Consultation Fee</label>
              <span className="text-sm font-bold text-[#45BFD3]">${filters.maxFee}</span>
            </div>
            <input
              type="range"
              min={0}
              max={500}
              step={25}
              value={filters.maxFee}
              onChange={(e) => onChange({ ...filters, maxFee: Number(e.target.value) })}
              className="w-full h-2 bg-gray-100 rounded-full appearance-none cursor-pointer accent-[#45BFD3]"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>$0</span>
              <span>$250</span>
              <span>$500</span>
            </div>
          </div>

          {/* Insurance */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Insurance</label>
            <select
              value={filters.insurance}
              onChange={(e) => onChange({ ...filters, insurance: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20 transition bg-white appearance-none"
            >
              <option value="">Any insurance</option>
              <option value="covered">Covered by my policy</option>
              {INSURANCE_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Time of day */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Time of Day</label>
            <div className="flex flex-col gap-2">
              {TIME_PERIODS.map((tp) => {
                const active = filters.timeOfDay.includes(tp.key);
                return (
                  <button
                    key={tp.key}
                    onClick={() => handleTimeToggle(tp.key)}
                    className={cn(
                      'flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all border',
                      active
                        ? 'bg-[#45BFD3]/10 border-[#45BFD3]/30 text-[#45BFD3]'
                        : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>{tp.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs', active ? 'text-[#45BFD3]/70' : 'text-gray-400')}>
                        {tp.range}
                      </span>
                      {active && <Check className="h-4 w-4" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
          <button
            onClick={onClear}
            className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={onApply}
            className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white bg-[#45BFD3] hover:bg-[#3aacbf] transition-colors shadow-sm"
          >
            Apply Filters
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

/** Doctor card */
const DoctorCard: React.FC<{
  doctor: Doctor;
  onBook: (doctor: Doctor) => void;
}> = ({ doctor, onBook }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col"
  >
    {/* Header */}
    <div className="flex items-start gap-4 mb-4">
      <div
        className={cn(
          'flex-shrink-0 h-14 w-14 rounded-full flex items-center justify-center text-white text-lg font-bold',
          getAvatarColor(doctorFullName(doctor)),
        )}
      >
        {getInitials(doctorFullName(doctor))}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold text-gray-900 truncate">
          {doctorFullName(doctor)}{doctor.title ? `, ${doctor.title}` : ''}
        </h3>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Stethoscope className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-500 truncate">
            {doctor.specialty}
            {doctor.sub_specialty ? ` - ${doctor.sub_specialty}` : ''}
          </span>
        </div>
        <div className="mt-1">
          <StarRating rating={doctor.rating} count={doctor.review_count} />
        </div>
      </div>
    </div>

    {/* Details */}
    <div className="space-y-2 mb-4 flex-1">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="truncate">{doctor.clinic_name}{doctor.clinic_city ? `, ${doctor.clinic_city}` : ''}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <DollarSign className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="font-semibold text-gray-800">${doctor.consultation_fee}</span>
        <span className="text-gray-400">consultation</span>
      </div>
      {doctor.nearest_available && (
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-[#8BC34A] flex-shrink-0" />
          <span className="text-[#8BC34A] font-medium">
            Next available: {formatTime12(doctor.nearest_available)}
          </span>
        </div>
      )}
      {!doctor.nearest_available && (
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-gray-300 flex-shrink-0" />
          <span className="text-gray-400">No slots on selected date</span>
        </div>
      )}
    </div>

    {/* Action */}
    <button
      onClick={() => onBook(doctor)}
      className={cn(
        'w-full rounded-xl py-3 text-sm font-semibold transition-colors',
        'bg-[#45BFD3] text-white hover:bg-[#3aacbf] shadow-sm shadow-[#45BFD3]/20',
      )}
    >
      Book Appointment
    </button>
  </motion.div>
);

/** Booking modal */
const BookingModal: React.FC<{
  doctor: Doctor;
  initialDate: string;
  patientId: number;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ doctor, initialDate, patientId, onClose, onSuccess }) => {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState('');
  const [reason, setReason] = useState('');
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const fetchSlots = useCallback(async () => {
    setLoadingSlots(true);
    setSelectedTime('');
    setError('');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/doctors/${doctor.id}/available-slots?date=${selectedDate}`,
      );
      if (!res.ok) throw new Error('Failed to load available slots');
      const data = await res.json();
      const rawSlots: string[] = data.slots || data;
      setSlots(rawSlots.map((s: string) => ({ time: s, available: true })));
    } catch {
      setSlots([]);
      setError('Could not load time slots. Please try again.');
    } finally {
      setLoadingSlots(false);
    }
  }, [doctor.id, selectedDate]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const availableSlots = slots.filter((s) => s.available);

  const handleBook = async () => {
    if (!selectedTime || !selectedDate) return;
    setBooking(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/patient/book-appointment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          doctor_id: doctor.id,
          appointment_date: selectedDate,
          appointment_time: selectedTime,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { detail?: string } | null)?.detail ?? 'Booking failed. Please try again.',
        );
      }
      setConfirmed(true);
      setTimeout(() => {
        onSuccess();
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setBooking(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {confirmed ? (
          /* Confirmation view */
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15, delay: 0.1 }}
              className="mx-auto h-16 w-16 rounded-full bg-[#8BC34A]/15 flex items-center justify-center mb-4"
            >
              <Check className="h-8 w-8 text-[#8BC34A]" />
            </motion.div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Appointment Confirmed!</h3>
            <p className="text-sm text-gray-500 mb-6">Your appointment has been successfully booked.</p>

            <div className="bg-gray-50 rounded-xl p-5 text-left space-y-3 mb-6">
              <div className="flex items-center gap-3">
                <Stethoscope className="h-4 w-4 text-[#45BFD3]" />
                <span className="text-sm font-medium text-gray-800">
                  {doctorFullName(doctor)}{doctor.title ? `, ${doctor.title}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-[#45BFD3]" />
                <span className="text-sm text-gray-600">{formatReadableDate(selectedDate)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-[#45BFD3]" />
                <span className="text-sm text-gray-600">{formatTime12(selectedTime)}</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-[#45BFD3]" />
                <span className="text-sm text-gray-600">{doctor.clinic_name}{doctor.clinic_city ? `, ${doctor.clinic_city}` : ''}</span>
              </div>
              {reason.trim() && (
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-[#45BFD3] mt-0.5" />
                  <span className="text-sm text-gray-600">{reason.trim()}</span>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="rounded-xl px-8 py-3 text-sm font-semibold text-white bg-[#45BFD3] hover:bg-[#3aacbf] transition-colors"
            >
              Done
            </button>
          </motion.div>
        ) : (
          /* Booking form */
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Book Appointment</h3>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Doctor info */}
            <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'h-12 w-12 rounded-full flex items-center justify-center text-white font-bold',
                    getAvatarColor(doctorFullName(doctor)),
                  )}
                >
                  {getInitials(doctorFullName(doctor))}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {doctorFullName(doctor)}{doctor.title ? `, ${doctor.title}` : ''}
                  </p>
                  <p className="text-xs text-gray-500">{doctor.specialty}</p>
                  <p className="text-xs text-gray-400">{doctor.clinic_name}{doctor.clinic_city ? `, ${doctor.clinic_city}` : ''}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-lg font-bold text-gray-900">${doctor.consultation_fee}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">consultation</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Date picker */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Calendar className="inline h-4 w-4 mr-1 -mt-0.5" />
                  Select Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={formatDate(new Date())}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20 transition"
                />
              </div>

              {/* Time slots */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Clock className="inline h-4 w-4 mr-1 -mt-0.5" />
                  Available Times
                </label>
                {loadingSlots ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="h-6 w-6" />
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl">
                    <Clock className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    No available slots on this date
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot.time}
                        onClick={() => setSelectedTime(slot.time)}
                        className={cn(
                          'rounded-xl px-3 py-2.5 text-sm font-medium transition-all border',
                          selectedTime === slot.time
                            ? 'bg-[#45BFD3] text-white border-[#45BFD3] shadow-sm shadow-[#45BFD3]/25'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-[#45BFD3]/50 hover:bg-[#45BFD3]/5',
                        )}
                      >
                        {formatTime12(slot.time)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Reason for Visit
                  <span className="text-gray-400 font-normal ml-1">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Describe the reason for your visit..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 outline-none focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20 transition resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBook}
                disabled={!selectedTime || booking}
                className={cn(
                  'flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors',
                  !selectedTime || booking
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-[#45BFD3] hover:bg-[#3aacbf] shadow-sm',
                )}
              >
                {booking ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const AppointmentBooking: React.FC<AppointmentBookingProps> = ({ patientId }) => {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSpecialty, setSearchSpecialty] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLFormElement>(null);

  // Date state
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(() => formatDate(new Date()));

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({ ...DEFAULT_FILTERS });

  // Doctors state
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Booking modal state
  const [bookingDoctor, setBookingDoctor] = useState<Doctor | null>(null);

  // Specialties cache
  const [specialties, setSpecialties] = useState<string[]>([]);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Fetch specialties on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const fetchSpecialties = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/doctors/specialties`);
        if (res.ok) {
          const data = await res.json();
          setSpecialties(data.specialties || data);
        }
      } catch {
        // Specialties are non-critical; silently handle
      }
    };
    fetchSpecialties();
  }, []);

  // -------------------------------------------------------------------------
  // Close suggestions on click outside
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // -------------------------------------------------------------------------
  // Build search suggestions as user types
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const q = searchQuery.toLowerCase();
      const results: SearchSuggestion[] = [];

      // Match specialties
      specialties
        .filter((s) => s.toLowerCase().includes(q))
        .slice(0, 3)
        .forEach((s) => {
          results.push({ type: 'specialty', label: s, subtitle: 'Specialty' });
        });

      // Match from loaded doctors
      doctors
        .filter(
          (d) =>
            `${d.first_name} ${d.last_name}`.toLowerCase().includes(q) ||
            (d.specialty || '').toLowerCase().includes(q),
        )
        .slice(0, 5)
        .forEach((d) => {
          results.push({
            type: 'doctor',
            id: d.id,
            label: doctorFullName(d),
            subtitle: d.specialty,
          });
        });

      setSuggestions(results);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, specialties, doctors]);

  // -------------------------------------------------------------------------
  // Fetch doctors
  // -------------------------------------------------------------------------
  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (searchSpecialty) params.set('specialty', searchSpecialty);
    if (appliedFilters.minRating > 0) params.set('min_rating', String(appliedFilters.minRating));
    if (appliedFilters.maxFee < 500) params.set('max_fee', String(appliedFilters.maxFee));
    if (appliedFilters.insurance) params.set('insurance', appliedFilters.insurance);
    if (appliedFilters.location) params.set('location', appliedFilters.location);
    if (appliedFilters.timeOfDay.length > 0) params.set('time_of_day', appliedFilters.timeOfDay.join(','));
    params.set('date', selectedDate);

    try {
      const res = await fetch(`${API_BASE_URL}/api/doctors/search?${params.toString()}`);
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = await res.json();
      setDoctors(data.doctors || data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to search doctors');
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, searchSpecialty, selectedDate, appliedFilters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDoctors();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchDoctors]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSuggestionSelect = (s: SearchSuggestion) => {
    if (s.type === 'specialty') {
      setSearchSpecialty(s.label);
      setSearchQuery(s.label);
    } else {
      setSearchQuery(s.label);
      setSearchSpecialty('');
    }
    setShowSuggestions(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    fetchDoctors();
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchSpecialty('');
  };

  const handlePrevWeek = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    // Do not navigate before today
    if (prev >= today) {
      setWeekStart(prev);
    } else {
      setWeekStart(today);
    }
  };

  const handleNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
  };

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
    setShowFilters(false);
  };

  const handleClearFilters = () => {
    const cleared = { ...DEFAULT_FILTERS };
    setFilters(cleared);
    setAppliedFilters(cleared);
  };

  const handleBookingSuccess = () => {
    setBookingDoctor(null);
    fetchDoctors();
  };

  // Count of active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (appliedFilters.location) count++;
    if (appliedFilters.minRating > 0) count++;
    if (appliedFilters.maxFee < 500) count++;
    if (appliedFilters.insurance) count++;
    if (appliedFilters.timeOfDay.length > 0) count++;
    return count;
  }, [appliedFilters]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-[#45BFD3]/15 p-2.5">
          <Calendar className="h-5 w-5 text-[#45BFD3]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Book an Appointment</h2>
          <p className="text-sm text-gray-400">Find a doctor and schedule your visit</p>
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="relative" ref={searchRef}>
        <div className="relative flex items-center">
          <Search className="absolute left-4 h-5 w-5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchSpecialty('');
              setShowSuggestions(true);
            }}
            onFocus={() => searchQuery.trim() && setShowSuggestions(true)}
            placeholder="Search by doctor name or specialty..."
            className="w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-24 py-4 text-sm text-gray-700 placeholder:text-gray-300 outline-none focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20 transition shadow-sm"
          />
          <div className="absolute right-2 flex items-center gap-1.5">
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setFilters({ ...appliedFilters });
                setShowFilters(true);
              }}
              className={cn(
                'relative p-2.5 rounded-xl transition-colors',
                activeFilterCount > 0
                  ? 'bg-[#45BFD3]/10 text-[#45BFD3]'
                  : 'hover:bg-gray-100 text-gray-400',
              )}
            >
              <Filter className="h-5 w-5" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#45BFD3] text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <SearchDropdown
          suggestions={suggestions}
          onSelect={handleSuggestionSelect}
          visible={showSuggestions}
        />
      </form>

      {/* Active filter tags */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {appliedFilters.location && (
            <FilterTag
              label={`Location: ${appliedFilters.location}`}
              onRemove={() => {
                const next = { ...appliedFilters, location: '' };
                setAppliedFilters(next);
                setFilters(next);
              }}
            />
          )}
          {appliedFilters.minRating > 0 && (
            <FilterTag
              label={`Rating: ${appliedFilters.minRating}+`}
              onRemove={() => {
                const next = { ...appliedFilters, minRating: 0 };
                setAppliedFilters(next);
                setFilters(next);
              }}
            />
          )}
          {appliedFilters.maxFee < 500 && (
            <FilterTag
              label={`Max fee: $${appliedFilters.maxFee}`}
              onRemove={() => {
                const next = { ...appliedFilters, maxFee: 500 };
                setAppliedFilters(next);
                setFilters(next);
              }}
            />
          )}
          {appliedFilters.insurance && (
            <FilterTag
              label={`Insurance: ${appliedFilters.insurance}`}
              onRemove={() => {
                const next = { ...appliedFilters, insurance: '' };
                setAppliedFilters(next);
                setFilters(next);
              }}
            />
          )}
          {appliedFilters.timeOfDay.length > 0 && (
            <FilterTag
              label={`Time: ${appliedFilters.timeOfDay.join(', ')}`}
              onRemove={() => {
                const next = { ...appliedFilters, timeOfDay: [] };
                setAppliedFilters(next);
                setFilters(next);
              }}
            />
          )}
          <button
            onClick={handleClearFilters}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Date navigation */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 text-center">
          {formatMonthYear(weekStart)}
        </p>
        <DateNavigator
          weekStart={weekStart}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          onPrev={handlePrevWeek}
          onNext={handleNextWeek}
        />
      </div>

      {/* Results area */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Spinner />
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-red-50 p-8 text-center text-red-600">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-70" />
          <p className="font-semibold text-lg mb-1">Something went wrong</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={fetchDoctors}
            className="mt-4 rounded-xl bg-red-600 px-5 py-2.5 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : doctors.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-500">No doctors found</p>
          <p className="text-sm mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-700">{doctors.length}</span>{' '}
            {doctors.length === 1 ? 'doctor' : 'doctors'} available
            {searchSpecialty && (
              <span>
                {' '}in <span className="font-medium text-[#45BFD3]">{searchSpecialty}</span>
              </span>
            )}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {doctors.map((doc) => (
              <DoctorCard
                key={doc.id}
                doctor={doc}
                onBook={setBookingDoctor}
              />
            ))}
          </div>
        </>
      )}

      {/* Filter modal */}
      <AnimatePresence>
        {showFilters && (
          <FilterModal
            filters={filters}
            onChange={setFilters}
            onApply={handleApplyFilters}
            onClear={() => {
              handleClearFilters();
              setShowFilters(false);
            }}
            onClose={() => setShowFilters(false)}
          />
        )}
      </AnimatePresence>

      {/* Booking modal */}
      <AnimatePresence>
        {bookingDoctor && (
          <BookingModal
            doctor={bookingDoctor}
            initialDate={selectedDate}
            patientId={patientId}
            onClose={() => setBookingDoctor(null)}
            onSuccess={handleBookingSuccess}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

const FilterTag: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#45BFD3]/10 px-3 py-1.5 text-xs font-medium text-[#45BFD3]">
    {label}
    <button onClick={onRemove} className="hover:text-[#3aacbf] transition-colors">
      <X className="h-3 w-3" />
    </button>
  </span>
);

export default AppointmentBooking;
