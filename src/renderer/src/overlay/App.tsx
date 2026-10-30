import { useEffect, useLayoutEffect, useRef } from 'react'
import type { HotkeyAction } from '@shared/types'
import { Toasts } from '../components/Toasts'
import { AudioCapture } from './audio/capture'
import { useOverlay } from './store'
import { ControlBar } from './ControlBar'
import { AnswerCard } from './AnswerCard'
import { TranscriptPane } from './TranscriptPane'
import { AskInput } from './AskInput'

const api = window.Katoto
const capture = new AudioCapture()
let busy = false

async function startListening(): Promise<void> {
  if (busy) return
  busy = true
  const { settings, notify } = useOverlay.getState()
  try {
    // Open the Deepgram stream first so no audio is lost.
    const status = await api.listen.start()
    if (status.state !== 'listening') {
      if (status.message) notify('error', status.message)
      return
    }
    try {
      const res = await capture.start(
        { captureMic: settings?.captureMic ?? true, micDeviceId: settings?.micDeviceId ?? null },
        {
          onChunk: (pcm) => api.listen.sendAudio(pcm),
          onLevels: (system, mic) => useOverlay.setState({ levels: [system, mic] }),
          onEnded: (reason) => {
            notify('error', reason)
            void stopListening()
          }
        }
      )
      if (res.micError) notify('error', res.micError)
    } catch (err) {
      notify('error', (err as Error).message)
      await api.listen.stop()
    }
  } finally {
    busy = false
  }
}

async function stopListening(): Promise<void> {
  if (busy) return
  busy = true
  try {
    await capture.stop()
    await api.listen.stop()
  } finally {
    busy = false
  }
}

function toggleListening(): void {
  const { state } = useOverlay.getState().status
  if (state === 'idle' || state === 'error') void startListening()
  else void stopListening()
}

export function App(): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const askRef = useRef<HTMLInputElement>(null)
  const expanded = useOverlay((s) => s.expanded)
  const showTranscript = useOverlay((s) => s.showTranscript)
  const clickThrough = useOverlay((s) => s.overlay.clickThrough)
  const toast = useOverlay((s) => s.toast)

  useEffect(() => {
    const store = useOverlay.getState()
    const refreshKeys = (): void => {
      void api.keys.status().then((keys) => useOverlay.setState({ keys }))
    }
    void Promise.all([api.settings.get(), api.overlay.state(), api.listen.status()]).then(
      ([settings, overlay, status]) => {
        store.set({ settings, overlay })
        store.setStatus(status)
      }
    )
    refreshKeys()

    const onHotkey = (action: HotkeyAction): void => {
      if (action === 'toggle-listen') toggleListening()
      else if (action === 'focus-ask') {
        useOverlay.setState({ expanded: true })
        setTimeout(() => askRef.current?.focus(), 50)
      } else if (action === 'clear') useOverlay.getState().clearAnswers()
    }

    const offs = [
      api.on.transcript((seg) => useOverlay.getState().upsertSegment(seg)),
      api.on.question((q) => useOverlay.getState().addQuestion(q)),
      api.on.answerStart((a) => useOverlay.getState().startAnswer(a)),
      api.on.answerDelta((d) => useOverlay.getState().appendAnswer(d.id, d.delta)),
      api.on.answerDone((d) => useOverlay.getState().finishAnswer(d.id, d.error)),
      api.on.listenStatus((status) => {
        useOverlay.getState().setStatus(status)
        if ((status.state === 'idle' || status.state === 'error') && capture.active) void capture.stop()
        if (status.state === 'error' && status.message) useOverlay.getState().notify('error', status.message)
      }),
      api.on.overlayState((overlay) => useOverlay.setState({ overlay })),
      api.on.settings((settings) => {
        useOverlay.setState({ settings })
        refreshKeys()
      }),
      api.on.hotkey(onHotkey)
    ]
    return () => offs.forEach((off) => off())
  }, [])

  // Local shortcuts while the overlay has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        useOverlay.getState().clearAnswers()
      } else if (e.key === 'Escape') {
        const { answers } = useOverlay.getState()
        if (answers.some((a) => !a.done)) void api.ai.cancel()
        else (document.activeElement as HTMLElement | null)?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The window is sized to fit this content.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(() => void api.overlay.resize(el.getBoundingClientRect().height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={rootRef} className="flex w-full flex-col gap-2 p-2 text-neutral-100">
      <ControlBar onToggleListen={toggleListening} />
      {expanded && (
        <div className="glass flex flex-col overflow-hidden rounded-2xl">
          <AnswerCard />
          {showTranscript && <TranscriptPane />}
          <AskInput inputRef={askRef} />
        </div>
      )}
      {clickThrough && (
        <div className="self-center rounded-full bg-black/60 px-3 py-1 text-[11px] text-neutral-300">
          Click-through on · Ctrl+Shift+M to interact
        </div>
      )}
      <Toasts extra={toast} />
    </div>
  )
}
