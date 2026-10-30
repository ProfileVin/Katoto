import { useEffect, useRef } from 'react'
import { useOverlay } from './store'

export function TranscriptPane(): React.JSX.Element {
  const segments = useOverlay((s) => s.segments)
  const status = useOverlay((s) => s.status)
  const scrollRef = useRef<HTMLDivElement>(null)
  const recent = segments.slice(-40)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [segments])

  return (
    <div className="border-t border-white/5">
      <div className="px-4 pt-2 text-[10px] uppercase tracking-wide text-neutral-500">Live transcript</div>
      <div ref={scrollRef} className="scroll-thin max-h-36 select-text overflow-y-auto px-4 pb-2 pt-1 text-xs leading-relaxed">
        {recent.length === 0 ? (
          <div className="py-1 text-neutral-500">
            {status.state === 'listening' ? 'Waiting for speech…' : 'The conversation will appear here while listening.'}
          </div>
        ) : (
          recent.map((seg, i) => {
            const sameSpeaker = i > 0 && recent[i - 1].speaker === seg.speaker
            return (
              <div key={seg.id} className={sameSpeaker ? '' : 'mt-1.5'}>
                {!sameSpeaker && (
                  <span className={`mr-1.5 font-medium ${seg.speaker === 'interviewer' ? 'text-sky-300' : 'text-emerald-300'}`}>
                    {seg.speaker === 'interviewer' ? 'Interviewer' : 'You'}
                  </span>
                )}
                <span className={seg.final ? 'text-neutral-200' : 'italic text-neutral-400'}>{seg.text}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
