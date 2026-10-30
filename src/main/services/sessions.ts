import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { Session, SessionSummary } from '@shared/types'
import { readJson, writeJson } from './jsonFile'

const sessionsDir = (): string => path.join(app.getPath('userData'), 'sessions')
const SAFE_ID = /^[\w-]+$/

function sessionFile(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`Invalid session id: ${id}`)
  return path.join(sessionsDir(), `${id}.json`)
}

export function saveSession(session: Session): void {
  writeJson(sessionFile(session.id), session)
}

export function getSession(id: string): Session | null {
  return readJson<Session | null>(sessionFile(id), null)
}

export function deleteSession(id: string): void {
  fs.rmSync(sessionFile(id), { force: true })
}

export function listSessions(): SessionSummary[] {
  let files: string[]
  try {
    files = fs.readdirSync(sessionsDir()).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const summaries: SessionSummary[] = []
  for (const f of files) {
    const s = readJson<Session | null>(path.join(sessionsDir(), f), null)
    if (!s) continue
    const end = s.endedAt ? Date.parse(s.endedAt) : Date.now()
    summaries.push({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      profileName: s.profileName,
      questionCount: s.questions.length,
      durationSec: Math.max(0, Math.round((end - Date.parse(s.startedAt)) / 1000)),
      hasReport: !!s.report
    })
  }
  return summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}
