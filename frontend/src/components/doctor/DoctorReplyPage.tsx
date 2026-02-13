import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Mic,
  Square,
  Send,
  Clock,
  Loader2,
  Play,
  Pause,
  MessageSquare,
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

interface Reply {
  id: number;
  doctor_id: number;
  doctor_name: string;
  reply_text: string;
  audio_url: string | null;
  audio_duration: number | null;
  created_at: string;
}

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

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Today at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(s: number) {
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

// Static bar heights for waveform visualizer
const waveBarHeights = Array.from({ length: 24 }, () => Math.random() * 18 + 6);

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DoctorReplyPage() {
  const { updateId } = useParams<{ updateId: string }>();
  const navigate = useNavigate();
  const { doctorId } = useAuth();

  const [update, setUpdate] = useState<PatientUpdate | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Audio playback for patient's audio
  const [playingPatientAudio, setPlayingPatientAudio] = useState(false);
  const patientAudioRef = useRef<HTMLAudioElement | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Fetch                                                           */
  /* ---------------------------------------------------------------- */

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/patient-updates/${updateId}/detail`
      );
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setUpdate(data.update);
      setReplies(data.replies || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [updateId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(
        () => setRecordTime((t) => t + 1),
        1000
      );
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  /* ---------------------------------------------------------------- */
  /*  Voice recording                                                 */
  /* ---------------------------------------------------------------- */

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        await transcribeAudio(audioBlob);
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");
      const res = await fetch(
        `${API_BASE_URL}/api/patient-updates/transcribe`,
        { method: "POST", body: formData }
      );
      if (res.ok) {
        const data = await res.json();
        setInput((prev) => (prev ? `${prev}\n${data.text}` : data.text));
        if (data.audio_url) setAudioUrl(data.audio_url);
      }
    } catch (err) {
      console.error("Transcription error:", err);
    } finally {
      setTranscribing(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Submit reply                                                    */
  /* ---------------------------------------------------------------- */

  const handleSubmit = async () => {
    if (!input.trim() || sending || !update || !doctorId) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/doctor/${doctorId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: update.patient_id,
          update_id: update.id,
          reply_text: input.trim(),
          audio_url: audioUrl,
          audio_duration: recordTime > 0 ? recordTime : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setReplies((prev) => [
          ...prev,
          {
            id: data.id,
            doctor_id: doctorId,
            doctor_name: "You",
            reply_text: input.trim(),
            audio_url: audioUrl,
            audio_duration: recordTime > 0 ? recordTime : null,
            created_at: data.created_at || new Date().toISOString(),
          },
        ]);
        setInput("");
        setAudioUrl(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Patient audio playback                                          */
  /* ---------------------------------------------------------------- */

  const playPatientAudio = () => {
    if (!update?.audio_url) return;
    if (!patientAudioRef.current) {
      patientAudioRef.current = new Audio(
        `${API_BASE_URL}${update.audio_url}`
      );
      patientAudioRef.current.addEventListener("ended", () =>
        setPlayingPatientAudio(false)
      );
    }
    patientAudioRef.current.play();
    setPlayingPatientAudio(true);
  };

  const pausePatientAudio = () => {
    patientAudioRef.current?.pause();
    if (patientAudioRef.current) patientAudioRef.current.currentTime = 0;
    setPlayingPatientAudio(false);
  };

  /* ---------------------------------------------------------------- */
  /*  Visualizer                                                      */
  /* ---------------------------------------------------------------- */

  const VisualizerBars = () => (
    <div className="flex items-center justify-center gap-0.5 h-8 px-2">
      {Array.from({ length: 24 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-0.5 rounded-full bg-red-400"
          animate={{
            height: [4, Math.random() * 24 + 6, 4],
          }}
          transition={{
            duration: 0.4 + Math.random() * 0.4,
            repeat: Infinity,
            delay: i * 0.04,
          }}
        />
      ))}
    </div>
  );

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

  if (!update) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate("/doctor")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Feed
        </button>
        <p className="text-gray-400 text-center py-12">Update not found.</p>
      </div>
    );
  }

  const parseBullets = (text: string) =>
    text
      .split("\n")
      .filter((l) => l.trim().startsWith("-"))
      .map((l) => l.trim().slice(1).trim());

  const summaryBullets = parseBullets(update.summary || "");
  const questionBullets = parseBullets(update.questions || "").filter(
    (q) => q.toLowerCase() !== "none"
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back button */}
      <button
        onClick={() => navigate("/doctor")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Feed
      </button>

      {/* ── Patient's Original Update ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-[#45BFD3] to-[#8BC34A] text-white text-sm font-semibold">
            {initials(update.patient_name)}
          </div>
          <div>
            <p className="font-semibold text-gray-900">
              {update.patient_name}
            </p>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(update.created_at)}
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-3">
          {update.update_text}
        </p>

        {/* Audio player */}
        {update.audio_url && (
          <div className="bg-gray-100 rounded-lg h-12 flex items-center gap-2 px-3 mb-3">
            <button
              onClick={
                playingPatientAudio ? pausePatientAudio : playPatientAudio
              }
            >
              {playingPatientAudio ? (
                <Pause className="w-7 h-7 text-gray-700" />
              ) : (
                <Play className="w-7 h-7 text-gray-700" />
              )}
            </button>
            <div className="flex-1 flex items-center gap-[2px] h-8">
              {waveBarHeights.map((h, i) => (
                <motion.div
                  key={i}
                  className="bg-gray-500 rounded-full"
                  style={{ width: 3, height: `${h}px`, margin: "0 1px" }}
                  animate={
                    playingPatientAudio
                      ? {
                          scaleY: [1, Math.random() * 1.5 + 1, 1],
                          transition: {
                            duration: 0.5,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: i * 0.03,
                          },
                        }
                      : { scaleY: 1 }
                  }
                />
              ))}
            </div>
            {update.audio_duration != null && (
              <span className="text-xs text-gray-400">
                {formatTime(update.audio_duration)}
              </span>
            )}
          </div>
        )}

        {/* Summary */}
        {summaryBullets.length > 0 && (
          <div className="rounded-xl bg-[#45BFD3]/5 border border-[#45BFD3]/20 p-4 mt-2">
            <h4 className="text-xs font-semibold text-[#45BFD3] uppercase tracking-wider mb-2.5">
              Summary
            </h4>
            <ul className="space-y-1.5">
              {summaryBullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-[#45BFD3] shrink-0">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Questions */}
        {questionBullets.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200/50 p-4 mt-3">
            <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2.5">
              Patient Questions
            </h4>
            <ul className="space-y-1.5">
              {questionBullets.map((q, i) => (
                <li key={i} className="flex gap-2 text-sm text-amber-900">
                  <span className="text-amber-500 shrink-0">?</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Previous Replies ──────────────────────────────────────── */}
      {replies.length > 0 && (
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Responses
          </h3>
          {replies.map((reply) => (
            <div
              key={reply.id}
              className="bg-[#45BFD3]/5 rounded-xl border border-[#45BFD3]/15 p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-[#45BFD3] flex items-center justify-center">
                  <MessageSquare className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-900">
                  Dr. {reply.doctor_name}
                </span>
                <span className="text-xs text-gray-400 ml-auto">
                  {formatDate(reply.created_at)}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {reply.reply_text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Reply Input ───────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Your Response
        </h3>
        <div
          className={`rounded-2xl border-2 transition-all duration-300 ${
            isRecording
              ? "border-red-300 bg-red-50/30"
              : "border-gray-200 bg-white"
          } shadow-sm`}
        >
          {/* Recording visualizer */}
          <AnimatePresence>
            {isRecording && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="px-4 pt-4 pb-2 flex flex-col items-center"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-mono text-sm text-red-500 font-medium">
                    {formatTime(recordTime)}
                  </span>
                </div>
                <VisualizerBars />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Transcribing indicator */}
          <AnimatePresence>
            {transcribing && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="px-4 py-3 flex items-center gap-2 text-sm text-[#45BFD3]"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Transcribing your recording...
              </motion.div>
            )}
          </AnimatePresence>

          {/* Textarea */}
          {!isRecording && (
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write your response to this patient's update..."
              className="w-full px-4 pt-4 pb-2 bg-transparent text-gray-800 placeholder:text-gray-400 text-sm resize-none focus:outline-none min-h-[80px]"
              disabled={sending || transcribing}
              rows={3}
            />
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between px-4 pb-3 pt-1">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={sending || transcribing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isRecording
                  ? "bg-red-100 text-red-600 hover:bg-red-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  Voice
                </>
              )}
            </button>

            <button
              onClick={handleSubmit}
              disabled={!input.trim() || sending || isRecording}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                input.trim() && !sending
                  ? "bg-[#45BFD3] text-white hover:brightness-95 shadow-sm"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {sending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
