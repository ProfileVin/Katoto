import { useEffect, useState, type ReactNode } from 'react'
import { formatDuration } from '../lib/format'
import { useOverlay } from './store'

const api = window.Katoto

function Icon({ d, className = '' }: { d: string; className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 ${className}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  sparkle: 'M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z',
  screen: 'M3 5h18v11H3zM8 20h8M12 16v4',
  transcript: 'M4 6h16M4 10h16M4 14h10M4 18h7',
  chevronUp: 'M6 15l6-6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18'
}

function BarButton({
  onClick,
  title,
  active = false,
  children
}: {
  onClick(): void
  title: string
  active?: boolean
  children: ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`no-drag flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs transition ${
        active ? 'bg-white/15 text-white' : 'text-neutral-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function Meter({ level, label }: { level: number; label: string }): React.JSX.Element {
  // Speech RMS rarely exceeds ~0.3; scale so normal speech fills most of the bar.
  const pct = Math.min(100, Math.round(Math.sqrt(level / 0.3) * 100))
  return (
    <div className="flex flex-col items-center" title={label}>
      <div className="relative h-4 w-1 overflow-hidden rounded-full bg-white/10">
        <div className="absolute bottom-0 w-full rounded-full bg-emerald-400 transition-[height] duration-100" style={{ height: `${pct}%` }} />
      </div>
    </div>
  )
}

function Menu(): React.JSX.Element {
  const overlay = useOverlay((s) => s.overlay)
  const settings = useOverlay((s) => s.settings)
  const close = (): void => useOverlay.setState({ menuOpen: false })

  const row = 'no-drag flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-white/10'
  return (
    <div className="glass no-drag flex flex-col gap-0.5 rounded-xl p-1.5">
      <button
        className={row}
        onClick={() => {
          close()
          void api.app.openDashboard()
        }}
      >
        <span>Dashboard: keys, profiles, history</span>
        <span className="text-neutral-500">Ctrl+Shift+D</span>
      </button>
      <button className={row} onClick={() => void api.settings.update({ autoAnswer: !settings?.autoAnswer })}>
        <span>Auto-answer detected questions</span>
        <span className={settings?.autoAnswer ? 'text-emerald-400' : 'text-neutral-500'}>{settings?.autoAnswer ? 'On' : 'Off'}</span>
      </button>
      <button
        className={row}
        onClick={() => void api.settings.update({ contentProtection: !overlay.contentProtection })}
      >
        <span>Hide from screen share</span>
        <span className={overlay.contentProtection ? 'text-emerald-400' : 'text-neutral-500'}>
          {overlay.contentProtection ? 'On' : 'Off'}
        </span>
      </button>
      <button className={row} onClick={() => void api.overlay.toggleClickThrough()}>
        <span>Click-through</span>
        <span className="text-neutral-500">Ctrl+Shift+M</span>
      </button>
      <div className={`${row} cursor-default hover:bg-transparent`}>
        <span>Opacity</span>
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.02}
          value={overlay.opacity}
          onChange={(e) => void api.overlay.setOpacity(Number(e.target.value))}
          className="w-32 accent-violet-500"
        />
      </div>
      <div className="my-1 h-px bg-white/10" />
      <button className={`${row} text-red-300`} onClick={() => void api.app.quit()}>
        Quit Katoto
      </button>
    </div>
  )
}

export function ControlBar({ onToggleListen }: { onToggleListen(): void }): React.JSX.Element {
  const status = useOverlay((s) => s.status)
  const since = useOverlay((s) => s.listeningSince)
  const levels = useOverlay((s) => s.levels)
  const showTranscript = useOverlay((s) => s.showTranscript)
  const expanded = useOverlay((s) => s.expanded)
  const menuOpen = useOverlay((s) => s.menuOpen)
  const [now, setNow] = useState(Date.now())

  const live = status.state === 'listening' || status.state === 'reconnecting'
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [live])

  let listenLabel: ReactNode
  if (status.state === 'connecting') listenLabel = 'Connecting…'
  else if (status.state === 'reconnecting') listenLabel = 'Reconnecting…'
  else if (live) listenLabel = `Stop · ${formatDuration(since ? (now - since) / 1000 : 0)}`
  else listenLabel = 'Listen'

  return (
    <div className="flex flex-col gap-2">
      <div className="glass drag flex items-center gap-1 rounded-full py-1 pl-1 pr-1.5">
        <button
          onClick={onToggleListen}
          title="Start / stop listening (Ctrl+Shift+L)"
          className={`no-drag flex h-7 items-center gap-2 rounded-full px-3 text-xs font-medium transition ${
            live ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30' : 'bg-violet-500 text-white hover:bg-violet-400'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-red-400' : 'bg-white'}`} />
          {listenLabel}
        </button>
        {live && (
          <div className="flex items-center gap-1 px-1.5">
            <Meter level={levels[0]} label="Interviewer (system audio)" />
            <Meter level={levels[1]} label="You (microphone)" />
          </div>
        )}
        <BarButton onClick={() => void api.ai.assist()} title="What should I say? (Ctrl+Enter)">
          <Icon d={ICONS.sparkle} className="text-violet-300" />
          Ask AI
        </BarButton>
        <BarButton onClick={() => void api.ai.screenshot()} title="Screenshot & solve (Ctrl+Shift+S)">
          <Icon d={ICONS.screen} />
          Screen
        </BarButton>
        <div className="h-7 flex-1" />
        <BarButton
          onClick={() => useOverlay.setState({ showTranscript: !showTranscript, expanded: true })}
          title="Show / hide transcript"
          active={showTranscript && expanded}
        >
          <Icon d={ICONS.transcript} />
        </BarButton>
        <BarButton onClick={() => useOverlay.setState({ expanded: !expanded })} title={expanded ? 'Collapse' : 'Expand'}>
          <Icon d={expanded ? ICONS.chevronUp : ICONS.chevronDown} />
        </BarButton>
        <BarButton onClick={() => useOverlay.setState({ menuOpen: !menuOpen })} title="Menu" active={menuOpen}>
          <Icon d={ICONS.more} />
        </BarButton>
        <BarButton onClick={() => void api.overlay.hide()} title="Hide (Ctrl+\)">
          <Icon d={ICONS.close} />
        </BarButton>
      </div>
      {menuOpen && <Menu />}
    </div>
  )
}
