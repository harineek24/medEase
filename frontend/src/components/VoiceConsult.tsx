import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE_URL, WS_BASE_URL } from '../api'
import { Phone, PhoneOff, FileText } from 'lucide-react'

// Stethoscope Heart Component
const StethoscopeHeart = ({ state }: { state: 'idle' | 'listening' | 'speaking' | 'thinking' }) => {
  const heartColor = state === 'speaking' ? '#ef4444' : state === 'listening' ? '#22c55e' : '#374151'
  const isBeating = state === 'speaking'

  return (
    <div className="relative w-48 h-48 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Stethoscope tube - left side */}
        <path
          d="M 30 15 Q 15 15 15 35 Q 15 55 25 65 Q 35 75 50 85"
          fill="none"
          stroke="#9ca3af"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Stethoscope tube - right side */}
        <path
          d="M 70 15 Q 85 15 85 35 Q 85 55 75 65 Q 65 75 50 85"
          fill="none"
          stroke="#9ca3af"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Ear pieces */}
        <circle cx="30" cy="12" r="4" fill="#1f2937" />
        <circle cx="70" cy="12" r="4" fill="#1f2937" />
        {/* Chest piece */}
        <circle cx="50" cy="90" r="8" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="2" />
        <circle cx="50" cy="90" r="4" fill="#d1d5db" />
      </svg>

      {/* Heart in the center */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] ${isBeating ? 'animate-heartbeat' : ''}`}>
        <svg viewBox="0 0 24 24" className="w-16 h-16" style={{ filter: isBeating ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.5))' : 'none' }}>
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill={heartColor}
            className="transition-colors duration-300"
          />
        </svg>
      </div>

      {/* Pulse rings when speaking */}
      {isBeating && (
        <>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] w-20 h-20 rounded-full border-2 border-red-400 animate-ping opacity-30" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] w-24 h-24 rounded-full border border-red-300 animate-ping opacity-20" style={{ animationDelay: '0.2s' }} />
        </>
      )}

      {/* Listening indicator */}
      {state === 'listening' && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          <div className="w-1 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1 h-4 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      )}
    </div>
  )
}

interface ConsultationField {
  field_name: string
  label: string
  value: string
  confirmed: boolean
}

interface PendingField {
  field_name: string
  label: string
  value: string
}

type DoctorState = 'idle' | 'listening' | 'speaking' | 'thinking'

function VoiceConsult() {
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)

  // Doctor state
  const [doctorState, setDoctorState] = useState<DoctorState>('idle')
  const [statusText, setStatusText] = useState('Ready to connect')

  // Collected fields (doctor's notes)
  const [fields, setFields] = useState<ConsultationField[]>([])

  // Pending confirmation
  const [pendingField, setPendingField] = useState<PendingField | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Transcripts (stored for potential future use in displaying conversation)
  const [, setTranscripts] = useState<Array<{ role: string; text: string }>>([])

  // Audio state
  const [isRecording, setIsRecording] = useState(false)

  // Refs
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const captureContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isPlayingRef = useRef(false)

  // Initialize audio context
  const initAudio = useCallback(async () => {
    try {
      // Playback context at 24kHz (Gemini output rate)
      audioContextRef.current = new AudioContext({ sampleRate: 24000 })

      // Capture context at 16kHz (Gemini input rate)
      captureContextRef.current = new AudioContext({ sampleRate: 16000 })

      // Request microphone access
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      return true
    } catch (error) {
      console.error('Error initializing audio:', error)
      setStatusText('Microphone access denied')
      return false
    }
  }, [])

  // Start recording and sending audio
  const startRecording = useCallback(() => {
    if (!mediaStreamRef.current || !captureContextRef.current || !wsRef.current) return

    // Use capture context (16kHz) for recording
    const source = captureContextRef.current.createMediaStreamSource(mediaStreamRef.current)
    const processor = captureContextRef.current.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0)

        // Convert float32 to int16 PCM
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        // Send as binary WebSocket frame (matching voicegen pattern)
        wsRef.current.send(pcmData.buffer)
      }
    }

    source.connect(processor)
    // Connect to destination to keep the processor running (but we're using capture context)
    processor.connect(captureContextRef.current.destination)
    processorRef.current = processor

    setIsRecording(true)
    setDoctorState('listening')
    setStatusText('Listening...')
  }, [])

  // Stop recording
  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    setIsRecording(false)
  }, [])

  // Play audio from queue
  const playAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return
    if (!audioContextRef.current) return

    isPlayingRef.current = true
    setDoctorState('speaking')
    setStatusText('Dr. MedAssist is speaking...')

    while (audioQueueRef.current.length > 0) {
      const audioData = audioQueueRef.current.shift()
      if (!audioData) continue

      try {
        // Convert PCM to AudioBuffer
        const int16Array = new Int16Array(audioData)
        const float32Array = new Float32Array(int16Array.length)

        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0
        }

        const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 24000)
        audioBuffer.getChannelData(0).set(float32Array)

        const source = audioContextRef.current.createBufferSource()
        source.buffer = audioBuffer
        source.connect(audioContextRef.current.destination)

        await new Promise<void>((resolve) => {
          source.onended = () => resolve()
          source.start()
        })
      } catch (error) {
        console.error('Error playing audio:', error)
      }
    }

    isPlayingRef.current = false
    setDoctorState('idle')
    setStatusText('Your turn to speak')
  }, [])

  // Connect to consultation
  const connect = async () => {
    setIsConnecting(true)
    setStatusText('Connecting...')

    try {
      // Initialize audio first
      const audioReady = await initAudio()
      if (!audioReady) {
        setIsConnecting(false)
        return
      }

      // Start a new session
      const response = await fetch(`${API_BASE_URL}/api/consult/start`, {
        method: 'POST'
      })

      if (!response.ok) throw new Error('Failed to start session')

      const data = await response.json()
      setSessionId(data.session_id)

      // Connect WebSocket
      const ws = new WebSocket(`${WS_BASE_URL}/ws/voice/${data.session_id}`)

      ws.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        setIsConnecting(false)
        setDoctorState('speaking')
        setStatusText('Connected to Dr. MedAssist')
      }

      ws.onmessage = async (event) => {
        // Handle binary audio data (voicegen pattern)
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer()
          audioQueueRef.current.push(arrayBuffer)
          playAudioQueue()
          return
        }

        // Handle JSON control messages
        const message = JSON.parse(event.data)
        console.log('WebSocket message received:', message.type, message)

        switch (message.type) {
          case 'ready':
            // Load any existing fields
            if (message.fields?.length > 0) {
              setFields(message.fields.map((f: { field_name: string; field_label: string; field_value: string; confirmed: number }) => ({
                field_name: f.field_name,
                label: f.field_label,
                value: f.field_value,
                confirmed: f.confirmed === 1
              })))
            }
            break

          case 'audio':
            // Fallback for base64 audio (backwards compatibility)
            const audioBytes = Uint8Array.from(atob(message.data), c => c.charCodeAt(0))
            audioQueueRef.current.push(audioBytes.buffer)
            playAudioQueue()
            break

          case 'transcript':
            setTranscripts(prev => [...prev, { role: message.role, text: message.text }])
            if (message.role === 'assistant') {
              setDoctorState('speaking')
            }
            break

          case 'field_extracted':
            // Add field to list immediately (will show as unconfirmed)
            setFields(prev => {
              const existing = prev.find(f => f.field_name === message.field_name)
              if (existing) {
                return prev.map(f =>
                  f.field_name === message.field_name
                    ? { ...f, label: message.label, value: message.value, confirmed: false }
                    : f
                )
              }
              return [...prev, {
                field_name: message.field_name,
                label: message.label,
                value: message.value,
                confirmed: false
              }]
            })
            // Show confirmation popup
            setPendingField({
              field_name: message.field_name,
              label: message.label,
              value: message.value
            })
            setEditValue(message.value)
            break

          case 'field_confirmed':
          case 'field_updated':
            // Update fields list
            setFields(prev => {
              const existing = prev.find(f => f.field_name === message.field_name)
              if (existing) {
                return prev.map(f =>
                  f.field_name === message.field_name
                    ? { ...f, value: message.value || f.value, confirmed: true }
                    : f
                )
              }
              return prev
            })
            setPendingField(null)
            break

          case 'emergency':
            setStatusText(`EMERGENCY: ${message.reason}`)
            // Show emergency alert
            alert(`EMERGENCY: ${message.reason}\n\nPlease call 911 immediately if you are experiencing a medical emergency.`)
            break
        }
      }

      ws.onclose = () => {
        console.log('WebSocket closed')
        setIsConnected(false)
        setDoctorState('idle')
        setStatusText('Disconnected')
        stopRecording()
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setStatusText('Connection error')
        setIsConnecting(false)
      }

      wsRef.current = ws

      // Start recording after a short delay
      setTimeout(() => {
        startRecording()
      }, 2000)

    } catch (error) {
      console.error('Connection error:', error)
      setStatusText('Failed to connect')
      setIsConnecting(false)
    }
  }

  // Disconnect
  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'end_session' }))
      wsRef.current.close()
    }
    stopRecording()
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (captureContextRef.current) {
      captureContextRef.current.close()
      captureContextRef.current = null
    }
    setIsConnected(false)
    setDoctorState('idle')
    setStatusText('Session ended')
  }

  // Confirm field
  const confirmField = () => {
    if (!pendingField || !wsRef.current) return

    wsRef.current.send(JSON.stringify({
      type: 'confirm_field',
      field_name: pendingField.field_name
    }))

    // Add to fields list
    setFields(prev => [...prev, {
      field_name: pendingField.field_name,
      label: pendingField.label,
      value: pendingField.value,
      confirmed: true
    }])

    setPendingField(null)
    setIsEditing(false)
  }

  // Edit and confirm field
  const editAndConfirm = () => {
    if (!pendingField || !wsRef.current) return

    wsRef.current.send(JSON.stringify({
      type: 'edit_field',
      field_name: pendingField.field_name,
      label: pendingField.label,
      value: editValue
    }))

    // Add to fields list with edited value
    setFields(prev => [...prev, {
      field_name: pendingField.field_name,
      label: pendingField.label,
      value: editValue,
      confirmed: true
    }])

    setPendingField(null)
    setIsEditing(false)
  }

  // Edit existing field
  const editExistingField = (field: ConsultationField) => {
    setPendingField({
      field_name: field.field_name,
      label: field.label,
      value: field.value
    })
    setEditValue(field.value)
    setIsEditing(true)
  }

  // Get summary
  const getSummary = async () => {
    if (!sessionId) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/consult/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      })

      if (response.ok) {
        const data = await response.json()
        // Download summary
        const blob = new Blob([data.summary], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `consultation_summary_${new Date().toISOString().split('T')[0]}.txt`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Error getting summary:', error)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (captureContextRef.current) {
        captureContextRef.current.close()
      }
    }
  }, [])

  return (
    <div className="voice-consult">
      <div className="consult-layout">
        {/* Left Side - Doctor's Notes */}
        <div className="doctors-notes-panel">
          <div className="notes-header">
            <div className="notes-logo">
              <span className="rx-symbol">Rx</span>
            </div>
            <div className="notes-title">
              <h2>Doctor's Notes</h2>
              <p className="clinic-name">MedEase Virtual Clinic</p>
            </div>
          </div>

          <div className="notes-content">
            <div className="notes-date">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>

            <div className="notes-divider"></div>

            {fields.length === 0 ? (
              <div className="notes-empty">
                <p>Waiting for consultation to begin...</p>
                <p className="notes-hint">Information will appear here as Dr. MedAssist collects it</p>
              </div>
            ) : (
              <div className="notes-fields">
                {fields.map((field, index) => (
                  <div
                    key={field.field_name}
                    className={`note-field ${field.confirmed ? 'confirmed' : ''}`}
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="note-label">{field.label}:</div>
                    <div className="note-value">{field.value}</div>
                    <button
                      className="note-edit-btn"
                      onClick={() => editExistingField(field)}
                      title="Edit this field"
                    >
                      edit
                    </button>
                    {field.confirmed && <span className="note-check">ok</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="notes-footer">
              <div className="confidential-stamp">CONFIDENTIAL</div>
            </div>
          </div>
        </div>

        {/* Right Side - Doctor Animation & Controls */}
        <div className="doctor-panel">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 flex flex-col items-center">
            {/* Stethoscope Heart Animation */}
            <StethoscopeHeart state={doctorState} />

            <div className="text-center mt-4">
              <h3 className="text-xl font-medium text-gray-900">Dr. MedAssist</h3>
              <p className="text-sm text-[#45BFD3] mt-1">AI Physician Assistant</p>
              <p className={`text-sm mt-2 ${
                doctorState === 'speaking' ? 'text-red-500' :
                doctorState === 'listening' ? 'text-green-500' :
                'text-gray-500'
              }`}>{statusText}</p>
            </div>

            {/* Recording indicator */}
            {isRecording && (
              <div className="flex items-center gap-2 mt-4 text-sm text-red-500">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span>Recording</span>
              </div>
            )}
          </div>

          {/* Control Buttons */}
          <div className="flex flex-col gap-3 w-full mt-6">
            {!isConnected ? (
              <button
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-[#45BFD3] hover:bg-[#3aa8ba] text-white font-medium rounded-xl transition-all duration-200 shadow-lg disabled:opacity-50"
                onClick={connect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Phone className="w-5 h-5" />
                    <span>Connect Now</span>
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-all duration-200"
                  onClick={disconnect}
                >
                  <PhoneOff className="w-5 h-5" />
                  <span>End Session</span>
                </button>
                <button
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-all duration-200 disabled:opacity-50"
                  onClick={getSummary}
                  disabled={fields.length === 0}
                >
                  <FileText className="w-5 h-5" />
                  <span>Get Summary</span>
                </button>
              </>
            )}
          </div>

          {/* Disclaimer */}
          <div className="consult-disclaimer-small">
            <p>This is an AI consultation for informational purposes only.</p>
            <p>Always consult a licensed physician for medical advice.</p>
          </div>
        </div>
      </div>

      {/* Confirmation Popup */}
      {pendingField && (
        <div className="confirmation-overlay">
          <div className="confirmation-popup">
            <div className="popup-header">
              <h3>I heard:</h3>
            </div>

            <div className="popup-content">
              <div className="popup-field-label">{pendingField.label}</div>

              {isEditing ? (
                <input
                  type="text"
                  className="popup-edit-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                />
              ) : (
                <div className="popup-field-value">{pendingField.value}</div>
              )}
            </div>

            <div className="popup-actions">
              {isEditing ? (
                <>
                  <button className="popup-cancel" onClick={() => setIsEditing(false)}>
                    Cancel
                  </button>
                  <button className="popup-save" onClick={editAndConfirm}>
                    Save
                  </button>
                </>
              ) : (
                <>
                  <button className="popup-edit" onClick={() => setIsEditing(true)}>
                    <span>edit</span> Edit
                  </button>
                  <button className="popup-confirm" onClick={confirmField}>
                    <span>ok</span> Yes, correct
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VoiceConsult
