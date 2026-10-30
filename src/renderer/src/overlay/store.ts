import { create } from 'zustand'
import type {
  AnswerEntry,
  DetectedQuestion,
  KeyStatus,
  ListenStatus,
  OverlayState,
  Settings,
  Toast,
  TranscriptSegment
} from '@shared/types'

const MAX_SEGMENTS = 200

interface OverlayStore {
  segments: TranscriptSegment[]
  questions: DetectedQuestion[]
  answers: AnswerEntry[]
  /** Index of the answer on screen; null follows the newest one. */
  viewIndex: number | null
  status: ListenStatus
  listeningSince: number | null
  overlay: OverlayState
  settings: Settings | null
  keys: KeyStatus | null
  levels: [number, number]
  showTranscript: boolean
  expanded: boolean
  menuOpen: boolean
  /** Last renderer-side notification; a new object each time so effects re-fire. */
  toast: Toast | null

  notify(level: Toast['level'], message: string): void
  upsertSegment(seg: TranscriptSegment): void
  addQuestion(q: DetectedQuestion): void
  startAnswer(a: AnswerEntry): void
  appendAnswer(id: string, delta: string): void
  finishAnswer(id: string, error?: string): void
  setView(index: number | null): void
  clearAnswers(): void
  setStatus(s: ListenStatus): void
  set(partial: Partial<OverlayStore>): void
}

export const useOverlay = create<OverlayStore>((set, get) => ({
  segments: [],
  questions: [],
  answers: [],
  viewIndex: null,
  status: { state: 'idle' },
  listeningSince: null,
  overlay: { clickThrough: false, contentProtection: true, opacity: 0.92 },
  settings: null,
  keys: null,
  levels: [0, 0],
  showTranscript: true,
  expanded: true,
  menuOpen: false,
  toast: null,

  notify: (level, message) => set({ toast: { level, message } }),

  upsertSegment: (seg) =>
    set((s) => {
      const idx = s.segments.findIndex((x) => x.id === seg.id)
      if (idx >= 0) {
        const segments = s.segments.slice()
        segments[idx] = seg
        return { segments }
      }
      return { segments: [...s.segments, seg].slice(-MAX_SEGMENTS) }
    }),

  addQuestion: (q) => set((s) => ({ questions: [...s.questions, q].slice(-50) })),

  startAnswer: (a) => set((s) => ({ answers: [...s.answers, a].slice(-30), viewIndex: null, expanded: true })),

  appendAnswer: (id, delta) =>
    set((s) => ({ answers: s.answers.map((a) => (a.id === id ? { ...a, text: a.text + delta } : a)) })),

  finishAnswer: (id, error) =>
    set((s) => ({ answers: s.answers.map((a) => (a.id === id ? { ...a, done: true, error } : a)) })),

  setView: (index) => {
    const n = get().answers.length
    if (index === null || index >= n - 1) set({ viewIndex: null })
    else set({ viewIndex: Math.max(0, index) })
  },

  clearAnswers: () => set({ answers: [], questions: [], viewIndex: null }),

  setStatus: (status) =>
    set((s) => ({
      status,
      listeningSince:
        status.state === 'listening' || status.state === 'reconnecting' ? (s.listeningSince ?? Date.now()) : null,
      levels: status.state === 'listening' ? s.levels : [0, 0]
    })),

  set: (partial) => set(partial)
}))
