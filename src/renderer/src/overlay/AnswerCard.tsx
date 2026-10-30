import { useState } from 'react'
import type { AnswerKind } from '@shared/types'
import { Markdown } from '../components/Markdown'
import { questionTypeLabel } from '../lib/format'
import { useOverlay } from './store'

const api = window.Katoto

const KIND_LABEL: Record<AnswerKind, string> = {
  question: 'Question',
  assist: 'Suggestion',
  screenshot: 'Screen',
  ask: 'You asked',
  followups: 'Follow-ups',
  recap: 'Recap',
  shorter: 'Shorter'
}

function Thinking(): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 py-1 text-xs text-neutral-400">
      <span className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
      Thinking…
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  const keys = useOverlay((s) => s.keys)
  const status = useOverlay((s) => s.status)
  const missing = keys && (!keys.anthropic || !keys.deepgram)
  if (missing) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-neutral-300">
        <span>Add your Anthropic and Deepgram API keys to get started.</span>
        <button
          onClick={() => void api.app.openDashboard()}
          className="no-drag shrink-0 rounded-full bg-violet-500 px-3 py-1 font-medium text-white hover:bg-violet-400"
        >
          Open dashboard
        </button>
      </div>
    )
  }
  return (
    <div className="px-4 py-3 text-xs leading-relaxed text-neutral-400">
      {status.state === 'listening'
        ? 'Listening. When the interviewer asks a question, a suggested answer appears here automatically.'
        : 'Press Listen (Ctrl+Shift+L) when the call starts. Ctrl+Enter asks what to say, Ctrl+Shift+S solves what is on screen.'}
    </div>
  )
}

/** Shown when auto-answer is off and a detected question has no answer yet. */
function PendingQuestion(): React.JSX.Element | null {
  const autoAnswer = useOverlay((s) => s.settings?.autoAnswer ?? true)
  const questions = useOverlay((s) => s.questions)
  const answers = useOverlay((s) => s.answers)
  const q = questions[questions.length - 1]
  if (autoAnswer || !q) return null
  const answered = answers.some((a) => a.questionId === q.id || a.title === q.text)
  if (answered) return null
  return (
    <div className="flex items-start gap-3 border-b border-white/5 bg-violet-500/10 px-4 py-2.5">
      <div className="flex-1 text-xs">
        <div className="mb-0.5 text-[10px] uppercase tracking-wide text-violet-300">Question detected · {questionTypeLabel(q.type)}</div>
        <div className="text-neutral-100">{q.text}</div>
      </div>
      <button
        onClick={() => void api.ai.ask(q.text)}
        className="no-drag shrink-0 rounded-full bg-violet-500 px-3 py-1 text-xs font-medium text-white hover:bg-violet-400"
      >
        Answer
      </button>
    </div>
  )
}

export function AnswerCard(): React.JSX.Element {
  const answers = useOverlay((s) => s.answers)
  const viewIndex = useOverlay((s) => s.viewIndex)
  const setView = useOverlay((s) => s.setView)
  const [copied, setCopied] = useState(false)

  if (!answers.length) {
    return (
      <>
        <PendingQuestion />
        <EmptyState />
      </>
    )
  }

  const idx = viewIndex ?? answers.length - 1
  const a = answers[idx]
  const streaming = !a.done

  const copy = (): void => {
    void navigator.clipboard.writeText(a.text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }

  const btn = 'no-drag rounded-full px-2.5 py-1 text-[11px] text-neutral-300 hover:bg-white/10 hover:text-white disabled:opacity-30'

  return (
    <div className="flex flex-col">
      <PendingQuestion />
      <div className="flex items-start gap-2 px-4 pt-3">
        <span className="mt-0.5 shrink-0 rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200">
          {KIND_LABEL[a.kind]}
        </span>
        <div className="line-clamp-2 flex-1 text-xs text-neutral-300">{a.title}</div>
        {answers.length > 1 && (
          <div className="flex shrink-0 items-center gap-0.5 text-[11px] text-neutral-400">
            <button className={btn} disabled={idx === 0} onClick={() => setView(idx - 1)} title="Previous answer">
              ‹
            </button>
            <span>
              {idx + 1}/{answers.length}
            </span>
            <button className={btn} disabled={idx === answers.length - 1} onClick={() => setView(idx + 1)} title="Next answer">
              ›
            </button>
          </div>
        )}
      </div>
      <div className="scroll-thin max-h-[420px] overflow-y-auto px-4 py-2">
        {a.text ? <Markdown text={a.text} streaming={streaming} /> : streaming ? <Thinking /> : null}
        {a.error && <div className="mt-1 text-xs text-red-300">{a.error}</div>}
      </div>
      <div className="flex items-center gap-1 px-3 pb-2">
        {streaming ? (
          <button className={btn} onClick={() => void api.ai.cancel()}>
            Stop (Esc)
          </button>
        ) : (
          <>
            <button className={btn} disabled={!a.text} onClick={() => void api.ai.shorter(a.text)}>
              Shorter
            </button>
            <button className={btn} disabled={!a.text} onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </>
        )}
        <div className="flex-1" />
        <button className={btn} onClick={() => useOverlay.getState().clearAnswers()} title="Clear (Ctrl+R)">
          Clear
        </button>
      </div>
    </div>
  )
}
