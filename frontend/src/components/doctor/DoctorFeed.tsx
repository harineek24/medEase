import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  FileText,
  ChevronRight,
  Loader2,
  AlertTriangle,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/api";
import StoryModal, { type StoryPatient } from "./StoryModal";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Story {
  patient_id: number;
  patient_name: string;
  latest_entry: string | null;
  latest_mood: string | null;
  today_entries: Array<{
    entry_text: string;
    mood: string;
    symptoms: string[];
    recorded_at: string;
  }>;
  viewed: boolean;
}

interface Appointment {
  id: number;
  patient_name: string;
  time: string;
  service: string;
  status: "scheduled" | "completed" | "no_show";
}

interface Summary {
  id: number;
  patient_name: string;
  diagnosis_snippet: string;
  date: string;
  content: string;
}

interface DoctorFeedProps {
  doctorId: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const statusStyles: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  no_show: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  no_show: "No Show",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Section Wrapper                                                   */
/* ------------------------------------------------------------------ */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        {icon}
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function DoctorFeed({ doctorId }: DoctorFeedProps) {
  /* State */
  const [stories, setStories] = useState<Story[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);

  const [loadingStories, setLoadingStories] = useState(true);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [loadingSummaries, setLoadingSummaries] = useState(true);

  const [errorStories, setErrorStories] = useState<string | null>(null);
  const [errorAppts, setErrorAppts] = useState<string | null>(null);
  const [errorSummaries, setErrorSummaries] = useState<string | null>(null);

  const [selectedStory, setSelectedStory] = useState<StoryPatient | null>(null);
  const [expandedSummary, setExpandedSummary] = useState<number | null>(null);

  const storiesRef = useRef<HTMLDivElement>(null);

  /* Fetchers */
  const fetchStories = useCallback(async () => {
    setLoadingStories(true);
    setErrorStories(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/doctor/${doctorId}/feed/stories`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setStories(Array.isArray(data) ? data : data.stories ?? []);
    } catch (err: any) {
      setErrorStories(err.message || "Failed to load stories");
    } finally {
      setLoadingStories(false);
    }
  }, [doctorId]);

  const fetchAppointments = useCallback(async () => {
    setLoadingAppts(true);
    setErrorAppts(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/doctor/${doctorId}/feed/appointments`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setAppointments(Array.isArray(data) ? data : data.appointments ?? []);
    } catch (err: any) {
      setErrorAppts(err.message || "Failed to load appointments");
    } finally {
      setLoadingAppts(false);
    }
  }, [doctorId]);

  const fetchSummaries = useCallback(async () => {
    setLoadingSummaries(true);
    setErrorSummaries(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/doctor/${doctorId}/feed/summaries`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const list: Summary[] = Array.isArray(data) ? data : data.summaries ?? [];
      list.sort((a, b) => a.patient_name.localeCompare(b.patient_name));
      setSummaries(list);
    } catch (err: any) {
      setErrorSummaries(err.message || "Failed to load summaries");
    } finally {
      setLoadingSummaries(false);
    }
  }, [doctorId]);

  useEffect(() => {
    fetchStories();
    fetchAppointments();
    fetchSummaries();
  }, [fetchStories, fetchAppointments, fetchSummaries]);

  /* Story click */
  const openStory = (story: Story) => {
    setSelectedStory({
      patient_id: story.patient_id,
      patient_name: story.patient_name,
      latest_entry: story.latest_entry,
      latest_mood: story.latest_mood,
      today_entries: story.today_entries,
    });
    // Mark viewed locally
    setStories((prev) =>
      prev.map((s) => (s.patient_id === story.patient_id ? { ...s, viewed: true } : s))
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Render helpers                                                  */
  /* ---------------------------------------------------------------- */

  const LoadingBlock = () => (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-6 w-6 animate-spin text-[#45BFD3]" />
    </div>
  );

  const ErrorBlock = ({ msg }: { msg: string }) => (
    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {msg}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-8">
      {/* ── Stories ── */}
      <Section title="Patient Stories" icon={<User className="h-5 w-5 text-[#45BFD3]" />}>
        {loadingStories ? (
          <LoadingBlock />
        ) : errorStories ? (
          <ErrorBlock msg={errorStories} />
        ) : stories.length === 0 ? (
          <p className="text-sm text-gray-400 px-1">No patient stories today.</p>
        ) : (
          <div
            ref={storiesRef}
            className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-200"
          >
            {stories.map((story) => (
              <button
                key={story.patient_id}
                onClick={() => openStory(story)}
                className="flex flex-col items-center gap-1.5 shrink-0 group"
              >
                <div
                  className={cn(
                    "rounded-full p-[3px] transition-shadow",
                    story.viewed
                      ? "bg-gradient-to-tr from-gray-300 to-gray-400"
                      : "bg-gradient-to-tr from-green-400 to-[#45BFD3]"
                  )}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-sm font-semibold text-gray-700 group-hover:bg-gray-50 transition-colors">
                    {initials(story.patient_name)}
                  </div>
                </div>
                <span className="text-xs text-gray-600 max-w-[72px] truncate">
                  {story.patient_name.split(" ")[0]}
                </span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* ── Today's Appointments ── */}
      <Section title="Today's Appointments" icon={<Calendar className="h-5 w-5 text-[#45BFD3]" />}>
        {loadingAppts ? (
          <LoadingBlock />
        ) : errorAppts ? (
          <ErrorBlock msg={errorAppts} />
        ) : appointments.length === 0 ? (
          <p className="text-sm text-gray-400 px-1">No appointments today.</p>
        ) : (
          <div className="space-y-3">
            {appointments.map((appt) => (
              <motion.div
                key={appt.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                {/* Time */}
                <div className="flex flex-col items-center shrink-0 w-16">
                  <Clock className="h-4 w-4 text-gray-400 mb-1" />
                  <span className="text-sm font-semibold text-gray-900">
                    {new Date(appt.time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* Divider */}
                <div className="w-px h-10 bg-gray-200" />

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{appt.patient_name}</p>
                  <p className="text-sm text-gray-500 truncate">{appt.service}</p>
                </div>

                {/* Status badge */}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium shrink-0",
                    statusStyles[appt.status] ?? "bg-gray-100 text-gray-600"
                  )}
                >
                  {statusLabels[appt.status] ?? appt.status}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Patient Summaries ── */}
      <Section title="Patient Summaries" icon={<FileText className="h-5 w-5 text-[#45BFD3]" />}>
        {loadingSummaries ? (
          <LoadingBlock />
        ) : errorSummaries ? (
          <ErrorBlock msg={errorSummaries} />
        ) : summaries.length === 0 ? (
          <p className="text-sm text-gray-400 px-1">No patient summaries available.</p>
        ) : (
          <div className="space-y-4">
            {summaries.map((summary) => {
              const isExpanded = expandedSummary === summary.id;
              return (
                <motion.div
                  key={summary.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden"
                >
                  {/* Header (like Instagram post header) */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#45BFD3]/10 text-xs font-semibold text-[#45BFD3]">
                      {initials(summary.patient_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {summary.patient_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(summary.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-4 py-3">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {summary.diagnosis_snippet}
                    </p>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          key="expanded"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <p className="mt-3 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                            {summary.content}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button
                      onClick={() =>
                        setExpandedSummary(isExpanded ? null : summary.id)
                      }
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#45BFD3] hover:text-[#3baab8] transition-colors"
                    >
                      {isExpanded ? "Show less" : "Read more"}
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          isExpanded && "rotate-90"
                        )}
                      />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Story Modal ── */}
      <AnimatePresence>
        {selectedStory && (
          <StoryModal
            patient={selectedStory}
            onClose={() => setSelectedStory(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
