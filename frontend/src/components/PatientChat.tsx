import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface PatientChatProps {
  summaryText: string
  medications: any[]
  testResults: any[]
  interactions: any[]
  patientName?: string
}

function PatientChat({ summaryText, medications, testResults, interactions, patientName }: PatientChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId] = useState(() => `patient-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Add welcome message when chat opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Hi! I'm MedAssist, your personal health guide. I've reviewed ${patientName ? patientName + "'s" : "your"} medical summary and I'm here to help you understand:\n\n• Your medications and how they work\n• What your test results mean\n• Any potential drug interactions\n• Next steps and what to watch for\n\nWhat would you like to know?`,
        timestamp: new Date().toISOString()
      }])
    }
  }, [isOpen, patientName])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('http://localhost:8000/api/chat/patient', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          session_id: sessionId,
          summary_text: summaryText,
          medications: medications,
          test_results: testResults,
          interactions: interactions
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.response,
          timestamp: data.timestamp
        }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "I'm sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString()
        }])
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm sorry, I couldn't connect to the server. Please check your connection.",
        timestamp: new Date().toISOString()
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const suggestedQuestions = [
    "What are the side effects of my medications?",
    "Explain my test results simply",
    "Are there any food interactions?",
    "What should I watch out for?"
  ]

  return (
    <div className="patient-chat-container">
      {/* Chat Toggle Button */}
      <button
        className={`patient-chat-toggle ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Ask questions about your summary"
      >
        {isOpen ? '✕' : '💬'} {!isOpen && 'Ask AI'}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="patient-chat-panel">
          <div className="patient-chat-header">
            <div className="chat-header-info">
              <span className="chat-icon">🤖</span>
              <div>
                <h4>MedAssist</h4>
                <span className="chat-subtitle">Ask about your summary</span>
              </div>
            </div>
            <button className="chat-minimize" onClick={() => setIsOpen(false)}>−</button>
          </div>

          <div className="patient-chat-messages">
            {messages.map((msg, index) => (
              <div key={index} className={`chat-message ${msg.role}`}>
                <div className="message-content">
                  {msg.content.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="chat-message assistant">
                <div className="message-content typing">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            )}

            {/* Suggested Questions (only show when few messages) */}
            {messages.length <= 1 && !isLoading && (
              <div className="suggested-questions">
                <p className="suggested-label">Try asking:</p>
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    className="suggested-btn"
                    onClick={() => {
                      setInput(q)
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="patient-chat-input">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about your health..."
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="send-btn"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PatientChat
