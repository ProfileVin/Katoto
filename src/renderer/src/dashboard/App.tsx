import { useEffect, useState } from 'react'
import type { KeyStatus } from '@shared/types'
import { Toasts } from '../components/Toasts'
import { Settings } from './Settings'
import { Profiles } from './Profiles'
import { History } from './History'

type Tab = 'setup' | 'profiles' | 'history'

const NAV: { id: Tab; label: string; hint: string }[] = [
  { id: 'setup', label: 'Setup', hint: 'API keys, answers, audio' },
  { id: 'profiles', label: 'Profiles', hint: 'Resume & job description' },
  { id: 'history', label: 'History', hint: 'Past sessions & reports' }
]

export function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('setup')
  const [keys, setKeys] = useState<KeyStatus | null>(null)

  useEffect(() => {
    void window.Katoto.keys.status().then((k) => {
      setKeys(k)
      if (k.anthropic && k.deepgram) setTab('profiles')
    })
  }, [])

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-black/20 p-3">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500" />
          <div>
            <div className="text-sm font-semibold text-white">Katoto</div>
            <div className="text-[11px] text-neutral-500">Interview copilot</div>
          </div>
        </div>
        <nav className="mt-3 flex flex-col gap-1">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className={`rounded-lg px-3 py-2 text-left transition ${
                tab === n.id ? 'bg-white/10 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
              }`}
            >
              <div className="text-sm">{n.label}</div>
              <div className="text-[11px] text-neutral-500">{n.hint}</div>
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-lg bg-white/5 p-3 text-[11px] leading-relaxed text-neutral-400">
          {keys && (!keys.anthropic || !keys.deepgram) ? (
            <span className="text-amber-300">Add both API keys in Setup to start.</span>
          ) : (
            <>
              Press <kbd className="text-neutral-200">Ctrl+Shift+L</kbd> during a call to start listening.
            </>
          )}
        </div>
      </aside>
      <main className="scroll-thin flex-1 overflow-y-auto">
        {tab === 'setup' && <Settings onKeysChange={setKeys} />}
        {tab === 'profiles' && <Profiles />}
        {tab === 'history' && <History />}
      </main>
      <div className="pointer-events-auto fixed bottom-4 right-4 w-80">
        <Toasts />
      </div>
    </div>
  )
}
