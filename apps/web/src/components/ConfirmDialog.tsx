import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A yes-or-no question about a step that's hard to take back (owner's decision, 2026-10-26: confirmations open in a
 * modal, never as text that appears on the page). It sits above any dialog already open; Escape, Cancel or a click
 * outside close only this one.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  disabled = false,
}: {
  title: string
  children?: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** The confirm button waits for something (a "Refund sent" tick). */
  disabled?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  const cancel = useRef(onCancel)
  cancel.current = onCancel

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const focusables = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>('button, input, [href]') ?? []
      ).filter((el) => !el.hasAttribute('disabled'))
    focusables()[0]?.focus()
    // On the window and in the capture phase, so the dialog underneath never sees these keys.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cancel.current()
      }
      if (e.key !== 'Tab') return
      e.stopPropagation()
      const list = focusables()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      if (!panel.current?.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) cancel.current()
      }}
    >
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full max-w-[420px] flex-col gap-4 rounded-2xl bg-white p-6 text-[15px] text-body shadow-[0_24px_60px_rgba(15,28,46,0.3)]"
      >
        <h2 className="text-xl font-extrabold text-ink">{title}</h2>
        {children}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-royal px-4 font-semibold text-royal hover:bg-royal-pale"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-royal px-4 font-semibold text-white hover:bg-royal-dark disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
