import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

/**
 * A custom dropdown (never the browser's own list, owner's decision 2026-10-28), styled as the People screen's role
 * picker: a button with the choice and a caret, opening a list with a check by the current one. Arrow keys, Enter and
 * Escape work; a click outside closes it. An option may carry an icon, shown before its name in the list and on the
 * button.
 */
export function Dropdown<T extends string | number | null>({
  label,
  value,
  options,
  onChange,
  className = 'w-full',
}: {
  /** Read by screen readers, beside the choice. */
  label: string
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (value: T) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const uid = useId()
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value)
      )
    )
    list.current?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function pick(v: T) {
    setOpen(false)
    if (v !== value) onChange(v)
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') setActive((i) => Math.min(options.length - 1, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Enter' || e.key === ' ') pick(options[active].value)
    else return
    e.preventDefault()
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label}`}
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border border-rule bg-white px-3 text-left text-[16px] text-ink hover:border-royal focus:outline-none focus-visible:ring-2 focus-visible:ring-royal/30"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {current?.icon}
          <span className="truncate">{current?.label}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${uid}-${active}`}
          onKeyDown={onKey}
          className="absolute left-0 top-[calc(100%+6px)] z-20 w-full min-w-[220px] rounded-2xl border border-rule bg-white p-2 shadow-[0_16px_40px_rgba(15,28,46,0.14)] focus:outline-none"
        >
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${uid}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onClick={() => pick(o.value)}
              onPointerEnter={() => setActive(i)}
              className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl px-3 ${
                i === active ? 'bg-royal-pale' : ''
              }`}
            >
              <Check
                className={`h-4 w-4 shrink-0 text-royal ${o.value === value ? '' : 'invisible'}`}
                aria-hidden="true"
              />
              {o.icon}
              <span className="text-ink">{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The reminder choices, in days before a date (REMIND_DAYS), with "Don't remind" first. */
export const REMIND_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Don’t remind' },
  { value: 0, label: 'On the day' },
  { value: 1, label: '1 day before' },
  { value: 3, label: '3 days before' },
  { value: 7, label: '1 week before' },
  { value: 14, label: '2 weeks before' },
  { value: 30, label: '30 days before' },
]
