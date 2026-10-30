import { useEffect, useState } from 'react'
import type { Toast } from '@shared/types'

interface Item extends Toast {
  id: number
}

let nextId = 1

/** Listens for toasts from the main process and shows them for a few seconds. */
export function Toasts({ extra }: { extra?: Toast | null }): React.JSX.Element | null {
  const [items, setItems] = useState<Item[]>([])

  const push = (t: Toast): void => {
    const id = nextId++
    setItems((prev) => [...prev.slice(-2), { ...t, id }])
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), t.level === 'error' ? 7000 : 3500)
  }

  useEffect(() => window.Katoto.on.toast(push), [])
  useEffect(() => {
    if (extra) push(extra)
  }, [extra])

  if (!items.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((t) => (
        <div
          key={t.id}
          className={`no-drag rounded-lg px-3 py-2 text-xs ${
            t.level === 'error' ? 'bg-red-500/15 text-red-200 ring-1 ring-red-500/30' : 'bg-white/10 text-neutral-200'
          }`}
          onClick={() => setItems((prev) => prev.filter((i) => i.id !== t.id))}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
