import React, { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react';
import { BookOpen, ChevronDown, ChevronUp, X, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mood = 'great' | 'good' | 'okay' | 'not_great' | 'bad';

interface JournalEntry {
  id: number;
  date: string;
  mood: Mood;
  pain_level: number;
  symptoms: string[];
  content: string;
  created_at: string;
}

interface PatientJournalProps {
  patientId: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOODS: { key: Mood; emoji: string; label: string }[] = [
  { key: 'great', emoji: '\uD83D\uDE04', label: 'Great' },
  { key: 'good', emoji: '\uD83D\uDE0A', label: 'Good' },
  { key: 'okay', emoji: '\uD83D\uDE10', label: 'Okay' },
  { key: 'not_great', emoji: '\uD83D\uDE1F', label: 'Not great' },
  { key: 'bad', emoji: '\uD83D\uDE23', label: 'Bad' },
];

function moodEmoji(mood: Mood): string {
  return MOODS.find((m) => m.key === mood)?.emoji ?? '';
}

function painColor(level: number): string {
  if (level <= 3) return 'bg-[#8BC34A]';
  if (level <= 6) return 'bg-amber-400';
  return 'bg-red-500';
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Mood selector row */
const MoodSelector: React.FC<{ value: Mood | null; onChange: (m: Mood) => void }> = ({
  value,
  onChange,
}) => (
  <div className="flex gap-2 flex-wrap">
    {MOODS.map((m) => (
      <button
        key={m.key}
        type="button"
        onClick={() => onChange(m.key)}
        className={cn(
          'flex flex-col items-center gap-1 rounded-xl px-4 py-3 transition-all text-sm border-2',
          value === m.key
            ? 'border-[#45BFD3] bg-[#45BFD3]/10 shadow-sm'
            : 'border-transparent bg-gray-50 hover:bg-gray-100',
        )}
      >
        <span className="text-2xl">{m.emoji}</span>
        <span className={cn('text-xs font-medium', value === m.key ? 'text-[#45BFD3]' : 'text-gray-500')}>
          {m.label}
        </span>
      </button>
    ))}
  </div>
);

/** Pain level slider */
const PainSlider: React.FC<{ value: number; onChange: (n: number) => void }> = ({
  value,
  onChange,
}) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-gray-500 font-medium">Pain Level</span>
      <span
        className={cn(
          'inline-flex items-center justify-center h-7 w-7 rounded-full text-white text-xs font-bold',
          painColor(value),
        )}
      >
        {value}
      </span>
    </div>
    <input
      type="range"
      min={0}
      max={10}
      step={1}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-[#45BFD3]"
    />
    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
      <span>No pain</span>
      <span>Worst pain</span>
    </div>
  </div>
);

/** Symptom tag input */
const SymptomTags: React.FC<{ tags: string[]; onChange: (t: string[]) => void }> = ({
  tags,
  onChange,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = (e.target as HTMLInputElement).value.trim();
      if (val && !tags.includes(val)) {
        onChange([...tags, val]);
      }
      (e.target as HTMLInputElement).value = '';
    }
  };

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div>
      <p className="text-sm text-gray-500 font-medium mb-2">Symptoms</p>
      <div
        className="flex flex-wrap gap-2 rounded-xl border border-gray-200 p-3 cursor-text min-h-[48px] bg-white"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-[#45BFD3]/10 text-[#45BFD3] text-xs font-medium px-3 py-1"
          >
            {tag}
            <button type="button" onClick={() => remove(tag)} className="hover:text-[#3aacbf]">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          placeholder={tags.length === 0 ? 'Type a symptom and press Enter' : ''}
          onKeyDown={handleKey}
          className="flex-1 min-w-[120px] outline-none text-sm bg-transparent placeholder:text-gray-300"
        />
      </div>
    </div>
  );
};

/** Past entry card */
const PastEntryCard: React.FC<{ entry: JournalEntry }> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(entry.date);
  const dayLabel = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xl">{moodEmoji(entry.mood)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{dayLabel}</p>
          <p className="text-xs text-gray-400 truncate">{entry.content || 'No note'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center justify-center h-6 w-6 rounded-full text-white text-[10px] font-bold',
              painColor(entry.pain_level),
            )}
          >
            {entry.pain_level}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-50 pt-3">
              {entry.symptoms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {entry.symptoms.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-gray-100 text-gray-600 text-xs px-2.5 py-0.5"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-sm text-gray-600 leading-relaxed">{entry.content}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const PatientJournal: React.FC<PatientJournalProps> = ({ patientId }) => {
  // Entries state
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [mood, setMood] = useState<Mood | null>(null);
  const [painLevel, setPainLevel] = useState(0);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Editing
  const [editing, setEditing] = useState(false);

  const todayEntry = entries.find((e) => e.date === todayISO());

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/portal/patient/${patientId}/journal`);
      if (!res.ok) throw new Error(`Failed to fetch journal (${res.status})`);
      const data: JournalEntry[] = await res.json();
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEntries(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Populate form when editing today's entry
  useEffect(() => {
    if (editing && todayEntry) {
      setMood(todayEntry.mood);
      setPainLevel(todayEntry.pain_level);
      setSymptoms(todayEntry.symptoms);
      setContent(todayEntry.content);
    }
  }, [editing, todayEntry]);

  const resetForm = () => {
    setMood(null);
    setPainLevel(0);
    setSymptoms([]);
    setContent('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mood) return;

    setSubmitting(true);
    setSubmitSuccess(false);
    try {
      const res = await fetch(`${API_BASE_URL}/api/portal/patient/${patientId}/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood,
          pain_level: painLevel,
          symptoms,
          content,
        }),
      });
      if (!res.ok) throw new Error(`Failed to save journal entry (${res.status})`);
      setSubmitSuccess(true);
      setEditing(false);
      resetForm();
      fetchEntries();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  // Past entries = last 7 days excluding today
  const pastEntries = entries.filter((e) => e.date !== todayISO()).slice(0, 7);

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

  if (error && entries.length === 0) {
    return (
      <div className="rounded-2xl bg-red-50 p-8 text-center text-red-600">
        <p className="font-semibold text-lg mb-1">Unable to load journal</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchEntries}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-white text-sm hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const showForm = !todayEntry || editing;

  return (
    <div className="space-y-8">
      {/* ----------------------------------------------------------------- */}
      {/* Today's Entry                                                      */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded-full bg-[#45BFD3]/15 p-2.5">
            <BookOpen className="h-5 w-5 text-[#45BFD3]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Today's Entry</h2>
            <p className="text-xs text-gray-400">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        {/* Success toast */}
        <AnimatePresence>
          {submitSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 rounded-xl bg-[#8BC34A]/10 border border-[#8BC34A]/30 px-4 py-3 text-[#6a9a2e] text-sm font-medium"
            >
              Journal entry saved successfully!
            </motion.div>
          )}
        </AnimatePresence>

        {/* Existing entry display */}
        {todayEntry && !editing && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{moodEmoji(todayEntry.mood)}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800 capitalize">
                  {todayEntry.mood.replace('_', ' ')}
                </p>
                <p className="text-xs text-gray-400">Pain level: {todayEntry.pain_level}/10</p>
              </div>
            </div>
            {todayEntry.symptoms.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {todayEntry.symptoms.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-gray-100 text-gray-600 text-xs px-2.5 py-0.5"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
            <p className="text-sm text-gray-600 leading-relaxed">{todayEntry.content}</p>
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-[#45BFD3] font-medium hover:underline"
            >
              Edit entry
            </button>
          </div>
        )}

        {/* Journal form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Mood */}
            <div>
              <p className="text-sm text-gray-500 font-medium mb-2">How's your mood?</p>
              <MoodSelector value={mood} onChange={setMood} />
            </div>

            {/* Pain level */}
            <PainSlider value={painLevel} onChange={setPainLevel} />

            {/* Symptoms */}
            <SymptomTags tags={symptoms} onChange={setSymptoms} />

            {/* Free text */}
            <div>
              <p className="text-sm text-gray-500 font-medium mb-2">How are you feeling today?</p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 outline-none focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20 transition resize-none"
                placeholder="Write about how you're feeling..."
              />
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={!mood || submitting}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-colors',
                  mood && !submitting
                    ? 'bg-[#45BFD3] hover:bg-[#3aacbf]'
                    : 'bg-gray-300 cursor-not-allowed',
                )}
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Saving...' : 'Save Entry'}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    resetForm();
                  }}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Past Entries                                                       */}
      {/* ----------------------------------------------------------------- */}
      {pastEntries.length > 0 && (
        <section>
          <h3 className="text-lg font-bold text-gray-900 mb-4">Past 7 Days</h3>
          <div className="flex flex-col gap-3">
            {pastEntries.map((entry) => (
              <PastEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default PatientJournal;
