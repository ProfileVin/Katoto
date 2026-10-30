import type { ReactNode } from 'react'

export function Page({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>}
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </div>
  )
}

export function Card({ title, description, children }: { title?: string; description?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      {title && <h2 className="text-sm font-semibold text-white">{title}</h2>}
      {description && <p className="mt-1 text-xs leading-relaxed text-neutral-400">{description}</p>}
      <div className={title || description ? 'mt-4 flex flex-col gap-4' : 'flex flex-col gap-4'}>{children}</div>
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-300">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-neutral-500">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-violet-500/70'

export function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  onChange(v: boolean): void
}): React.JSX.Element {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-start justify-between gap-6 text-left">
      <span>
        <span className="block text-sm text-neutral-200">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-neutral-500">{description}</span>}
      </span>
      <span className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-violet-500' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  type = 'button'
}: {
  children: ReactNode
  onClick?(): void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
}): React.JSX.Element {
  const styles = {
    primary: 'bg-violet-500 text-white hover:bg-violet-400',
    secondary: 'bg-white/10 text-neutral-200 hover:bg-white/15',
    danger: 'bg-red-500/15 text-red-300 hover:bg-red-500/25'
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]}`}
    >
      {children}
    </button>
  )
}
