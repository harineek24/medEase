import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Send, Play, Pause, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/api";

interface NoteComposerProps {
  doctorId: number;
  patientId: number;
  onNoteSent: () => void;
}

export default function NoteComposer({ doctorId, patientId, onNoteSent }: NoteComposerProps) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  /* ---------------------------------------------------------------- */
  /*  Recording                                                       */
  /* ---------------------------------------------------------------- */

  const startRecording = useCallback(async () => {
    setError(null);
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
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch {
      setError("Could not access microphone. Please allow microphone permissions.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const discardRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingDuration(0);
    setIsPlaying(false);
  }, [audioUrl]);

  /* ---------------------------------------------------------------- */
  /*  Playback                                                        */
  /* ---------------------------------------------------------------- */

  const togglePlayback = useCallback(() => {
    if (!audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [audioUrl, isPlaying]);

  /* ---------------------------------------------------------------- */
  /*  Send                                                            */
  /* ---------------------------------------------------------------- */

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const handleSend = async () => {
    if (!text.trim() && !audioBlob) return;
    setSending(true);
    setError(null);

    try {
      let noteType: "text" | "voice" | "both" = "text";
      let audioDataUrl: string | undefined;

      if (audioBlob && text.trim()) {
        noteType = "both";
      } else if (audioBlob) {
        noteType = "voice";
      }

      if (audioBlob) {
        audioDataUrl = await blobToBase64(audioBlob);
      }

      const res = await fetch(`${API_BASE_URL}/api/doctor/${doctorId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          content: text.trim() || undefined,
          note_type: noteType,
          audio_url: audioDataUrl,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `Failed to send note (${res.status})`);
      }

      // Reset
      setText("");
      discardRecording();
      onNoteSent();
    } catch (err: any) {
      setError(err.message || "Failed to send note");
    } finally {
      setSending(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Formatting                                                      */
  /* ---------------------------------------------------------------- */

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const canSend = (text.trim().length > 0 || audioBlob !== null) && !sending;

  /* ---------------------------------------------------------------- */
  /*  Waveform Bars                                                   */
  /* ---------------------------------------------------------------- */

  const WaveformBars = () => (
    <div className="flex items-end gap-0.5 h-8">
      {Array.from({ length: 20 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-red-400"
          animate={{
            height: [8, 4 + Math.random() * 28, 8],
          }}
          transition={{
            repeat: Infinity,
            duration: 0.5 + Math.random() * 0.5,
            delay: i * 0.04,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100 space-y-4">
      <h4 className="font-semibold text-gray-900">Compose Note</h4>

      {/* Text input */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your note for the patient..."
        rows={4}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#45BFD3] focus:ring-2 focus:ring-[#45BFD3]/20 focus:outline-none resize-none transition-colors"
      />

      {/* Voice recording section */}
      <div className="flex items-center gap-3">
        {!isRecording && !audioBlob && (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <Mic className="h-4 w-4" />
            Record Voice Note
          </button>
        )}

        <AnimatePresence mode="wait">
          {/* Recording in progress */}
          {isRecording && (
            <motion.div
              key="recording"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-1 items-center gap-3 rounded-xl bg-red-50 px-4 py-3"
            >
              <motion.div
                className="h-3 w-3 rounded-full bg-red-500"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
              />
              <WaveformBars />
              <span className="text-sm font-mono text-red-600 ml-auto">
                {formatDuration(recordingDuration)}
              </span>
              <button
                onClick={stopRecording}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                aria-label="Stop recording"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}

          {/* Recorded audio preview */}
          {!isRecording && audioBlob && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-1 items-center gap-3 rounded-xl bg-[#45BFD3]/10 px-4 py-3"
            >
              <button
                onClick={togglePlayback}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#45BFD3] text-white hover:bg-[#3baab8] transition-colors"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-1 h-6">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full bg-[#45BFD3]"
                      style={{
                        height: `${6 + Math.sin(i * 0.7) * 10 + Math.random() * 6}px`,
                        opacity: 0.5 + Math.random() * 0.5,
                      }}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Voice note - {formatDuration(recordingDuration)}
                </p>
              </div>
              <button
                onClick={discardRecording}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-500 transition-colors"
                aria-label="Discard recording"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Send */}
      <div className="flex justify-end">
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all",
            canSend
              ? "bg-[#45BFD3] text-white hover:bg-[#3baab8] shadow-sm"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          )}
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send Note
            </>
          )}
        </button>
      </div>
    </div>
  );
}
