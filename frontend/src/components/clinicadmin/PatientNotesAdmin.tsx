import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Send,
  ChevronDown,
  Clock,
  FileText,
  Volume2,
  Loader2,
  AlertCircle,
  RefreshCw,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { API_BASE_URL as API } from "@/api";

/* ---------- Types ---------- */
interface PatientOption {
  id: number;
  name: string;
}

interface Note {
  id: number;
  patient_id: number;
  patient_name: string;
  content: string;
  note_type: "text" | "voice";
  audio_url?: string;
  created_at: string;
}

/* ---------- Waveform bars component ---------- */
function WaveformBars() {
  return (
    <div className="flex items-center gap-[3px] h-8">
      {Array.from({ length: 20 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-[#45BFD3]"
          animate={{
            height: [8, 24, 12, 28, 8],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.05,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/* ---------- Timer display ---------- */
function RecordingTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 200);
    return () => clearInterval(interval);
  }, [startTime]);

  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");

  return (
    <span className="font-mono text-sm font-medium text-red-500">
      {mins}:{secs}
    </span>
  );
}

/* ================================================================== */
/*  PatientNotesAdmin                                                  */
/* ================================================================== */
export default function PatientNotesAdmin() {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Recording state */
  const [recording, setRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  /* ---------- Fetch patients + notes ---------- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, nRes] = await Promise.all([
        fetch(`${API}/api/patients`),
        fetch(`${API}/api/clinicadmin/notes`),
      ]);
      if (pRes.ok) setPatients(await pRes.json());
      if (nRes.ok) setNotes(await nRes.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------- Recording ---------- */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setRecording(true);
      setRecordingStartTime(Date.now());
      setAudioBlob(null);
      setAudioUrl(null);
    } catch {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const discardRecording = () => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  };

  /* ---------- Send note ---------- */
  const handleSend = async () => {
    if (!selectedPatient) {
      alert("Please select a patient.");
      return;
    }
    if (!content.trim() && !audioBlob) {
      alert("Please enter text or record audio.");
      return;
    }

    setSending(true);
    try {
      let uploadedAudioUrl: string | undefined;

      /* Upload audio if present */
      if (audioBlob) {
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.webm");
        const upRes = await fetch(`${API}/api/upload/audio`, {
          method: "POST",
          body: formData,
        });
        if (upRes.ok) {
          const upData = await upRes.json();
          uploadedAudioUrl = upData.url;
        }
      }

      const noteType: "text" | "voice" = audioBlob ? "voice" : "text";

      const res = await fetch(`${API}/api/clinicadmin/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctor_id: 1,
          patient_id: Number(selectedPatient),
          content: content.trim(),
          note_type: noteType,
          audio_url: uploadedAudioUrl ?? null,
        }),
      });

      if (!res.ok) throw new Error("Failed to send note");

      /* Reset */
      setContent("");
      discardRecording();

      /* Re-fetch notes */
      const nRes = await fetch(`${API}/api/clinicadmin/notes`);
      if (nRes.ok) setNotes(await nRes.json());
    } catch {
      alert("Failed to send note.");
    } finally {
      setSending(false);
    }
  };

  /* ---------- Loading / Error ---------- */
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#45BFD3]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-red-500">
        <AlertCircle className="h-10 w-10" />
        <p className="text-lg font-medium">{error}</p>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 rounded-lg bg-[#45BFD3] px-4 py-2 text-white hover:bg-[#3caebb] transition"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-6">
      {/* Header */}
      <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
        Patient Notes
      </h1>

      {/* ---- Note Composer Card ---- */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl bg-white p-6 shadow-sm border border-gray-100"
      >
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Send a Note
        </h2>

        {/* Patient selector */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Patient
          </label>
          <div className="relative max-w-sm">
            <select
              value={selectedPatient}
              onChange={(e) => setSelectedPatient(e.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-8 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition"
            >
              <option value="">Select patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-gray-400" />
          </div>
        </div>

        {/* Text area */}
        <div className="mb-4">
          <textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your note here..."
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/30 outline-none transition resize-none"
          />
        </div>

        {/* Recording UI */}
        <AnimatePresence mode="wait">
          {recording ? (
            <motion.div
              key="recording"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 flex items-center gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
            >
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
              </span>
              <WaveformBars />
              <RecordingTimer startTime={recordingStartTime} />
              <button
                onClick={stopRecording}
                className="ml-auto flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition"
              >
                <MicOff className="h-4 w-4" /> Stop
              </button>
            </motion.div>
          ) : audioUrl ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 flex items-center gap-3 rounded-lg border border-[#45BFD3]/30 bg-[#45BFD3]/5 px-4 py-3"
            >
              <Volume2 className="h-5 w-5 text-[#45BFD3]" />
              <audio controls src={audioUrl} className="flex-1 h-9" />
              <button
                onClick={discardRecording}
                className="text-sm text-red-500 hover:text-red-700 transition font-medium"
              >
                Discard
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {!recording && !audioUrl && (
            <button
              onClick={startRecording}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              <Mic className="h-4 w-4 text-[#45BFD3]" /> Record Voice
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={sending || recording}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-[#45BFD3] px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-[#3caebb] transition disabled:opacity-60"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Note
          </button>
        </div>
      </motion.div>

      {/* ---- Sent Notes History ---- */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Sent Notes
        </h2>

        {notes.length === 0 ? (
          <p className="py-12 text-center text-gray-400">
            No notes have been sent yet.
          </p>
        ) : (
          <div className="space-y-3">
            {notes.map((note, i) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-xl bg-white p-5 shadow-sm border border-gray-100"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    {note.patient_name}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      note.note_type === "voice"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700",
                    )}
                  >
                    {note.note_type === "voice" ? (
                      <span className="inline-flex items-center gap-1">
                        <Volume2 className="h-3 w-3" /> Voice
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Text
                      </span>
                    )}
                  </span>
                </div>

                {note.content && (
                  <p className="mb-2 text-sm text-gray-600 line-clamp-3">
                    {note.content}
                  </p>
                )}

                {note.audio_url && (
                  <audio
                    controls
                    src={note.audio_url}
                    className="mb-2 w-full h-9"
                  />
                )}

                <p className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  {new Date(note.created_at).toLocaleString()}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
