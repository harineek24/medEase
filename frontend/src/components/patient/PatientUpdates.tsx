import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE_URL } from '../../api'
import {
  Mic,
  Square,
  Send,
  Clock,
  MessageSquare,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Types ─────────────────────────────────────────────────────────────
interface Update {
  id: number
  update_text: string
  audio_duration?: number
  summary: string
  questions: string
  created_at: string
}

// ─── Component ─────────────────────────────────────────────────────────
export default function PatientUpdates() {
  const [input, setInput] = useState('')
  const [updates, setUpdates] = useState<Update[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch existing updates
  const fetchUpdates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/patient-updates/1`)
      if (res.ok) {
        const data = await res.json()
        setUpdates(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error('Error fetching updates:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUpdates() }, [fetchUpdates])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setRecordTime(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isRecording])

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  // ─── Voice Recording ──────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await transcribeAudio(audioBlob)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access denied:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const transcribeAudio = async (blob: Blob) => {
    setTranscribing(true)
    try {
      const formData = new FormData()
      formData.append('file', blob, 'recording.webm')
      const res = await fetch(`${API_BASE_URL}/api/patient-updates/transcribe`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        setInput(prev => prev ? `${prev}\n${data.text}` : data.text)
      }
    } catch (err) {
      console.error('Transcription error:', err)
    } finally {
      setTranscribing(false)
    }
  }

  // ─── Submit Update ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/patient-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: 1,
          update_text: input.trim(),
          audio_duration: recordTime > 0 ? recordTime : null,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const newUpdate: Update = {
          id: data.id,
          update_text: input.trim(),
          summary: data.summary,
          questions: data.questions,
          created_at: data.created_at,
        }
        setUpdates(prev => [newUpdate, ...prev])
        setInput('')
        setExpandedId(data.id)
      }
    } catch (err) {
      console.error('Error submitting update:', err)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return `Today at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const parseBullets = (text: string) => {
    return text.split('\n').filter(line => line.trim().startsWith('-')).map(line => line.trim().slice(1).trim())
  }

  // ─── Visualizer bars for recording ────────────────────────────────
  const VisualizerBars = () => (
    <div className="flex items-center justify-center gap-0.5 h-8 px-2">
      {Array.from({ length: 24 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-0.5 rounded-full bg-red-400"
          animate={{ height: [4, Math.random() * 24 + 6, 4] }}
          transition={{ duration: 0.4 + Math.random() * 0.4, repeat: Infinity, delay: i * 0.04 }}
        />
      ))}
    </div>
  )

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Health Updates</h1>
        <p className="text-gray-500 text-sm">Share updates with your doctor — type or use voice recording</p>
      </div>

      {/* ─── Input Box ─────────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 transition-all duration-300 mb-8 ${
        isRecording ? 'border-red-300 bg-red-50/30' : 'border-gray-200 bg-white'
      } shadow-sm`}>
        {/* Recording visualizer */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 pt-4 pb-2 flex flex-col items-center"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-mono text-sm text-red-500 font-medium">{formatTime(recordTime)}</span>
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
              animate={{ height: 'auto', opacity: 1 }}
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
            placeholder="How are you feeling today? Any symptoms, questions, or updates for your doctor..."
            className="w-full px-4 pt-4 pb-2 bg-transparent text-gray-800 placeholder:text-gray-400 text-base resize-none focus:outline-none min-h-[80px]"
            disabled={sending || transcribing}
            rows={3}
          />
        )}

        {/* Action bar */}
        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <div className="flex items-center gap-1">
            {/* Voice recording button */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={sending || transcribing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isRecording
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
          </div>

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || sending || isRecording}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              input.trim() && !sending
                ? 'bg-[#45BFD3] text-white hover:brightness-95 shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {sending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {sending ? 'Summarizing...' : 'Send'}
          </button>
        </div>
      </div>

      {/* ─── Previous Updates ──────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-[#45BFD3] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : updates.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No updates yet. Share your first health update above!</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Previous Updates</h2>
          {updates.map(update => {
            const isExpanded = expandedId === update.id
            const summaryBullets = parseBullets(update.summary || '')
            const questionBullets = parseBullets(update.questions || '').filter(q => q.toLowerCase() !== 'none')

            return (
              <motion.div
                key={update.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm"
              >
                {/* Header - always visible */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : update.id)}
                  className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50/50 transition"
                >
                  <div className="w-8 h-8 rounded-full bg-[#45BFD3]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4 text-[#45BFD3]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 line-clamp-2">{update.update_text}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {formatDate(update.created_at)}
                      </span>
                      {update.audio_duration && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Mic className="w-3 h-3" />
                          {formatTime(update.audio_duration)}
                        </span>
                      )}
                      {questionBullets.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
                          <HelpCircle className="w-3 h-3" />
                          {questionBullets.length} question{questionBullets.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 mt-1">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">
                        {/* Summary card */}
                        {summaryBullets.length > 0 && (
                          <div className="rounded-xl bg-[#45BFD3]/5 border border-[#45BFD3]/20 p-4">
                            <h4 className="text-xs font-semibold text-[#45BFD3] uppercase tracking-wider mb-2.5">
                              Summary
                            </h4>
                            <ul className="space-y-1.5">
                              {summaryBullets.map((bullet, i) => (
                                <li key={i} className="flex gap-2 text-sm text-gray-700">
                                  <span className="text-[#45BFD3] mt-1 shrink-0">•</span>
                                  <span>{bullet}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Questions card */}
                        {questionBullets.length > 0 && (
                          <div className="rounded-xl bg-amber-50 border border-amber-200/50 p-4">
                            <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                              <HelpCircle className="w-3.5 h-3.5" />
                              Questions for Doctor
                            </h4>
                            <ul className="space-y-1.5">
                              {questionBullets.map((q, i) => (
                                <li key={i} className="flex gap-2 text-sm text-amber-900">
                                  <span className="text-amber-500 mt-1 shrink-0">?</span>
                                  <span>{q}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Full text */}
                        <div className="rounded-xl bg-gray-50 p-4">
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            Original Message
                          </h4>
                          <p className="text-sm text-gray-600 whitespace-pre-wrap">{update.update_text}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
