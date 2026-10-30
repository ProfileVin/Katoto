export type Speaker = 'interviewer' | 'me'

export interface TranscriptSegment {
  id: string
  speaker: Speaker
  text: string
  /** epoch ms when the utterance started */
  ts: number
  final: boolean
}

export type QuestionType = 'behavioral' | 'technical' | 'coding' | 'system_design' | 'other'

export interface DetectedQuestion {
  id: string
  text: string
  type: QuestionType
  ts: number
}

export type AnswerKind = 'question' | 'assist' | 'screenshot' | 'ask' | 'followups' | 'recap' | 'shorter'

export interface AnswerEntry {
  id: string
  kind: AnswerKind
  /** Short label shown above the answer (the question, the typed prompt, ...) */
  title: string
  questionId?: string
  text: string
  ts: number
  done: boolean
  error?: string
}

export interface Profile {
  id: string
  name: string
  resume: string
  jobDescription: string
  company: string
  instructions: string
  updatedAt: string
}

export type AnswerMode = 'fast' | 'thorough'

export interface Settings {
  overlayOpacity: number
  contentProtection: boolean
  autoAnswer: boolean
  answerMode: AnswerMode
  activeProfileId: string | null
  answerModel: string
  detectModel: string
  micDeviceId: string | null
  captureMic: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  overlayOpacity: 0.92,
  contentProtection: true,
  autoAnswer: true,
  answerMode: 'fast',
  activeProfileId: null,
  answerModel: 'claude-sonnet-5',
  detectModel: 'claude-haiku-4-5',
  micDeviceId: null,
  captureMic: true
}

export interface KeyStatus {
  anthropic: boolean
  deepgram: boolean
  encryptionAvailable: boolean
}

export interface ApiKeysInput {
  anthropic?: string
  deepgram?: string
}

export interface KeyTestResult {
  anthropic?: string
  deepgram?: string
}

export interface Session {
  id: string
  startedAt: string
  endedAt?: string
  profileId: string | null
  profileName: string
  transcript: TranscriptSegment[]
  questions: DetectedQuestion[]
  answers: AnswerEntry[]
  report?: string
}

export interface SessionSummary {
  id: string
  startedAt: string
  endedAt?: string
  profileName: string
  questionCount: number
  durationSec: number
  hasReport: boolean
}

export type ListenState = 'idle' | 'connecting' | 'listening' | 'reconnecting' | 'error'

export interface ListenStatus {
  state: ListenState
  message?: string
  sessionId?: string
}

export type HotkeyAction = 'toggle-listen' | 'assist' | 'screenshot' | 'clear' | 'focus-ask'

export interface OverlayState {
  clickThrough: boolean
  contentProtection: boolean
  opacity: number
}

export interface AnswerDelta {
  id: string
  delta: string
}

export interface AnswerDone {
  id: string
  error?: string
}

export interface Toast {
  level: 'info' | 'error'
  message: string
}

/** IPC channel names shared by main, preload and renderer. */
export const IPC = {
  // renderer -> main (invoke)
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  keysSet: 'keys:set',
  keysStatus: 'keys:status',
  keysTest: 'keys:test',
  profilesList: 'profiles:list',
  profilesSave: 'profiles:save',
  profilesDelete: 'profiles:delete',
  profilesImportFile: 'profiles:import-file',
  listenStart: 'listen:start',
  listenStop: 'listen:stop',
  listenStatus: 'listen:status',
  aiAssist: 'ai:assist',
  aiScreenshot: 'ai:screenshot',
  aiAsk: 'ai:ask',
  aiFollowups: 'ai:followups',
  aiRecap: 'ai:recap',
  aiShorter: 'ai:shorter',
  aiCancel: 'ai:cancel',
  sessionsList: 'sessions:list',
  sessionsGet: 'sessions:get',
  sessionsDelete: 'sessions:delete',
  sessionsReport: 'sessions:report',
  overlayState: 'overlay:state',
  overlaySetOpacity: 'overlay:set-opacity',
  overlayToggleClickThrough: 'overlay:toggle-click-through',
  overlayResize: 'overlay:resize',
  overlayHide: 'overlay:hide',
  dashboardOpen: 'dashboard:open',
  appQuit: 'app:quit',
  // renderer -> main (send, fire-and-forget)
  audioChunk: 'audio:chunk',
  // main -> renderer (events)
  evTranscript: 'ev:transcript',
  evQuestion: 'ev:question',
  evAnswerStart: 'ev:answer-start',
  evAnswerDelta: 'ev:answer-delta',
  evAnswerDone: 'ev:answer-done',
  evListenStatus: 'ev:listen-status',
  evHotkey: 'ev:hotkey',
  evOverlayState: 'ev:overlay-state',
  evSettings: 'ev:settings',
  evSessionsChanged: 'ev:sessions-changed',
  evToast: 'ev:toast'
} as const
