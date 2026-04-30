import { useEffect, useRef, useState } from 'react'

interface Props {
  open: boolean
  title: string
  description?: string
  defaultName?: string
  defaultDescription?: string
  confirmLabel?: string
  pending?: boolean
  onClose: () => void
  onConfirm: (name: string, description: string) => void
}

/**
 * Shared Save dialog. Name is required, description is optional. Enter confirms,
 * Esc cancels. Focuses the name input on open.
 */
export default function SaveDialog({
  open,
  title,
  description,
  defaultName = '',
  defaultDescription = '',
  confirmLabel = 'Save',
  pending = false,
  onClose,
  onConfirm,
}: Props) {
  const [name, setName] = useState(defaultName)
  const [desc, setDesc] = useState(defaultDescription)
  const nameRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setName(defaultName)
      setDesc(defaultDescription)
      setTimeout(() => nameRef.current?.focus(), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const disabled = pending || !name.trim()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-verily-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-verily-mute bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-base font-semibold text-verily-ink">{title}</div>
        {description ? (
          <div className="mb-4 text-xs text-verily-ink/60">{description}</div>
        ) : (
          <div className="mb-4" />
        )}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-verily-ink/70">
            Name <span className="text-verily-warm">*</span>
          </span>
          <input
            ref={nameRef}
            className="input w-full"
            value={name}
            maxLength={120}
            placeholder="Short, descriptive name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !disabled) onConfirm(name.trim(), desc.trim())
            }}
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-xs font-medium text-verily-ink/70">
            Description (optional)
          </span>
          <textarea
            className="input w-full resize-y"
            rows={2}
            value={desc}
            placeholder="Context, parameters, anything helpful later"
            onChange={(e) => setDesc(e.target.value)}
          />
        </label>

        <div className="flex items-center justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={disabled}
            onClick={() => onConfirm(name.trim(), desc.trim())}
          >
            {pending ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
