import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, SmilePlus, Frown, Meh, Smile, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TodayEntry {
  entry_text: string;
  mood: string;
  symptoms: string[];
  recorded_at: string;
}

export interface StoryPatient {
  patient_id: number;
  patient_name: string;
  latest_entry: string | null;
  latest_mood: string | null;
  today_entries: TodayEntry[];
}

interface StoryModalProps {
  patient: StoryPatient;
  onClose: () => void;
}

const AUTO_CLOSE_MS = 10_000;

const moodIcon = (mood: string | null) => {
  if (!mood) return <Meh className="h-5 w-5 text-gray-400" />;
  const lower = mood.toLowerCase();
  if (lower.includes("happy") || lower.includes("good") || lower.includes("great"))
    return <Smile className="h-5 w-5 text-green-500" />;
  if (lower.includes("sad") || lower.includes("bad") || lower.includes("down"))
    return <Frown className="h-5 w-5 text-red-400" />;
  if (lower.includes("anxious") || lower.includes("stress"))
    return <AlertCircle className="h-5 w-5 text-yellow-500" />;
  return <SmilePlus className="h-5 w-5 text-[#45BFD3]" />;
};

const moodColor = (mood: string | null): string => {
  if (!mood) return "bg-gray-200 text-gray-600";
  const lower = mood.toLowerCase();
  if (lower.includes("happy") || lower.includes("good") || lower.includes("great"))
    return "bg-green-100 text-green-700";
  if (lower.includes("sad") || lower.includes("bad") || lower.includes("down"))
    return "bg-red-100 text-red-700";
  if (lower.includes("anxious") || lower.includes("stress"))
    return "bg-yellow-100 text-yellow-700";
  return "bg-cyan-100 text-cyan-700";
};

export default function StoryModal({ patient, onClose }: StoryModalProps) {
  const [progress, setProgress] = useState(0);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Auto-close timer
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / AUTO_CLOSE_MS) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        handleClose();
      }
    }, 50);
    return () => clearInterval(interval);
  }, [handleClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  const entries = patient.today_entries ?? [];
  const hasEntries = entries.length > 0;

  return (
    <AnimatePresence>
      <motion.div
        key="story-overlay"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={handleClose}
      >
        <motion.div
          key="story-card"
          className="relative w-full max-w-md mx-4 max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
          initial={{ scale: 0.85, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 40 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div className="h-1 w-full bg-gray-200">
            <motion.div
              className="h-full bg-[#45BFD3]"
              style={{ width: `${progress}%` }}
              transition={{ duration: 0.05 }}
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#45BFD3]/15 font-semibold text-[#45BFD3] text-sm">
                {patient.patient_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {patient.patient_name}
                </h3>
                <p className="text-xs text-gray-500">Today&apos;s Updates</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
              aria-label="Close story"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {!hasEntries ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Meh className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No updates today</p>
                <p className="text-xs text-gray-400 mt-1">
                  This patient hasn&apos;t submitted any journal entries today.
                </p>
              </div>
            ) : (
              entries.map((entry, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="rounded-xl bg-gray-50 p-4 space-y-3"
                >
                  {/* Mood badge */}
                  {entry.mood && (
                    <div className="flex items-center gap-2">
                      {moodIcon(entry.mood)}
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                          moodColor(entry.mood)
                        )}
                      >
                        {entry.mood}
                      </span>
                    </div>
                  )}

                  {/* Journal text */}
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {entry.entry_text}
                  </p>

                  {/* Symptoms */}
                  {entry.symptoms && entry.symptoms.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Symptoms
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.symptoms.map((symptom, sIdx) => (
                          <span
                            key={sIdx}
                            className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600"
                          >
                            {symptom}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Time */}
                  {entry.recorded_at && (
                    <p className="text-xs text-gray-400">
                      {new Date(entry.recorded_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </motion.div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="px-5 py-3 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              Tap outside or press Esc to close
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
