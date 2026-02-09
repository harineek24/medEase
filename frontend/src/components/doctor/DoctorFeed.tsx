import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import { Loader2, MessageSquare, Clock, Mic, Play, Pause } from "lucide-react";
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
// Static heights for waveform bars (generated once)
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DoctorFeed() {
  const { doctorId } = useAuth();
  const navigate = useNavigate();
  const [updates, setUpdates] = useState<PatientUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());

  const fetchUpdates = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/doctor/${doctorId}/feed/patient-updates`
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setUpdates(data.updates || []);
    } catch (err: any) {
      setError(err.message || "Failed to load updates");
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  // Cleanup audio on unmount
  useEffect(() => {
    const refs = audioRefs.current;
    return () => {
      refs.forEach((audio) => audio.pause());
    };
  }, []);

  const handlePlay = (updateId: number, audioUrl: string) => {
    // Stop currently playing
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
            onClick={fetchUpdates}
            className="text-sm text-[#45BFD3] hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">
          Patient Feed
        </h1>
        <p className="text-gray-500 text-sm">
          Recent health updates from your patients — click to respond
        </p>
      </div>

      {updates.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-400 text-sm">
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
                {/* Header: avatar + name + time */}
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

                {/* Summary bullets (max 2) */}
                {update.summary &&
                  (() => {
                    const bullets = update.summary!
                      .split("\n")
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
                            <span className="text-[#45BFD3] shrink-0">•</span>
                            <span className="line-clamp-1">{b}</span>
                          </p>
                        ))}
                      </div>
                    ) : null;
                  })()}

                {/* Audio waveform bar */}
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
  );
}
