import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

function GeneralChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId] = useState(() => `general-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Add welcome message on mount
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: `Hello! I'm MedAssist, your AI health assistant. I can help you with:

• **Search patients** - Find information about specific patients
• **Compare records** - Look at trends across multiple patients
• **Medication questions** - General information about drugs and interactions
• **Health education** - Understand medical terms and conditions

What would you like to know?`,
      timestamp: new Date().toISOString()
    }])
  }, [])

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
      const response = await fetch('http://localhost:8000/api/chat/general', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          session_id: sessionId
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

  const suggestedQueries = [
    "Show me all patients",
    "Which patients have high risk interactions?",
    "What are the most common medications?",
    "Explain what blood pressure medications do",
    "Find patients taking diabetes medication"
  ]

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: "Chat cleared. How can I help you?",
      timestamp: new Date().toISOString()
    }])
  }

  return (
    <div className="general-chat">
      <div className="general-chat-header">
        <div className="chat-header-left">
          <span className="chat-avatar">🤖</span>
          <div>
            <h2>MedAssist AI</h2>
            <span className="chat-status">
              <span className="status-dot"></span>
              Online - Ready to help
            </span>
          </div>
        </div>
        <button className="clear-chat-btn" onClick={clearChat}>
          🗑️ Clear Chat
        </button>
      </div>

      <div className="general-chat-body">
        {/* Suggested Queries Sidebar */}
        <div className="chat-sidebar">
          <h4>Quick Queries</h4>
          <div className="suggested-list">
            {suggestedQueries.map((query, i) => (
              <button
                key={i}
                className="suggested-query"
                onClick={() => setInput(query)}
              >
                {query}
              </button>
            ))}
          </div>

          <div className="chat-tips">
            <h4>Tips</h4>
            <ul>
              <li>Ask about specific patients by name</li>
              <li>Request medication comparisons</li>
              <li>Ask about drug interactions</li>
              <li>Get explanations of medical terms</li>
            </ul>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="chat-main">
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <div key={index} className={`general-message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className="message-bubble">
                  <div className="message-content">
                    {msg.content.split('\n').map((line, i) => {
                      // Handle markdown-style bold
                      const formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      return <p key={i} dangerouslySetInnerHTML={{ __html: formattedLine }} />
                    })}
                  </div>
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="general-message assistant">
                <div className="message-avatar">🤖</div>
                <div className="message-bubble">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <div className="chat-input-container">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about your healthcare data..."
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="send-button"
              >
                {isLoading ? '...' : '➤'}
              </button>
            </div>
            <p className="input-hint">Press Enter to send • Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GeneralChat
