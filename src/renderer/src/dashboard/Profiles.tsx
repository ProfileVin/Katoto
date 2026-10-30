import { useEffect, useState } from 'react'
import type { Profile } from '@shared/types'
import { Button, Card, Field, inputClass, Page } from './ui'

const api = window.Katoto

type Draft = Omit<Profile, 'id' | 'updatedAt'> & { id?: string }

const EMPTY: Draft = { name: '', resume: '', jobDescription: '', company: '', instructions: '' }

const INSTRUCTION_EXAMPLES =
  'e.g. I am a senior backend engineer (Go, Postgres, AWS). Answer behavioral questions in STAR format. Keep answers under 80 words unless it is a coding question. Prefer Python for code.'

export function Profiles(): React.JSX.Element {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (selectId?: string): Promise<void> => {
    const [list, settings] = await Promise.all([api.profiles.list(), api.settings.get()])
    setProfiles(list)
    setActiveId(settings.activeProfileId)
    const pick = list.find((p) => p.id === (selectId ?? settings.activeProfileId)) ?? list[0]
    setDraft(pick ? { ...pick } : EMPTY)
    setDirty(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const edit = (patch: Partial<Draft>): void => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const saved = await api.profiles.save(draft)
      await load(saved.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!draft.id || !confirm(`Delete profile “${draft.name}”?`)) return
    await api.profiles.delete(draft.id)
    await load()
  }

  const activate = async (id: string): Promise<void> => {
    const s = await api.settings.update({ activeProfileId: id })
    setActiveId(s.activeProfileId)
  }

  const importInto = async (field: 'resume' | 'jobDescription'): Promise<void> => {
    setError(null)
    try {
      const res = await api.profiles.importFile()
      if (res) edit({ [field]: res.text, ...(field === 'resume' && !draft.name ? { name: res.fileName.replace(/\.[^.]+$/, '') } : {}) })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Page title="Profiles" subtitle="What Claude knows about you and the role. The active profile is used for every answer.">
      <div className="flex flex-wrap gap-2">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              if (dirty && !confirm('Discard unsaved changes?')) return
              setDraft({ ...p })
              setDirty(false)
            }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
              draft.id === p.id ? 'border-violet-500 bg-violet-500/10 text-white' : 'border-white/10 text-neutral-300 hover:border-white/20'
            }`}
          >
            {p.id === activeId && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Active" />}
            {p.name}
          </button>
        ))}
        <button
          onClick={() => {
            if (dirty && !confirm('Discard unsaved changes?')) return
            setDraft(EMPTY)
            setDirty(false)
          }}
          className="rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-sm text-neutral-400 hover:border-white/30 hover:text-neutral-200"
        >
          + New profile
        </button>
      </div>

      <Card>
        <Field label="Profile name">
          <input className={inputClass} value={draft.name} placeholder="e.g. Stripe · Senior Backend" onChange={(e) => edit({ name: e.target.value })} />
        </Field>

        <Field
          label="Resume"
          hint={
            <button type="button" className="text-violet-300 underline" onClick={() => void importInto('resume')}>
              Import from PDF, DOCX or TXT
            </button>
          }
        >
          <textarea
            className={`${inputClass} scroll-thin h-44 resize-y font-mono text-xs`}
            value={draft.resume}
            placeholder="Paste your resume, or import a file below."
            onChange={(e) => edit({ resume: e.target.value })}
          />
        </Field>

        <Field
          label="Job description"
          hint={
            <button type="button" className="text-violet-300 underline" onClick={() => void importInto('jobDescription')}>
              Import from file
            </button>
          }
        >
          <textarea
            className={`${inputClass} scroll-thin h-36 resize-y text-xs`}
            value={draft.jobDescription}
            placeholder="Paste the job posting."
            onChange={(e) => edit({ jobDescription: e.target.value })}
          />
        </Field>

        <Field label="Company & interview notes" hint="Products, values, interviewer names, anything from your research.">
          <textarea
            className={`${inputClass} scroll-thin h-24 resize-y text-xs`}
            value={draft.company}
            onChange={(e) => edit({ company: e.target.value })}
          />
        </Field>

        <Field label="Instructions for Claude">
          <textarea
            className={`${inputClass} scroll-thin h-24 resize-y text-xs`}
            value={draft.instructions}
            placeholder={INSTRUCTION_EXAMPLES}
            onChange={(e) => edit({ instructions: e.target.value })}
          />
        </Field>

        {error && <div className="text-sm text-red-300">{error}</div>}

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create profile'}
          </Button>
          {draft.id && draft.id !== activeId && (
            <Button onClick={() => void activate(draft.id!)} disabled={dirty}>
              Use for interviews
            </Button>
          )}
          {draft.id && draft.id === activeId && <span className="text-xs text-emerald-400">Active profile</span>}
          <div className="flex-1" />
          {draft.id && (
            <Button variant="danger" onClick={() => void remove()}>
              Delete
            </Button>
          )}
        </div>
      </Card>
    </Page>
  )
}
