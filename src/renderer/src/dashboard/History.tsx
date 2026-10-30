import { useEffect, useState } from 'react'
import type { SessionSummary } from '@shared/types'
import { formatDateTime, formatDuration } from '../lib/format'
import { Page } from './ui'
import { SessionDetail } from './SessionDetail'

const api = window.Katoto

export function History(): React.JSX.Element {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => {
      void api.sessions.list().then(setSessions)
    }
    load()
    return api.on.sessionsChanged(load)
  }, [])

  if (openId) return <SessionDetail id={openId} onBack={() => setOpenId(null)} />

  return (
    <Page title="History" subtitle="Every listening session is saved here with its transcript, the questions asked and the suggested answers.">
      {sessions === null ? null : sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-neutral-500">
          No sessions yet. Start listening with Ctrl+Shift+L during a call.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenId(s.id)}
              className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              <div className="flex-1">
                <div className="text-sm text-white">{formatDateTime(s.startedAt)}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {s.profileName} · {formatDuration(s.durationSec)} · {s.questionCount} question{s.questionCount === 1 ? '' : 's'}
                  {!s.endedAt && ' · in progress'}
                </div>
              </div>
              {s.hasReport && <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">Report</span>}
              <span className="text-neutral-600">›</span>
            </button>
          ))}
        </div>
      )}
    </Page>
  )
}
