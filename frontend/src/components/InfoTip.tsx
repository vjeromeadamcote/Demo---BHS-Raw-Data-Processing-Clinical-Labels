import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  label?: ReactNode
  children: ReactNode
  className?: string
}

// Small `ⓘ` affordance. Hover shows a short title (browser-native); click pins a
// popover with longer content. Click outside or press Esc to dismiss.
export default function InfoTip({ label, children, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <span ref={ref} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        aria-label="More info"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[11px] font-bold italic leading-none shadow-sm transition-all
          ${
            open
              ? 'border-verily-primary bg-verily-primary text-white'
              : 'border-verily-primary/60 bg-verily-primary/15 text-verily-primary hover:bg-verily-primary hover:text-white'
          }`}
        title={typeof label === 'string' ? label : undefined}
      >
        i
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-5 z-40 w-72 rounded-md border border-verily-mute bg-white p-3 text-[12px] leading-snug text-verily-ink shadow-lg"
        >
          {label ? <div className="mb-1 font-semibold">{label}</div> : null}
          <div className="text-verily-ink/80">{children}</div>
        </span>
      ) : null}
    </span>
  )
}
