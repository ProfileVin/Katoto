import { useState, type RefObject } from 'react'

const api = window.Katoto

export function AskInput({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }): React.JSX.Element {
  const [value, setValue] = useState('')

  const submit = (): void => {
    const text = value.trim()
    if (!text) return
    setValue('')
    void api.ai.ask(text)
  }

  const chip = 'no-drag rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-neutral-300 hover:bg-white/10 hover:text-white'

  return (
    <div className="border-t border-white/5 px-3 py-2.5">
      <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 ring-1 ring-white/10 focus-within:ring-violet-500/60">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="Ask anything about the call or your screen…"
          className="no-drag h-9 flex-1 bg-transparent text-[13px] text-neutral-100 outline-none placeholder:text-neutral-500"
        />
        <kbd className="text-[10px] text-neutral-500">Enter</kbd>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button className={chip} onClick={() => void api.ai.assist()}>
          What should I say?
        </button>
        <button className={chip} onClick={() => void api.ai.followups()}>
          Questions to ask them
        </button>
        <button className={chip} onClick={() => void api.ai.recap()}>
          Recap
        </button>
        <button className={chip} onClick={() => void api.ai.screenshot()}>
          Solve my screen
        </button>
      </div>
    </div>
  )
}
