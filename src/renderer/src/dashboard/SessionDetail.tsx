import { useEffect, useState } from 'react'
import type { Session } from '@shared/types'
import { Markdown } from '../components/Markdown'
import { formatDateTime, formatDuration, questionTypeLabel } from '../lib/format'
import { Button } from './ui'

const api = window.Katoto

type Tab = 'report' | 'qa' | 'transcript'

export function SessionDetail({ id, onBack }: { id: string; onBack(): void }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [tab, setTab] = useState<Tab>('report')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api.sessions.get(id).then((s) => {
      setSession(s)
      if (s && !s.report) setTab('qa')
    })
  }, [id])

  const generate = async (): Promise<void> => {
    setGenerating(true)
    setError(null)
    try {
      const report = await api.sessions.report(id)
      setSession((s) => (s ? { ...s, report } : s))
      setTab('report')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!confirm('Delete this session permanently?')) return
    await api.sessions.delete(id)
    onBack()
  }

  if (!session) {
    return (
      <div className="px-8 py-8 text-sm text-neutral-500">
        <button onClick={onBack} className="mb-4 text-violet-300">
          ‹ Back
        </button>
        <div>Loading…</div>
      </div>
    )
  }

  const start = Date.parse(session.startedAt)
  const duration = ((session.endedAt ? Date.parse(session.endedAt) : Date.now()) - start) / 1000
  const tabBtn = (t: Tab, label: string): React.JSX.Element => (
    <button
      onClick={() => setTab(t)}
      className={`border-b-2 px-1 pb-2 text-sm transition ${tab === t ? 'border-violet-500 text-white' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <button onClick={onBack} className="text-sm text-violet-300 hover:text-violet-200">
        ‹ All sessions
      </button>
      <div className="mt-3 flex items-start gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-white">{formatDateTime(session.startedAt)}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {session.profileName} · {formatDuration(duration)} · {session.questions.length} questions · {session.answers.length} answers
          </p>
        </div>
        <Button variant="primary" onClick={() => void generate()} disabled={generating || session.transcript.length === 0}>
          {generating ? 'Writing report…' : session.report ? 'Regenerate report' : 'Generate report'}
        </Button>
        <Button variant="danger" onClick={() => void remove()}>
          Delete
        </Button>
      </div>
      {error && <div className="mt-3 text-sm text-red-300">{error}</div>}

      <div className="mt-6 flex gap-5 border-b border-white/10">
        {tabBtn('report', 'Report')}
        {tabBtn('qa', `Questions & answers`)}
        {tabBtn('transcript', 'Transcript')}
      </div>

      <div className="py-6">
        {tab === 'report' &&
          (session.report ? (
            <Markdown text={session.report} />
          ) : (
            <div className="text-sm text-neutral-500">
              {generating ? 'Claude is reviewing the interview…' : 'No report yet. Generate one for a summary, feedback on each answer and follow-ups.'}
            </div>
          ))}

        {tab === 'qa' && (
          <div className="flex flex-col gap-4">
            {session.answers.length === 0 && session.questions.length === 0 && (
              <div className="text-sm text-neutral-500">No questions or answers in this session.</div>
            )}
            {session.questions
              .filter((q) => !session.answers.some((a) => a.questionId === q.id))
              .map((q) => (
                <div key={q.id} className="rounded-xl border border-white/10 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500">Detected · {questionTypeLabel(q.type)} · not answered</div>
                  <div className="mt-1 text-sm text-white">{q.text}</div>
                </div>
              ))}
            {session.answers.map((a) => {
              const q = session.questions.find((x) => x.id === a.questionId)
              return (
                <div key={a.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] uppercase tracking-wide text-violet-300">
                    {q ? `Question · ${questionTypeLabel(q.type)}` : a.kind} · {formatDuration((a.ts - start) / 1000)}
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">{a.title}</div>
                  <div className="mt-3 text-neutral-200">
                    {a.text ? <Markdown text={a.text} /> : <span className="text-xs text-neutral-500">(no answer)</span>}
                  </div>
                  {a.error && <div className="mt-2 text-xs text-red-300">{a.error}</div>}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'transcript' && (
          <div className="flex flex-col gap-2 text-sm leading-relaxed">
            {session.transcript.length === 0 && <div className="text-neutral-500">No transcript.</div>}
            {session.transcript.map((s) => (
              <div key={s.id} className="flex gap-3">
                <span className="w-12 shrink-0 font-mono text-xs leading-6 text-neutral-600">{formatDuration((s.ts - start) / 1000)}</span>
                <span className={`w-20 shrink-0 font-medium ${s.speaker === 'interviewer' ? 'text-sky-300' : 'text-emerald-300'}`}>
                  {s.speaker === 'interviewer' ? 'Interviewer' : 'You'}
                </span>
                <span className="select-text text-neutral-200">{s.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
