import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE_URL, WS_BASE_URL } from '../api'

interface ConsultationField {
  field_name: string
  label: string
  value: string
  confirmed: boolean
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

  // Inline editing state
  const [editingFieldName, setEditingFieldName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

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
            console.log('✅ READY: Session initialized', message)
            // Load any existing fields
            if (message.fields?.length > 0) {
              console.log('📋 Loading existing fields:', message.fields)
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
            console.log('🔊 Received base64 audio data')
            const audioBytes = Uint8Array.from(atob(message.data), c => c.charCodeAt(0))
            audioQueueRef.current.push(audioBytes.buffer)
            playAudioQueue()
            break

          case 'transcript':
            console.log('💬 TRANSCRIPT:', message.role, message.text)
            setTranscripts(prev => [...prev, { role: message.role, text: message.text }])
            if (message.role === 'assistant') {
              setDoctorState('speaking')
            }
            break

          case 'field_extracted':
            console.log('🎯 FIELD_EXTRACTED received:', {
              field_name: message.field_name,
              label: message.label,
              value: message.value
            })
            // Add field to list immediately - auto-confirmed (no popup needed)
            setFields(prev => {
              console.log('📝 Current fields before update:', prev)
              const existing = prev.find(f => f.field_name === message.field_name)
              const newFields = existing
                ? prev.map(f =>
                    f.field_name === message.field_name
                      ? { ...f, label: message.label, value: message.value, confirmed: true }
                      : f
                  )
                : [...prev, {
                    field_name: message.field_name,
                    label: message.label,
                    value: message.value,
                    confirmed: true
                  }]
              console.log('📝 Fields after update:', newFields)
              return newFields
            })
            break

          case 'field_confirmed':
          case 'field_updated':
            console.log('✅ FIELD_CONFIRMED/UPDATED:', message.field_name, message.value)
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
            // Clear inline editing if this field was being edited
            setEditingFieldName(null)
            break

          case 'emergency':
            console.log('🚨 EMERGENCY:', message.reason)
            setStatusText(`EMERGENCY: ${message.reason}`)
            // Show emergency alert
            alert(`EMERGENCY: ${message.reason}\n\nPlease call 911 immediately if you are experiencing a medical emergency.`)
            break

          default:
            console.log('❓ Unknown message type:', message.type, message)
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

  // Start editing a field inline
  const startEditingField = (field: ConsultationField) => {
    setEditingFieldName(field.field_name)
    setEditValue(field.value)
  }

  // Save inline edit
  const saveInlineEdit = (fieldName: string, label: string) => {
    if (!wsRef.current) return

    // Send edit to backend
    wsRef.current.send(JSON.stringify({
      type: 'edit_field',
      field_name: fieldName,
      label: label,
      value: editValue
    }))

    // Update local state immediately
    setFields(prev => prev.map(f =>
      f.field_name === fieldName
        ? { ...f, value: editValue, confirmed: true }
        : f
    ))

    setEditingFieldName(null)
    setEditValue('')
  }

  // Cancel inline edit
  const cancelInlineEdit = () => {
    setEditingFieldName(null)
    setEditValue('')
  }

  // Handle keyboard events for inline edit
  const handleEditKeyDown = (e: React.KeyboardEvent, fieldName: string, label: string) => {
    if (e.key === 'Enter') {
      saveInlineEdit(fieldName, label)
    } else if (e.key === 'Escape') {
      cancelInlineEdit()
    }
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
                    className={`note-field ${field.confirmed ? 'confirmed' : ''} ${editingFieldName === field.field_name ? 'editing' : ''}`}
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="note-label">{field.label}:</div>
                    {editingFieldName === field.field_name ? (
                      <div className="note-edit-inline">
                        <input
                          type="text"
                          className="note-edit-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => handleEditKeyDown(e, field.field_name, field.label)}
                          autoFocus
                        />
                        <button
                          className="note-save-btn"
                          onClick={() => saveInlineEdit(field.field_name, field.label)}
                          title="Save"
                        >
                          ✓
                        </button>
                        <button
                          className="note-cancel-btn"
                          onClick={cancelInlineEdit}
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          className="note-value"
                          onClick={() => startEditingField(field)}
                          title="Click to edit"
                        >
                          {field.value}
                        </div>
                        <button
                          className="note-edit-btn"
                          onClick={() => startEditingField(field)}
                          title="Edit this field"
                        >
                          ✎
                        </button>
                      </>
                    )}
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
          <div className="doctor-card">
            {/* Doctor Avatar */}
            <div className={`doctor-avatar-container ${doctorState}`}>
              <div className="doctor-avatar-bg"></div>
              <div className="doctor-figure">
                <div className="doctor-head">
                  <div className="doctor-face">
                    <div className="doctor-eyes">
                      <div className={`doctor-eye left ${doctorState === 'listening' ? 'attentive' : ''}`}>
                        <div className="eye-pupil"></div>
                      </div>
                      <div className={`doctor-eye right ${doctorState === 'listening' ? 'attentive' : ''}`}>
                        <div className="eye-pupil"></div>
                      </div>
                    </div>
                    <div className={`doctor-mouth ${doctorState}`}></div>
                  </div>
                  <div className="doctor-hair"></div>
                  <div className="stethoscope"></div>
                </div>
                <div className="doctor-body">
                  <div className="doctor-coat">
                    <div className="coat-collar"></div>
                    <div className="name-tag">
                      <span>Dr. MedAssist</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sound waves when speaking */}
              {doctorState === 'speaking' && (
                <div className="sound-waves">
                  <div className="wave"></div>
                  <div className="wave"></div>
                  <div className="wave"></div>
                </div>
              )}

              {/* Listening indicator */}
              {doctorState === 'listening' && (
                <div className="listening-indicator">
                  <div className="pulse-ring"></div>
                  <div className="mic-icon">🎤</div>
                </div>
              )}
            </div>

            <div className="doctor-info">
              <h3>Dr. MedAssist</h3>
              <p className="doctor-specialty">AI Physician Assistant</p>
              <p className={`doctor-status ${doctorState}`}>{statusText}</p>
            </div>

            {/* Recording indicator */}
            {isRecording && (
              <div className="recording-indicator">
                <div className="recording-dot"></div>
                <span>Recording</span>
              </div>
            )}
          </div>

          {/* Control Buttons */}
          <div className="control-buttons">
            {!isConnected ? (
              <button
                className="connect-btn"
                onClick={connect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <span className="btn-spinner"></span>
                    Connecting...
                  </>
                ) : (
                  <>
                    <span className="btn-icon">📞</span>
                    Connect Now
                  </>
                )}
              </button>
            ) : (
              <>
                <button className="end-btn" onClick={disconnect}>
                  <span className="btn-icon">📴</span>
                  End Session
                </button>
                <button
                  className="summary-btn"
                  onClick={getSummary}
                  disabled={fields.length === 0}
                >
                  <span className="btn-icon">📋</span>
                  Get Summary
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

    </div>
  )
}

export default VoiceConsult
