import { useEffect, useState } from 'react'
import type { KeyStatus, KeyTestResult, Settings as SettingsType } from '@shared/types'
import { HOTKEY_HELP } from '@shared/hotkeys'
import { Button, Card, Field, inputClass, Page, Toggle } from './ui'

const api = window.Katoto

const ANSWER_MODELS = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (recommended: fast and sharp)' },
  { id: 'claude-opus-5', label: 'Claude Opus 5 (smartest, slower)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest, lighter answers)' }
]

function KeysCard({ onKeysChange }: { onKeysChange(k: KeyStatus): void }): React.JSX.Element {
  const [status, setStatus] = useState<KeyStatus | null>(null)
  const [anthropic, setAnthropic] = useState('')
  const [deepgram, setDeepgram] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<KeyTestResult | null>(null)

  useEffect(() => {
    void api.keys.status().then(setStatus)
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const next = await api.keys.set({
        anthropic: anthropic.trim() || undefined,
        deepgram: deepgram.trim() || undefined
      })
      setStatus(next)
      onKeysChange(next)
      setAnthropic('')
      setDeepgram('')
      setTest(null)
    } finally {
      setSaving(false)
    }
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    try {
      setTest(await api.keys.test())
    } finally {
      setTesting(false)
    }
  }

  const result = (name: 'anthropic' | 'deepgram'): React.JSX.Element | null => {
    if (!test) return null
    const err = test[name]
    return err ? <span className="text-red-300">{err}</span> : <span className="text-emerald-400">Key works.</span>
  }

  return (
    <Card
      title="API keys"
      description={
        <>
          Katoto uses Claude to write answers and Deepgram to transcribe the call live. Keys are encrypted with Windows
          DPAPI and stay on this computer{status && !status.encryptionAvailable ? ' (encryption is unavailable here, so they are stored in plain text)' : ''}.
        </>
      }
    >
      <Field
        label={`Anthropic API key ${status?.anthropic ? '· saved' : ''}`}
        hint={
          <>
            Create one at{' '}
            <a className="text-violet-300 underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>
            . {result('anthropic')}
          </>
        }
      >
        <input
          type="password"
          className={inputClass}
          placeholder={status?.anthropic ? '•••••••• (leave blank to keep)' : 'sk-ant-...'}
          value={anthropic}
          onChange={(e) => setAnthropic(e.target.value)}
        />
      </Field>
      <Field
        label={`Deepgram API key ${status?.deepgram ? '· saved' : ''}`}
        hint={
          <>
            Create one at{' '}
            <a className="text-violet-300 underline" href="https://console.deepgram.com" target="_blank" rel="noreferrer">
              console.deepgram.com
            </a>{' '}
            (new accounts include free credit). {result('deepgram')}
          </>
        }
      >
        <input
          type="password"
          className={inputClass}
          placeholder={status?.deepgram ? '•••••••• (leave blank to keep)' : 'Deepgram key'}
          value={deepgram}
          onChange={(e) => setDeepgram(e.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => void save()} disabled={saving || (!anthropic.trim() && !deepgram.trim())}>
          {saving ? 'Saving…' : 'Save keys'}
        </Button>
        <Button onClick={() => void runTest()} disabled={testing || !status || (!status.anthropic && !status.deepgram)}>
          {testing ? 'Testing…' : 'Test saved keys'}
        </Button>
      </div>
    </Card>
  )
}

function MicSelect({ settings, update }: { settings: SettingsType; update(p: Partial<SettingsType>): void }): React.JSX.Element {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])

  const refresh = async (): Promise<void> => {
    // Device labels are only exposed after mic permission has been granted once.
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
    } catch {
      /* labels stay generic */
    }
    const devices = await navigator.mediaDevices.enumerateDevices()
    setMics(devices.filter((d) => d.kind === 'audioinput'))
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <Field label="Microphone" hint="Your own voice, transcribed as “You”. Wear headphones so the mic does not also pick up the interviewer.">
      <select
        className={inputClass}
        value={settings.micDeviceId ?? ''}
        onChange={(e) => update({ micDeviceId: e.target.value || null })}
        disabled={!settings.captureMic}
      >
        <option value="">System default</option>
        {mics
          .filter((m) => m.deviceId && m.deviceId !== 'default' && m.deviceId !== 'communications')
          .map((m) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label || 'Microphone'}
            </option>
          ))}
      </select>
    </Field>
  )
}

export function Settings({ onKeysChange }: { onKeysChange(k: KeyStatus): void }): React.JSX.Element {
  const [settings, setSettings] = useState<SettingsType | null>(null)

  useEffect(() => {
    void api.settings.get().then(setSettings)
    return api.on.settings(setSettings)
  }, [])

  const update = (patch: Partial<SettingsType>): void => {
    setSettings((s) => (s ? { ...s, ...patch } : s))
    void api.settings.update(patch).then(setSettings)
  }

  return (
    <Page title="Setup" subtitle="Everything Katoto needs before your first call.">
      <KeysCard onKeysChange={onKeysChange} />

      {settings && (
        <>
          <Card title="Answers">
            <Field label="Answer model">
              <select className={inputClass} value={settings.answerModel} onChange={(e) => update({ answerModel: e.target.value })}>
                {ANSWER_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Answer style"
              hint="Fast starts streaming almost instantly. Thorough lets Claude reason first: better for hard technical questions, but the first words take a few seconds."
            >
              <div className="flex gap-2">
                {(['fast', 'thorough'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update({ answerMode: mode })}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition ${
                      settings.answerMode === mode
                        ? 'border-violet-500 bg-violet-500/15 text-white'
                        : 'border-white/10 text-neutral-400 hover:border-white/20'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </Field>
            <Toggle
              label="Auto-answer detected questions"
              description="When the interviewer asks something, start writing an answer right away. Off: questions are highlighted and you click Answer."
              checked={settings.autoAnswer}
              onChange={(v) => update({ autoAnswer: v })}
            />
          </Card>

          <Card title="Audio" description="The interviewer is captured from your computer's audio output (any meeting app works), you from the microphone.">
            <Toggle
              label="Transcribe my microphone"
              description="Adds your side of the conversation to the transcript, which improves answers and the post-call report."
              checked={settings.captureMic}
              onChange={(v) => update({ captureMic: v })}
            />
            <MicSelect settings={settings} update={update} />
          </Card>

          <Card title="Overlay">
            <Toggle
              label="Hide from screen share and recordings"
              description="Keeps the overlay and this window out of Zoom, Teams, Meet and OBS captures (Windows 10 2004 or later). You still see it."
              checked={settings.contentProtection}
              onChange={(v) => update({ contentProtection: v })}
            />
            <Field label={`Overlay opacity · ${Math.round(settings.overlayOpacity * 100)}%`}>
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.02}
                value={settings.overlayOpacity}
                onChange={(e) => update({ overlayOpacity: Number(e.target.value) })}
                className="accent-violet-500"
              />
            </Field>
          </Card>
        </>
      )}

      <Card title="Hotkeys" description="These work from any app, so you never have to click away from the call.">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {HOTKEY_HELP.map((h) => (
            <div key={h.keys} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-300">{h.label}</span>
              <kbd className="rounded bg-white/10 px-2 py-0.5 font-mono text-[11px] text-neutral-200">{h.keys}</kbd>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  )
}
