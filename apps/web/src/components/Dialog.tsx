import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A focused task over a dimmed page (CLAUDE.md "Design rules"): closes on Escape, the close button or a click
 * outside, keeps focus inside, and gives focus back to what opened it. Full height on a phone.
 */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  // The latest close handler, so the setup below runs once per opening, not on every parent render.
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const focusables = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
    ;(focusables().find((el) => el.tagName === 'INPUT') ?? focusables()[0])?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      if (e.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      // A button that did its job can disappear (Accept becomes "Accepted"); focus comes back inside.
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
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      // What opened it may be gone (an action row that was done): then nothing is focused, rather than the page top.
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 sm:items-center sm:p-6"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close.current()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[100dvh] w-full flex-col overflow-y-auto bg-white p-6 shadow-[0_24px_60px_rgba(15,28,46,0.3)] sm:max-h-[90vh] sm:max-w-[640px] sm:rounded-3xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-[26px] font-extrabold leading-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 rounded-full p-2.5 text-muted hover:bg-ground hover:text-ink"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
