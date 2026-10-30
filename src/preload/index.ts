import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type AnswerDelta,
  type AnswerDone,
  type AnswerEntry,
  type ApiKeysInput,
  type DetectedQuestion,
  type HotkeyAction,
  type KeyStatus,
  type KeyTestResult,
  type ListenStatus,
  type OverlayState,
  type Profile,
  type Session,
  type SessionSummary,
  type Settings,
  type Toast,
  type TranscriptSegment
} from '@shared/types'

/** invoke() with the "Error invoking remote method ..." prefix stripped from errors. */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  }
}

function subscribe<T>(channel: string) {
  return (cb: (payload: T) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

const api = {
  settings: {
    get: () => invoke<Settings>(IPC.settingsGet),
    update: (patch: Partial<Settings>) => invoke<Settings>(IPC.settingsUpdate, patch)
  },
  keys: {
    status: () => invoke<KeyStatus>(IPC.keysStatus),
    set: (keys: ApiKeysInput) => invoke<KeyStatus>(IPC.keysSet, keys),
    test: () => invoke<KeyTestResult>(IPC.keysTest)
  },
  profiles: {
    list: () => invoke<Profile[]>(IPC.profilesList),
    save: (p: Partial<Profile>) => invoke<Profile>(IPC.profilesSave, p),
    delete: (id: string) => invoke<void>(IPC.profilesDelete, id),
    importFile: () => invoke<{ fileName: string; text: string } | null>(IPC.profilesImportFile)
  },
  listen: {
    start: () => invoke<ListenStatus>(IPC.listenStart),
    stop: () => invoke<ListenStatus>(IPC.listenStop),
    status: () => invoke<ListenStatus>(IPC.listenStatus),
    sendAudio: (chunk: ArrayBuffer) => ipcRenderer.send(IPC.audioChunk, chunk)
  },
  ai: {
    assist: () => invoke<void>(IPC.aiAssist),
    screenshot: () => invoke<void>(IPC.aiScreenshot),
    ask: (text: string) => invoke<void>(IPC.aiAsk, text),
    followups: () => invoke<void>(IPC.aiFollowups),
    recap: () => invoke<void>(IPC.aiRecap),
    shorter: (answerText: string) => invoke<void>(IPC.aiShorter, answerText),
    cancel: () => invoke<void>(IPC.aiCancel)
  },
  sessions: {
    list: () => invoke<SessionSummary[]>(IPC.sessionsList),
    get: (id: string) => invoke<Session | null>(IPC.sessionsGet, id),
    delete: (id: string) => invoke<void>(IPC.sessionsDelete, id),
    report: (id: string) => invoke<string>(IPC.sessionsReport, id)
  },
  overlay: {
    state: () => invoke<OverlayState>(IPC.overlayState),
    setOpacity: (v: number) => invoke<OverlayState>(IPC.overlaySetOpacity, v),
    toggleClickThrough: () => invoke<OverlayState>(IPC.overlayToggleClickThrough),
    resize: (height: number) => invoke<void>(IPC.overlayResize, height),
    hide: () => invoke<void>(IPC.overlayHide)
  },
  app: {
    openDashboard: () => invoke<void>(IPC.dashboardOpen),
    quit: () => invoke<void>(IPC.appQuit)
  },
  on: {
    transcript: subscribe<TranscriptSegment>(IPC.evTranscript),
    question: subscribe<DetectedQuestion>(IPC.evQuestion),
    answerStart: subscribe<AnswerEntry>(IPC.evAnswerStart),
    answerDelta: subscribe<AnswerDelta>(IPC.evAnswerDelta),
    answerDone: subscribe<AnswerDone>(IPC.evAnswerDone),
    listenStatus: subscribe<ListenStatus>(IPC.evListenStatus),
    hotkey: subscribe<HotkeyAction>(IPC.evHotkey),
    overlayState: subscribe<OverlayState>(IPC.evOverlayState),
    settings: subscribe<Settings>(IPC.evSettings),
    sessionsChanged: subscribe<void>(IPC.evSessionsChanged),
    toast: subscribe<Toast>(IPC.evToast)
  }
}

export type KatotoApi = typeof api

contextBridge.exposeInMainWorld('Katoto', api)
