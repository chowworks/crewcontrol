import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useToast } from './Toast'

/**
 * A value a guest needs in another app (a Cash App handle, the receipts address), with a button that copies it. The
 * button shows a check for two seconds and a toast says what was copied, as the trip link's does. Small to look at,
 * 44 px to tap.
 */
export function CopyText({
  value,
  label,
  children,
}: {
  value: string
  /** What it is, for the toast and screen readers ("Receipts address"). */
  label: string
  children: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const toast = useToast()
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast({ text: `${label} copied.` })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The browser refused (no permission or not a secure page): the value is still there to select.
    }
  }
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 break-all">{children}</div>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
        className="group -mr-2 grid h-11 w-11 shrink-0 place-items-center"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-royal bg-white text-royal group-hover:bg-royal-pale">
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>
    </div>
  )
}
