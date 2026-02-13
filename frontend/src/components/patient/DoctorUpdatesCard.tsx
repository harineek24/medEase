import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../api'
import { Stethoscope, Clock, MessageSquare } from 'lucide-react'

interface DoctorReply {
  id: number
  doctor_name: string
  reply_text: string
  original_update: string
  audio_url: string | null
  audio_duration: number | null
  created_at: string
}

interface DoctorUpdatesCardProps {
  patientId: number
}

export default function DoctorUpdatesCard({ patientId }: DoctorUpdatesCardProps) {
  const [replies, setReplies] = useState<DoctorReply[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReplies = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/patient/${patientId}/doctor-replies`)
      if (res.ok) {
        const data = await res.json()
        setReplies(data.replies || [])
      }
    } catch (err) {
      console.error('Error fetching doctor replies:', err)
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => { fetchReplies() }, [fetchReplies])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return `Today at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-[#45BFD3]/10 flex items-center justify-center">
          <Stethoscope className="w-4 h-4 text-[#45BFD3]" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">Doctor Updates</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 border-2 border-[#45BFD3] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : replies.length === 0 ? (
        <div className="text-center py-6">
          <Stethoscope className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">Updates from your doctor will appear here</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {replies.map(reply => (
            <div key={reply.id} className="rounded-xl border border-gray-100 overflow-hidden">
              {/* Original update context */}
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Your Update</p>
                <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{reply.original_update}</p>
              </div>
              {/* Doctor reply */}
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-5 h-5 rounded-full bg-[#45BFD3] flex items-center justify-center">
                    <MessageSquare className="w-2.5 h-2.5 text-white" />
                  </div>
                  <span className="text-xs font-medium text-gray-900">Dr. {reply.doctor_name}</span>
                  <span className="text-[10px] text-gray-400 ml-auto flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDate(reply.created_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{reply.reply_text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
