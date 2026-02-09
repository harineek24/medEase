import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import {
  Loader2,
  MessageSquare,
  Clock,
  Mic,
  Play,
  Pause,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { API_BASE_URL } from "@/api";
import { useAuth } from "@/contexts/AuthContext";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PatientUpdate {
  id: number;
  patient_id: number;
  patient_name: string;
  update_text: string;
  audio_url: string | null;
  audio_duration: number | null;
  summary: string | null;
  questions: string | null;
  created_at: string;
}

interface ConsultField {
  field_name: string;
  field_label: string;
  field_value: string;
  confirmed: number;
}

interface Consultation {
  id: number;
  session_id: string;
  patient_id: number;
  patient_name: string;
  status: string;
  is_emergency: number;
  created_at: string;
  completed_at: string;
  fields: ConsultField[];
}

/* ------------------------------------------------------------------ */
/*  Waveform animation variants (generated once)                       */
/* ------------------------------------------------------------------ */

const generateWaveVariants = (): Variants[] => {
  const variants: Variants[] = [];
  for (let i = 0; i < 24; i++) {
    variants.push({
      initial: { scaleY: 1 },
      animate: {
        scaleY: [1, Math.random() * 1.5 + 1, 1],
        transition: {
          duration: Math.random() * 0.5 + 0.4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: Math.random() * 0.3,
        },
      },
    });
  }
  return variants;
};

const waveVariants = generateWaveVariants();
const barHeights = Array.from({ length: 24 }, () => Math.random() * 18 + 6);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Highlight priority fields in consultation cards
const PRIORITY_FIELDS = [
  "chief_complaint",
  "symptoms",
  "symptom_description",
  "pain_level",
  "allergies",
  "current_medications",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DoctorFeed() {
  const { doctorId } = useAuth();
  const navigate = useNavigate();

  const [updates, setUpdates] = useState<PatientUpdate[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());

  const fetchData = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    setError(null);
    try {
      const [updatesRes, consultsRes] = await Promise.all([
        fetch(
          `${API_BASE_URL}/api/doctor/${doctorId}/feed/patient-updates`
        ),
        fetch(
          `${API_BASE_URL}/api/doctor/${doctorId}/consultations/today`
        ),
      ]);

      if (updatesRes.ok) {
        const data = await updatesRes.json();
        setUpdates(data.updates || []);
      }
      if (consultsRes.ok) {
        const data = await consultsRes.json();
        setConsultations(data.consultations || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cleanup audio on unmount
  useEffect(() => {
    const refs = audioRefs.current;
    return () => {
      refs.forEach((audio) => audio.pause());
    };
  }, []);

  const handlePlay = (updateId: number, audioUrl: string) => {
    if (playingId !== null && playingId !== updateId) {
      const current = audioRefs.current.get(playingId);
      if (current) {
        current.pause();
        current.currentTime = 0;
      }
    }
    let audio = audioRefs.current.get(updateId);
    if (!audio) {
      audio = new Audio(`${API_BASE_URL}${audioUrl}`);
      audio.addEventListener("ended", () => setPlayingId(null));
      audioRefs.current.set(updateId, audio);
    }
    audio.play().catch(console.error);
    setPlayingId(updateId);
  };

  const handlePause = (updateId: number) => {
    const audio = audioRefs.current.get(updateId);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlayingId(null);
  };

  const handleCardClick = (update: PatientUpdate) => {
    if (playingId !== null) handlePause(playingId);
    navigate(`/doctor/reply/${update.id}`);
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#45BFD3]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-red-500 mb-2">{error}</p>
          <button
            onClick={fetchData}
            className="text-sm text-[#45BFD3] hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">
          Patient Feed
        </h1>
        <p className="text-gray-500 text-sm">
          Today's consultations and recent patient updates
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column: Today's Consultation Summaries ─────────── */}
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-4 h-4 text-[#8BC34A]" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Today's Consultations
            </h2>
          </div>

          {consultations.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-400">
                No consultations completed today
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {consultations.map((consult) => {
                const priorityFields = consult.fields.filter((f) =>
                  PRIORITY_FIELDS.includes(f.field_name)
                );
                const otherFields = consult.fields.filter(
                  (f) => !PRIORITY_FIELDS.includes(f.field_name)
                );

                return (
                  <motion.div
                    key={consult.id}
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    {/* Header */}
                    <div
                      className={`px-5 py-3 flex items-center gap-3 ${
                        consult.is_emergency
                          ? "bg-red-50 border-b border-red-100"
                          : "bg-[#8BC34A]/5 border-b border-[#8BC34A]/10"
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-white text-xs font-semibold shrink-0 ${
                          consult.is_emergency
                            ? "bg-red-500"
                            : "bg-gradient-to-tr from-[#8BC34A] to-[#45BFD3]"
                        }`}
                      >
                        {initials(consult.patient_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {consult.patient_name}
                        </p>
                        <p className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {consult.completed_at
                            ? formatTime(consult.completed_at)
                            : timeAgo(consult.created_at)}
                        </p>
                      </div>
                      {consult.is_emergency ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold">
                          <AlertTriangle className="w-3 h-3" />
                          Emergency
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          Completed
                        </span>
                      )}
                    </div>

                    {/* Fields */}
                    <div className="px-5 py-4 space-y-2">
                      {/* Priority fields first */}
                      {priorityFields.map((f, i) => (
                        <div key={i}>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                            {f.field_label}
                          </p>
                          <p className="text-sm text-gray-800">{f.field_value}</p>
                        </div>
                      ))}
                      {/* Other fields compact */}
                      {otherFields.length > 0 && (
                        <div className="border-t border-gray-100 pt-2 mt-2 space-y-1.5">
                          {otherFields.map((f, i) => (
                            <div
                              key={i}
                              className="flex items-baseline gap-2 text-xs"
                            >
                              <span className="text-gray-400 shrink-0">
                                {f.field_label}:
                              </span>
                              <span className="text-gray-700">{f.field_value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right columns: Patient Update Story Cards ──────────── */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-[#45BFD3]" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Patient Updates
            </h2>
          </div>

          {updates.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-400">
                No patient updates in the last 7 days
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-5">
              {updates.map((update) => {
                const isPlaying = playingId === update.id;

                return (
                  <motion.div
                    key={update.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border border-gray-200 w-80 rounded-2xl p-5 cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => handleCardClick(update)}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-[#45BFD3] to-[#8BC34A] text-white text-sm font-semibold shrink-0">
                        {initials(update.patient_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {update.patient_name}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="w-3 h-3" />
                          {timeAgo(update.created_at)}
                        </div>
                      </div>
                    </div>

                    {/* Update text */}
                    <p className="text-sm text-gray-700 leading-relaxed line-clamp-3 mb-3">
                      {update.update_text}
                    </p>

                    {/* Summary bullets */}
                    {update.summary &&
                      (() => {
                        const bullets = update
                          .summary!.split("\n")
                          .filter((l) => l.trim().startsWith("-"))
                          .map((l) => l.trim().slice(1).trim())
                          .slice(0, 2);
                        return bullets.length > 0 ? (
                          <div className="rounded-lg bg-[#45BFD3]/5 border border-[#45BFD3]/15 p-3 mb-3">
                            {bullets.map((b, i) => (
                              <p
                                key={i}
                                className="text-xs text-gray-600 flex gap-1.5"
                              >
                                <span className="text-[#45BFD3] shrink-0">
                                  •
                                </span>
                                <span className="line-clamp-1">{b}</span>
                              </p>
                            ))}
                          </div>
                        ) : null;
                      })()}

                    {/* Audio waveform */}
                    {update.audio_url && (
                      <div
                        className="bg-gray-100 w-full h-12 rounded-lg flex items-center gap-2 px-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            isPlaying
                              ? handlePause(update.id)
                              : handlePlay(update.id, update.audio_url!);
                          }}
                          className="shrink-0"
                        >
                          {isPlaying ? (
                            <Pause className="w-8 h-8 text-gray-700" />
                          ) : (
                            <Play className="w-8 h-8 text-gray-700" />
                          )}
                        </button>
                        <div className="flex items-center gap-[2px] flex-1 h-8">
                          {waveVariants.map((variant, i) => (
                            <motion.div
                              key={i}
                              className="bg-gray-500 rounded-full"
                              style={{
                                width: 3,
                                height: `${barHeights[i]}px`,
                                margin: "0 1px",
                              }}
                              variants={variant}
                              initial="initial"
                              animate={isPlaying ? "animate" : "initial"}
                            />
                          ))}
                        </div>
                        {update.audio_duration != null && (
                          <span className="text-[10px] text-gray-400 shrink-0 flex items-center gap-1">
                            <Mic className="w-3 h-3" />
                            {formatDuration(update.audio_duration)}
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
