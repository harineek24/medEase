import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DoctorNote {
  id: number;
  doctor_name: string;
  doctor_title: string;
  doctor_specialty: string;
  note_type: 'text' | 'voice' | 'both';
  content: string;
  audio_url?: string;
  created_at: string;
  is_read: boolean;
}

interface UpdatesPortalProps {
  patientId: number;
  mode?: 'light' | 'dark';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-[#45BFD3]',
  'bg-[#8BC34A]',
  'bg-indigo-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ---------------------------------------------------------------------------
// Waveform Audio Player
// ---------------------------------------------------------------------------

const BAR_COUNT = 30;

const WaveformPlayer: React.FC<{ audioUrl: string; dark: boolean }> = ({ audioUrl, dark }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [barHeights] = useState(() =>
    Array.from({ length: BAR_COUNT }, () => 0.2 + Math.random() * 0.8),
  );

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play();
    }
    setPlaying(!playing);
  }, [playing]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnd = () => setPlaying(false);
    el.addEventListener('ended', onEnd);
    return () => el.removeEventListener('ended', onEnd);
  }, []);

  return (
    <div className={cn('flex items-center gap-3 mt-3 rounded-xl px-4 py-3', dark ? 'bg-gray-800' : 'bg-gray-50')}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Play / Pause button */}
      <button
        onClick={toggle}
        className={cn(
          'flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full transition-colors',
          'bg-[#45BFD3] hover:bg-[#3aacbf] text-white',
        )}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      {/* Waveform bars */}
      <div className="flex items-end gap-[2px] h-8 flex-1">
        {barHeights.map((h, i) => (
          <motion.div
            key={i}
            className={cn('flex-1 rounded-sm', playing ? 'bg-[#45BFD3]' : dark ? 'bg-gray-600' : 'bg-gray-300')}
            animate={
              playing
                ? {
                    height: [`${h * 100}%`, `${(0.2 + Math.random() * 0.8) * 100}%`, `${h * 100}%`],
                  }
                : { height: `${h * 100}%` }
            }
            transition={
              playing
                ? {
                    duration: 0.4 + Math.random() * 0.4,
                    repeat: Infinity,
                    repeatType: 'reverse',
                    ease: 'easeInOut',
                  }
                : { duration: 0.3 }
            }
            style={{ minHeight: 3 }}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Note Card
// ---------------------------------------------------------------------------

const NoteCard: React.FC<{ note: DoctorNote; dark: boolean }> = ({ note, dark }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className={cn(
      'rounded-2xl border p-5 transition-shadow hover:shadow-md',
      dark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-100',
    )}
  >
    {/* Doctor info */}
    <div className="flex items-start gap-3 mb-3">
      <div
        className={cn(
          'flex-shrink-0 flex items-center justify-center h-11 w-11 rounded-full text-white font-semibold text-sm',
          avatarColor(note.doctor_name),
        )}
      >
        {getInitials(note.doctor_name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('font-semibold text-sm leading-tight', dark ? 'text-white' : 'text-gray-900')}>
          {note.doctor_name}, {note.doctor_title}
        </p>
        <p className={cn('text-xs', dark ? 'text-gray-400' : 'text-gray-500')}>{note.doctor_specialty}</p>
      </div>
      <span className={cn('text-xs whitespace-nowrap', dark ? 'text-gray-500' : 'text-gray-400')}>
        {relativeTime(note.created_at)}
      </span>
    </div>

    {/* Note content */}
    <p className={cn('text-sm leading-relaxed', dark ? 'text-gray-300' : 'text-gray-700')}>
      {note.content}
    </p>

    {/* Audio player */}
    {(note.note_type === 'voice' || note.note_type === 'both') && note.audio_url && (
      <WaveformPlayer audioUrl={note.audio_url} dark={dark} />
    )}
  </motion.div>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const NOTES_PER_PAGE = 6;

const UpdatesPortal: React.FC<UpdatesPortalProps> = ({ patientId, mode = 'light' }) => {
  const dark = mode === 'dark';
  const [notes, setNotes] = useState<DoctorNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(NOTES_PER_PAGE);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/portal/patient/${patientId}/notes`);
      if (!res.ok) throw new Error(`Failed to fetch notes (${res.status})`);
      const data: DoctorNote[] = await res.json();
      // Sort newest first
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setNotes(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  // Mark notes as read on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/portal/patient/${patientId}/notes/read`, { method: 'POST' }).catch(
      () => {
        // Silent fail for read receipts
      },
    );
  }, [patientId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const unreadCount = notes.filter((n) => !n.is_read).length;

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
      <div className={cn('rounded-2xl p-8 text-center', dark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-600')}>
        <p className="font-semibold text-lg mb-1">Unable to load updates</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchNotes}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-white text-sm hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl p-6', dark ? 'bg-gray-950' : 'bg-gray-50')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-[#45BFD3]/15 p-2.5">
            <MessageCircle className="h-5 w-5 text-[#45BFD3]" />
          </div>
          <div>
            <h2 className={cn('text-xl font-bold', dark ? 'text-white' : 'text-gray-900')}>
              Updates from your Doctor
            </h2>
            {unreadCount > 0 && (
              <p className="text-xs text-[#45BFD3] font-medium mt-0.5">
                {unreadCount} unread update{unreadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className={cn('text-center py-12', dark ? 'text-gray-500' : 'text-gray-400')}>
          <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No updates yet</p>
          <p className="text-sm mt-1">Your doctor's notes will appear here.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <AnimatePresence>
              {notes.slice(0, visible).map((note) => (
                <NoteCard key={note.id} note={note} dark={dark} />
              ))}
            </AnimatePresence>
          </div>

          {visible < notes.length && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => setVisible((v) => v + NOTES_PER_PAGE)}
                className={cn(
                  'rounded-full px-6 py-2.5 text-sm font-medium transition-colors',
                  dark
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100',
                )}
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UpdatesPortal;
