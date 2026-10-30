import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useT } from '../i18n'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'terra' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-medium [&>svg]:shrink-0 transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4',
        size === 'lg' && 'min-h-14 px-5 text-lg',
        variant === 'primary' && 'bg-olive text-white',
        variant === 'secondary' && 'bg-white text-olive ring-1 ring-sand',
        variant === 'ghost' && 'text-olive',
        variant === 'terra' && 'bg-terra text-white',
        variant === 'danger' && 'bg-white text-terra-deep ring-1 ring-terra/40',
        className,
      )}
    />
  )
}

export function Chip({
  active,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      aria-pressed={active}
      {...rest}
      className={cx(
        'min-h-9 shrink-0 rounded-full px-3 text-sm transition',
        active ? 'bg-olive text-white' : 'bg-white text-ink ring-1 ring-sand',
        className,
      )}
    />
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-cream text-muted',
        tone === 'good' && 'bg-sage-soft text-olive',
        tone === 'warn' && 'bg-terra-soft text-terra-deep',
        tone === 'bad' && 'bg-terra text-white',
      )}
    >
      {children}
    </span>
  )
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-3xl bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] ring-1 ring-sand/70', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between gap-2 px-1">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  const { t } = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="sheet-in safe-bottom max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-ivory p-4 outline-none"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-olive">{title}</h2>
          <button aria-label={t('close')} onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white ring-1 ring-sand">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Stepper({ value, onChange, min = 1, max = 12, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl bg-white ring-1 ring-sand" role="group" aria-label={label}>
      <button className="grid size-10 place-items-center text-xl text-olive disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="−">
        −
      </button>
      <span className="min-w-6 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button className="grid size-10 place-items-center text-xl text-olive disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="+">
        +
      </button>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-3xl border border-dashed border-sand p-6 text-center text-muted">{children}</p>
}

// ---------- toast ----------

const ToastCtx = createContext<(msg: string, action?: { label: string; run: () => void }) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; action?: { label: string; run: () => void }; id: number } | null>(null)
  const show = useCallback((msg: string, action?: { label: string; run: () => void }) => setToast({ msg, action, id: Date.now() }), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4" role="status" aria-live="polite">
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-lg">
            <span>{toast.msg}</span>
            {toast.action && (
              <button
                className="font-semibold text-terra"
                onClick={() => {
                  toast.action!.run()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}
