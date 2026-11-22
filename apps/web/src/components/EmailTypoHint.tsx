import { useEffect, useState } from 'react'
import { suggestEmail } from '@/lib/emailTypo'

/**
 * Under every email box (owner's ask, 2026-11-22): when the domain looks like a typo of a common one ("gmial.com"),
 * offer the fix with one button. Only a suggestion, never a problem: it waits until they stop typing, so "gmail.co"
 * on the way to "gmail.com" doesn't flash a hint, and it never stops the form.
 */
export function EmailTypoHint({
  email,
  onUse,
  className = '',
}: {
  email: string
  onUse: (fixed: string) => void
  /** Placing it in the form's layout, such as a grid column. */
  className?: string
}) {
  const [settled, setSettled] = useState(email)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(email), 800)
    return () => clearTimeout(timer)
  }, [email])
  const fix = settled === email ? suggestEmail(email.trim()) : null
  return (
    <span aria-live="polite" className="contents">
      {fix && (
        <span
          className={`flex flex-wrap items-center gap-2 text-sm font-normal text-body ${className}`}
        >
          <span>
            Did you mean <span className="font-semibold text-ink">{fix}</span>?
          </span>
          <button
            type="button"
            onClick={() => onUse(fix)}
            className="inline-flex min-h-[44px] items-center rounded-xl border-2 border-royal bg-white px-3 font-semibold text-royal hover:bg-royal-pale"
          >
            Use {fix}
          </button>
        </span>
      )}
    </span>
  )
}
