// Balance adjustments (issue #17, owner's decision 2026-10-28): disputes are settled between the guest and the
// organizer outside the app; once they've agreed, the organizer corrects the books here with a credit or a charge and
// a reason. Not a payment, and the signed price never changes: an adjustment sits beside it. Never edited: removing
// one asks first, and it stays in the guest's history.
import type { BalanceAdjustment, BalanceAdjustmentInput, Guest } from '@cc/types'
import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'
import { money } from '@/lib/format'
import { centsFrom, totalDueCents } from '@/lib/payments'

const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-3 text-sm font-semibold text-white hover:bg-royal-dark'

const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'

const field =
  'min-h-[44px] rounded-lg border border-[#5B6B80] bg-white px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const KINDS = [
  { kind: 'credit', label: 'Credit', line: 'Lowers their balance' },
  { kind: 'charge', label: 'Charge', line: 'Raises their balance' },
] as const

/** "−$50.00 credit", "+$40.00 charge": which way it moves the balance, in words and a sign. */
export const adjustmentAmount = (a: Pick<BalanceAdjustment, 'kind' | 'amountCents'>) =>
  `${a.kind === 'credit' ? '−' : '+'}${money(a.amountCents)} ${a.kind}`

/** Adding a credit or charge to a guest's balance: which, how much, and why. Every problem shows beside its field. */
export function AdjustBalance({
  g,
  payFirst,
  onAdjust,
  onClose,
  error,
}: {
  g: Guest
  /** The trip has guests pay before they're accepted, so payments that arrive hold a spot. */
  payFirst: boolean
  onAdjust: (guest: Guest, input: BalanceAdjustmentInput) => Promise<boolean>
  onClose: () => void
  error?: string | null
}) {
  const [kind, setKind] = useState<BalanceAdjustmentInput['kind']>('credit')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const cents = centsFrom(amount)
  // A credit can't take the balance below what arrived or is waiting to be confirmed (as the API checks it).
  const left = g.terms
    ? totalDueCents(g.terms) - g.terms.paidCents - g.terms.pendingCents
    : Infinity
  const problems: Record<string, string> = {}
  if (!cents) problems.amount = 'Enter an amount.'
  else if (kind === 'credit' && cents > left)
    problems.amount =
      left > 0
        ? `That’s more than the ${money(left)} ${g.firstName} has left to pay.`
        : `${g.firstName} has nothing left to pay.`
  if (!reason.trim()) problems.reason = 'Say why, in a few words.'
  async function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(problems).length > 0) return
    setBusy(true)
    try {
      if (await onAdjust(g, { kind, amountCents: cents, reason: reason.trim() })) onClose()
    } finally {
      setBusy(false)
    }
  }
  const touch = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }))
  const problem = (k: string) =>
    (tried || touched[k]) && problems[k] ? (
      <span className="font-semibold text-[#B42318]">{problems[k]}</span>
    ) : null
  return (
    <Dialog title={`Credit or charge for ${g.firstName}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <div className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
          <p>
            For what you and {g.firstName} agreed. It records the change only: no money moves, and
            the price they signed stays as signed.
          </p>
          {kind === 'credit' && payFirst && !g.spotPaidAt && g.status !== 'approved' && (
            <p className="mt-2 font-semibold">
              A credit doesn’t hold {g.firstName}’s spot: it’s held once{' '}
              {g.terms ? money(g.terms.firstInstallmentCents) : 'the first payment'} in payments has
              arrived.
            </p>
          )}
        </div>
        <div role="radiogroup" aria-label="Credit or charge" className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className={`flex min-h-[44px] flex-col items-start rounded-xl border-2 px-3 py-2 text-left ${
                kind === k.kind ? 'border-royal bg-royal-pale' : 'border-rule bg-white'
              }`}
            >
              <span className="font-semibold text-ink">{k.label}</span>
              <span className="text-sm text-muted">{k.line}</span>
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Amount
          <input
            className={field}
            inputMode="decimal"
            placeholder="$0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={touch('amount')}
          />
          {problem('amount')}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Reason
          <input
            className={field}
            placeholder={kind === 'credit' ? 'Drove the van' : 'The extra night'}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={touch('reason')}
          />
          <span className="font-normal text-muted">{g.firstName} sees this on their page.</span>
          {problem('reason')}
        </label>
        <button
          type="submit"
          disabled={busy}
          className={`${filled} self-start disabled:opacity-60`}
        >
          {kind === 'credit' ? 'Add credit' : 'Add charge'}
        </button>
      </form>
    </Dialog>
  )
}

/** One adjustment in a guest's Details: which way, how much, why, when, and Remove (asking first). */
export function AdjustmentLine({
  a,
  g,
  onRemove,
  readOnly,
}: {
  a: BalanceAdjustment
  g: Guest
  onRemove: (guest: Guest, adjustmentId: string) => Promise<boolean>
  readOnly: boolean
}) {
  const [asking, setAsking] = useState(false)
  const removed = Boolean(a.removedAt)
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-rule py-2 text-sm first:border-t-0">
      <span className="min-w-0">
        <span className={`font-semibold ${removed ? 'text-muted line-through' : ''}`}>
          {adjustmentAmount(a)}
        </span>{' '}
        · {a.reason}
        <span className="block text-muted">
          Added {day(a.createdAt)}
          {a.removedAt && ` · removed ${day(a.removedAt)}`}
        </span>
      </span>
      {!readOnly && !removed && (
        <button type="button" onClick={() => setAsking(true)} className={outlined}>
          Remove
        </button>
      )}
      {asking && (
        <ConfirmDialog
          title={`Remove this ${a.kind}?`}
          confirmLabel={`Remove ${a.kind}`}
          onConfirm={() => {
            setAsking(false)
            void onRemove(g, a.id)
          }}
          onCancel={() => setAsking(false)}
        >
          <p>
            {g.firstName}’s balance goes {a.kind === 'credit' ? 'back up' : 'down'} by{' '}
            {money(a.amountCents)}. It stays in their history as removed.
          </p>
        </ConfirmDialog>
      )}
    </li>
  )
}
