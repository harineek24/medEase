import { useState, useEffect, useRef, useCallback } from 'react'

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

type DoctorState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'connecting'

// Audio configuration matching Gemini Live API
const SEND_SAMPLE_RATE = 16000  // Browser -> Gemini
const RECEIVE_SAMPLE_RATE = 24000  // Gemini -> Browser

function VoiceConsult() {
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)

  // Doctor state
  const [doctorState, setDoctorState] = useState<DoctorState>('idle')
  const [statusText, setStatusText] = useState('Click Start Consultation to begin')

  // Collected fields (doctor's notes)
  const [fields, setFields] = useState<ConsultationField[]>([])

  // Pending confirmation
  const [pendingField, setPendingField] = useState<PendingField | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Transcripts
  const [transcripts, setTranscripts] = useState<Array<{ role: string; text: string }>>([])

  // Audio state
  const [isRecording, setIsRecording] = useState(false)

  // Refs
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const playbackContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isPlayingRef = useRef(false)
  const nextPlayTimeRef = useRef(0)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [])

  // Play audio from queue continuously
  const playAudioChunk = useCallback((audioData: ArrayBuffer) => {
    if (!playbackContextRef.current) return

    try {
      const ctx = playbackContextRef.current

      // Convert PCM int16 to float32
      const int16Array = new Int16Array(audioData)
      const float32Array = new Float32Array(int16Array.length)
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0
      }

      // Create audio buffer
      const audioBuffer = ctx.createBuffer(1, float32Array.length, RECEIVE_SAMPLE_RATE)
      audioBuffer.getChannelData(0).set(float32Array)

      // Schedule playback
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)

      const currentTime = ctx.currentTime
      const startTime = Math.max(currentTime, nextPlayTimeRef.current)
      source.start(startTime)
      nextPlayTimeRef.current = startTime + audioBuffer.duration

      if (!isPlayingRef.current) {
        isPlayingRef.current = true
        setDoctorState('speaking')
        setStatusText('Dr. MedAssist is speaking...')
      }

      source.onended = () => {
        if (ctx.currentTime >= nextPlayTimeRef.current - 0.1) {
          isPlayingRef.current = false
          setDoctorState('listening')
          setStatusText('Your turn to speak...')
        }
      }
    } catch (error) {
      console.error('Error playing audio:', error)
    }
  }, [])

  // Initialize audio for recording
  const initRecordingAudio = useCallback(async () => {
    try {
      // Create recording context at 16kHz
      audioContextRef.current = new AudioContext({ sampleRate: SEND_SAMPLE_RATE })

      // Create playback context at 24kHz
      playbackContextRef.current = new AudioContext({ sampleRate: RECEIVE_SAMPLE_RATE })

      // Request microphone
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SEND_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      return true
    } catch (error) {
      console.error('Error initializing audio:', error)
      setStatusText('Microphone access denied')
      return false
    }
  }, [])

  // Start recording and streaming audio
  const startRecording = useCallback(() => {
    if (!mediaStreamRef.current || !audioContextRef.current || !wsRef.current) {
      console.error('Cannot start recording - missing resources')
      return
    }

    const ctx = audioContextRef.current
    const source = ctx.createMediaStreamSource(mediaStreamRef.current)

    // Use ScriptProcessor for broader compatibility
    const processor = ctx.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0)

        // Convert float32 to int16 PCM
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        // Send as raw binary
        wsRef.current.send(pcmData.buffer)
      }
    }

    source.connect(processor)
    processor.connect(ctx.destination)
    workletNodeRef.current = processor as any

    setIsRecording(true)
    console.log('Recording started')
  }, [])

  // Stop recording
  const stopRecording = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }
    setIsRecording(false)
    console.log('Recording stopped')
  }, [])

  // Connect to consultation
  const connect = async () => {
    setIsConnecting(true)
    setDoctorState('connecting')
    setStatusText('Connecting to Dr. MedAssist...')

    try {
      // Initialize audio first
      const audioReady = await initRecordingAudio()
      if (!audioReady) {
        setIsConnecting(false)
        setDoctorState('idle')
        return
      }

      // Start a new session
      const response = await fetch('/api/consult/start', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('Failed to start session')
      }

      const data = await response.json()
      setSessionId(data.session_id)
      console.log('Session started:', data.session_id)

      // Connect WebSocket
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/voice/${data.session_id}`
      console.log('Connecting to WebSocket:', wsUrl)

      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        setIsConnecting(false)
        setDoctorState('thinking')
        setStatusText('Connected! Dr. MedAssist is preparing...')

        // Start recording immediately
        setTimeout(() => {
          startRecording()
        }, 500)
      }

      ws.onmessage = (event) => {
        // Handle binary audio data
        if (event.data instanceof ArrayBuffer) {
          playAudioChunk(event.data)
          return
        }

        // Handle JSON messages
        try {
          const message = JSON.parse(event.data)
          console.log('WS message:', message.type, message)

          switch (message.type) {
            case 'ready':
              setStatusText('Dr. MedAssist is ready')
              if (message.fields?.length > 0) {
                setFields(message.fields.map((f: any) => ({
                  field_name: f.field_name || f.name,
                  label: f.label,
                  value: f.value,
                  confirmed: f.confirmed || false
                })))
              }
              break

            case 'audio':
              // Base64 encoded audio fallback
              if (message.data) {
                const binaryString = atob(message.data)
                const bytes = new Uint8Array(binaryString.length)
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i)
                }
                playAudioChunk(bytes.buffer)
              }
              break

            case 'transcript':
              if (message.text) {
                setTranscripts(prev => [...prev, {
                  role: message.role || 'assistant',
                  text: message.text
                }])
              }
              break

            case 'field_extracted':
              setPendingField({
                field_name: message.field_name,
                label: message.label,
                value: message.value
              })
              setEditValue(message.value)
              break

            case 'field_confirmed':
            case 'field_updated':
              setFields(prev => {
                const existing = prev.find(f => f.field_name === message.field_name)
                if (existing) {
                  return prev.map(f =>
                    f.field_name === message.field_name
                      ? { ...f, value: message.value || f.value, confirmed: true }
                      : f
                  )
                }
                return [...prev, {
                  field_name: message.field_name,
                  label: message.label || message.field_name,
                  value: message.value,
                  confirmed: true
                }]
              })
              setPendingField(null)
              break

            case 'emergency':
              setStatusText(`⚠️ EMERGENCY: ${message.reason}`)
              setDoctorState('idle')
              break

            case 'completed':
              setStatusText('Consultation completed!')
              setDoctorState('idle')
              stopRecording()
              break

            case 'error':
              console.error('Server error:', message.message)
              setStatusText(`Error: ${message.message}`)
              break
          }
        } catch (e) {
          console.error('Error parsing message:', e)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setStatusText('Connection error')
        setDoctorState('idle')
      }

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason)
        setIsConnected(false)
        setIsRecording(false)
        setDoctorState('idle')
        if (event.code !== 1000) {
          setStatusText(`Disconnected: ${event.reason || 'Connection lost'}`)
        }
      }

      wsRef.current = ws

    } catch (error) {
      console.error('Connection error:', error)
      setStatusText('Failed to connect')
      setIsConnecting(false)
      setDoctorState('idle')
    }
  }

  // Disconnect from consultation
  const disconnect = () => {
    stopRecording()

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected')
      wsRef.current = null
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    if (playbackContextRef.current) {
      playbackContextRef.current.close()
      playbackContextRef.current = null
    }

    setIsConnected(false)
    setSessionId(null)
    setDoctorState('idle')
    setStatusText('Disconnected')
  }

  // Confirm pending field
  const confirmField = () => {
    if (!pendingField || !wsRef.current) return

    wsRef.current.send(JSON.stringify({
      type: 'confirm_field',
      field_name: pendingField.field_name
    }))

    setFields(prev => [...prev, {
      ...pendingField,
      confirmed: true
    }])
    setPendingField(null)
    setIsEditing(false)
  }

  // Edit and confirm field
  const saveEditedField = () => {
    if (!pendingField || !wsRef.current) return

    wsRef.current.send(JSON.stringify({
      type: 'edit_field',
      field_name: pendingField.field_name,
      label: pendingField.label,
      value: editValue
    }))

    setFields(prev => [...prev, {
      ...pendingField,
      value: editValue,
      confirmed: true
    }])
    setPendingField(null)
    setIsEditing(false)
  }

  // Get doctor avatar based on state
  const getDoctorAvatar = () => {
    switch (doctorState) {
      case 'speaking':
        return '🗣️'
      case 'listening':
        return '👂'
      case 'thinking':
      case 'connecting':
        return '🤔'
      default:
        return '👨‍⚕️'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Voice Consultation
          </h1>
          <p className="text-gray-600">
            Speak naturally with Dr. MedAssist AI
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Doctor */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            {/* Doctor Avatar */}
            <div className="flex flex-col items-center mb-6">
              <div className={`text-8xl mb-4 transition-transform duration-300 ${
                doctorState === 'speaking' ? 'animate-pulse scale-110' : ''
              } ${doctorState === 'listening' ? 'scale-105' : ''}`}>
                {getDoctorAvatar()}
              </div>
              <h2 className="text-xl font-semibold text-gray-800">Dr. MedAssist</h2>
              <p className={`text-sm mt-1 ${
                doctorState === 'speaking' ? 'text-green-600' :
                doctorState === 'listening' ? 'text-blue-600' :
                doctorState === 'connecting' ? 'text-yellow-600' :
                'text-gray-500'
              }`}>
                {statusText}
              </p>

              {/* Live indicator */}
              {isConnected && (
                <div className="flex items-center mt-2 space-x-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  <span className="text-xs text-red-600 font-medium">LIVE</span>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex justify-center space-x-4">
              {!isConnected ? (
                <button
                  onClick={connect}
                  disabled={isConnecting}
                  className="px-8 py-3 bg-green-500 text-white rounded-full font-semibold hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                >
                  {isConnecting ? 'Connecting...' : 'Start Consultation'}
                </button>
              ) : (
                <button
                  onClick={disconnect}
                  className="px-8 py-3 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 transition-colors shadow-lg"
                >
                  End Consultation
                </button>
              )}
            </div>

            {/* Recording indicator */}
            {isRecording && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center px-4 py-2 bg-blue-100 rounded-full">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></span>
                  <span className="text-sm text-blue-700">Microphone active</span>
                </div>
              </div>
            )}

            {/* Transcript */}
            <div className="mt-6">
              <h3 className="font-semibold text-gray-700 mb-3">Conversation</h3>
              <div className="bg-gray-50 rounded-lg p-4 h-48 overflow-y-auto space-y-2">
                {transcripts.length === 0 ? (
                  <p className="text-gray-400 text-center italic">
                    Conversation will appear here...
                  </p>
                ) : (
                  transcripts.map((t, i) => (
                    <div key={i} className={`p-2 rounded ${
                      t.role === 'assistant'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      <span className="font-medium">
                        {t.role === 'assistant' ? 'Dr. MedAssist: ' : 'You: '}
                      </span>
                      {t.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Notes */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
              <span className="text-2xl mr-2">📋</span>
              Doctor's Notes
            </h3>

            {/* Pending confirmation */}
            {pendingField && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 mb-2">
                  Please confirm this information:
                </p>
                <p className="font-medium text-gray-800">{pendingField.label}</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full mt-2 p-2 border rounded"
                  />
                ) : (
                  <p className="text-gray-600 mt-1">{pendingField.value}</p>
                )}
                <div className="flex space-x-2 mt-3">
                  <button
                    onClick={isEditing ? saveEditedField : confirmField}
                    className="px-4 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                  >
                    {isEditing ? 'Save' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="px-4 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    {isEditing ? 'Cancel' : 'Edit'}
                  </button>
                </div>
              </div>
            )}

            {/* Collected fields */}
            <div className="space-y-3">
              {fields.length === 0 ? (
                <p className="text-gray-400 text-center py-8">
                  Information collected during the consultation will appear here
                </p>
              ) : (
                fields.map((field, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      {field.label}
                    </p>
                    <p className="text-gray-800 font-medium">{field.value}</p>
                    {field.confirmed && (
                      <span className="text-xs text-green-600">✓ Confirmed</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Audio info */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Audio: 16kHz PCM (input) / 24kHz PCM (output) • Powered by Gemini Live API</p>
        </div>
      </div>
    </div>
  )
}

export default VoiceConsult
