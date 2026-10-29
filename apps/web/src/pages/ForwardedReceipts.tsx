// Forwarded receipts (issue #12, "receipts@"): a guest or organizer forwards a Zelle, Cash App or bank email to the
// trip's own address. One that names its guest is recorded on them with the email kept as proof: confirmed as it
// arrives when an organizer sent it, or a guest did on a trip that trusts them (owner's decisions, 2026-10-29); the rest wait in Trip Control's Actions for an organizer to match or dismiss. The address is set
// in the trip editor, modeled on Audit Differently's receipts address: changed, never cleared, never reused.
import {
  DISMISS_RECEIPT_LABELS,
  DISMISS_RECEIPT_REASONS,
  PAYMENT_METHOD_KINDS,
  RECEIPTS_ADDRESS_PATTERN,
  type DismissReceiptReason,
  type ForwardedReceiptItem,
  type Guest,
  type MatchReceiptInput,
  type OrganizerTrip,
  type ReceiptProof,
  type TripReceipts,
} from '@cc/types'
import { Check, Copy } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'
import { Dropdown } from '@/components/Dropdown'
import { useToast } from '@/components/Toast'
import { ApiError, api } from '@/lib/api'
import { money, shortDate } from '@/lib/format'
import { centsFrom, dollarsFor, today } from '@/lib/payments'

const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-3 text-sm font-semibold text-white hover:bg-royal-dark'

const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'

const field =
  'min-h-[44px] rounded-lg border border-[#5B6B80] bg-white px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

const kindName = (k: ForwardedReceiptItem['methodKind']) =>
  k ? (PAYMENT_METHOD_KINDS.find((x) => x.kind === k)?.name ?? null) : null

/** "A $300 Zelle receipt", "A receipt": what came in, in a few words. */
function receiptWords(r: Pick<ForwardedReceiptItem, 'amountCents' | 'methodKind'>): string {
  const kind = kindName(r.methodKind)
  const amount = r.amountCents ? money(r.amountCents) : null
  return amount
    ? `A ${amount}${kind ? ` ${kind}` : ''} receipt`
    : kind
      ? `A ${kind} receipt`
      : 'A receipt'
}

/** The email as it came in: who sent it, when, the subject and the start of its text. */
function EmailText({
  from,
  at,
  subject,
  excerpt,
  checked,
}: {
  from: string | null
  at: string
  subject: string | null
  excerpt: string
  checked?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted">From</dt>
        <dd className="text-ink">
          <span className="break-all">{from ?? 'Unknown'}</span>
          {checked !== undefined && (
            <span className="block text-muted">
              {checked
                ? 'Checked: it came from that mailbox. Its text could have been edited before it was forwarded.'
                : 'We couldn’t check that it came from that mailbox.'}
            </span>
          )}
        </dd>
        <dt className="text-muted">Received</dt>
        <dd className="text-ink">{when(at)}</dd>
        {subject && (
          <>
            <dt className="text-muted">Subject</dt>
            <dd className="break-words text-ink">{subject}</dd>
          </>
        )}
      </dl>
      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-royal-pale px-4 py-3 text-ink">
        {excerpt || 'Nothing could be read from it.'}
      </div>
    </div>
  )
}

/**
 * One forwarded receipt waiting in Trip Control's Actions: what came in and why it waits, with Match (filled) and
 * Dismiss (outlined).
 */
export function ReceiptActionRow({
  r,
  trip,
  onMatch,
  onDismiss,
  error,
}: {
  r: ForwardedReceiptItem
  trip: OrganizerTrip
  onMatch: (r: ForwardedReceiptItem, input: MatchReceiptInput) => Promise<boolean>
  onDismiss: (r: ForwardedReceiptItem, reason: DismissReceiptReason) => Promise<boolean>
  /** Why the last change didn't save, shown in the open dialog (the page's own line is behind it). */
  error?: string | null
}) {
  const [matching, setMatching] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0">
      <div className="min-w-0 flex-[1_1_200px]">
        <div className="break-words font-semibold">
          {r.payerName || r.fromAddress || 'Forwarded receipt'}
        </div>
        <div className="text-sm text-body">
          {receiptWords(r)} was forwarded. {r.reason}
        </div>
      </div>
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={() => setMatching(true)} className={filled}>
          Match receipt
        </button>
        <button type="button" onClick={() => setDismissing(true)} className={outlined}>
          Dismiss
        </button>
      </div>
      {matching && (
        <MatchReceiptDialog
          r={r}
          guests={trip.guests.filter((g) => g.status !== 'declined')}
          onMatch={(input) => onMatch(r, input)}
          onClose={() => setMatching(false)}
          error={error}
        />
      )}
      {dismissing && (
        <DismissReceiptDialog
          r={r}
          onDismiss={(reason) => onDismiss(r, reason)}
          onClose={() => setDismissing(false)}
          error={error}
        />
      )}
    </li>
  )
}

/**
 * Matching a forwarded receipt to a guest: the email to read, the guest (the likeliest picked), the amount and day as
 * read (correctable), and whether the money arrived, ticked: matching confirms it in the same step.
 */
function MatchReceiptDialog({
  r,
  guests,
  onMatch,
  onClose,
  error,
}: {
  r: ForwardedReceiptItem
  guests: Guest[]
  onMatch: (input: MatchReceiptInput) => Promise<boolean>
  onClose: () => void
  error?: string | null
}) {
  const [guestId, setGuestId] = useState<string | null>(
    guests.some((g) => g.id === r.suggestedGuestId) ? r.suggestedGuestId : null
  )
  const [amount, setAmount] = useState(r.amountCents ? dollarsFor(r.amountCents) : '')
  const [sentOn, setSentOn] = useState(r.sentOn ?? r.receivedAt.slice(0, 10))
  const [arrived, setArrived] = useState(true)
  const [remember, setRemember] = useState(r.fromStranger)
  const [tried, setTried] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const cents = centsFrom(amount)
  const problems: Record<string, string> = {}
  if (!guestId) problems.guest = 'Pick the guest it’s for.'
  if (!cents) problems.amount = 'Enter the amount.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sentOn)) problems.sentOn = 'Enter the day it was sent.'
  else if (sentOn > today()) problems.sentOn = 'That day hasn’t happened yet.'
  const touch = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }))
  const problem = (k: string) =>
    (tried || touched[k]) && problems[k] ? (
      <span className="font-semibold text-[#B42318]">{problems[k]}</span>
    ) : null
  const guest = guests.find((g) => g.id === guestId)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(problems).length > 0 || !guestId || busy) return
    setBusy(true)
    try {
      if (
        await onMatch({
          guestId,
          amountCents: cents,
          sentOn,
          confirm: arrived,
          remember: r.fromStranger && remember,
        })
      )
        onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title="Match this receipt" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <p className="text-body">{r.reason}</p>
        <EmailText from={r.fromAddress} at={r.receivedAt} subject={r.subject} excerpt={r.excerpt} />
        <div className="flex flex-col gap-1.5 text-sm font-semibold">
          Guest
          <Dropdown
            label="Guest"
            value={guestId}
            options={[
              { value: null, label: 'Pick a guest' },
              ...guests.map((g) => ({ value: g.id, label: `${g.firstName} ${g.lastName}` })),
            ]}
            onChange={(v) => {
              setGuestId(v)
              touch('guest')()
            }}
          />
          {problem('guest')}
        </div>
        <div className="grid grid-cols-2 gap-3">
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
            Sent on
            <input
              className={field}
              type="date"
              max={today()}
              value={sentOn}
              onChange={(e) => setSentOn(e.target.value)}
              onBlur={touch('sentOn')}
            />
            {problem('sentOn')}
          </label>
        </div>
        <label className="flex min-h-[44px] items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={arrived}
            onChange={(e) => setArrived(e.target.checked)}
            className="h-5 w-5 accent-royal"
          />
          The money arrived. Confirm it now.
        </label>
        {r.fromStranger && r.fromAddress && (
          <label className="flex min-h-[44px] items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-royal"
            />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              Next time, file receipts from {r.fromAddress} on{' '}
              {guest ? guest.firstName : 'this guest'}.
            </span>
          </label>
        )}
        <button
          type="submit"
          disabled={busy}
          className={`${filled} self-start disabled:opacity-60`}
        >
          {guest ? `Match to ${guest.firstName}` : 'Match'}
          {arrived ? ' and confirm' : ''}
        </button>
      </form>
    </Dialog>
  )
}

/** Putting a forwarded receipt aside, with why from the fixed list. No payment is made. */
function DismissReceiptDialog({
  r,
  onDismiss,
  onClose,
  error,
}: {
  r: ForwardedReceiptItem
  onDismiss: (reason: DismissReceiptReason) => Promise<boolean>
  onClose: () => void
  error?: string | null
}) {
  const [reason, setReason] = useState<DismissReceiptReason>('not_a_payment')
  const [busy, setBusy] = useState(false)
  async function dismiss() {
    setBusy(true)
    try {
      if (await onDismiss(reason)) onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog
      title="Dismiss this receipt?"
      confirmLabel="Dismiss receipt"
      disabled={busy}
      onConfirm={() => void dismiss()}
      onCancel={onClose}
    >
      {error && (
        <p role="alert" className="mb-3 font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      <p className="mb-3">
        {receiptWords(r)} from {r.payerName || r.fromAddress || 'someone'} leaves your Actions. No
        payment is recorded.
      </p>
      <Dropdown
        label="Why"
        value={reason}
        options={DISMISS_RECEIPT_REASONS.map((x) => ({
          value: x,
          label: DISMISS_RECEIPT_LABELS[x],
        }))}
        onChange={setReason}
      />
    </ConfirmDialog>
  )
}

/** "View receipt" on a payment read from a forwarded email: the email, as its proof. */
export function ReceiptProofButton({
  tripId,
  paymentId,
  admin,
}: {
  tripId: string
  paymentId: string
  admin: boolean
}) {
  const [open, setOpen] = useState(false)
  const [proof, setProof] = useState<ReceiptProof | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open || proof) return
    setError(null)
    api
      .getReceiptProof(tripId, paymentId, admin)
      .then(setProof)
      .catch(() => setError('The receipt could not be loaded.'))
  }, [open, proof, tripId, paymentId, admin])
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={outlined}>
        View receipt
      </button>
      {open && (
        <Dialog title="Forwarded receipt" onClose={() => setOpen(false)}>
          {error && (
            <p role="alert" className="font-semibold text-[#B42318]">
              {error}
            </p>
          )}
          {!proof && !error && <p className="text-body">Loading the receipt…</p>}
          {proof && (
            <EmailText
              from={proof.fromAddress}
              at={proof.receivedAt}
              subject={proof.subject}
              excerpt={proof.excerpt}
              checked={proof.senderVerified}
            />
          )}
        </Dialog>
      )}
    </>
  )
}

/**
 * The trip editor's "Forwarded receipts" card: the trip's own address, to give guests, and setting or changing it.
 * The domain is the environment's; organizers pick the part before the @. A change asks first, in a dialog.
 */
export function ReceiptsAddressCard({
  tripId,
  receipts,
  suggestion,
  onSaved,
  children,
}: {
  tripId: string
  receipts: TripReceipts
  /** What to offer before one is set: the trip link. */
  suggestion: string
  onSaved: (receipts: TripReceipts) => void
  /** The trip's own setting for guests' forwards, saved with the trip. */
  children?: ReactNode
}) {
  const [changing, setChanging] = useState(false)
  const [copied, setCopied] = useState(false)
  const domain = receipts.domain ?? 'receipts.travel-hq.app'
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="text-xl font-extrabold">Forwarded receipts</h2>
      <p className="text-body">
        Guests forward their Zelle, Cash App or bank receipt here, and so can you. A receipt that
        names a guest is recorded as their payment. Anything we can’t place waits in Trip Control’s
        Actions for you to match.
      </p>
      {receipts.address ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* On a phone the address wraps at the @, not mid-word. */}
          <span className="min-w-0 font-semibold text-ink [overflow-wrap:anywhere]">
            {receipts.address}
            <wbr />
            <span className="whitespace-nowrap">@{receipts.email?.split('@')[1] ?? domain}</span>
          </span>
          <button
            type="button"
            className={outlined}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(receipts.email ?? `${receipts.address}@${domain}`)
                .then(() => setCopied(true))
            }}
          >
            {copied ? (
              <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className={outlined} onClick={() => setChanging(true)}>
            Change address
          </button>
        </div>
      ) : (
        <button type="button" className={`${filled} self-start`} onClick={() => setChanging(true)}>
          Choose an address
        </button>
      )}
      {!receipts.on && (
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
          Receiving email isn’t switched on here yet, so nothing sent to it arrives for now.
        </p>
      )}
      {children}
      {changing && (
        <AddressDialog
          tripId={tripId}
          current={receipts.address}
          domain={domain}
          suggestion={suggestion}
          onSaved={(r) => {
            onSaved(r)
            setChanging(false)
          }}
          onClose={() => setChanging(false)}
        />
      )}
    </section>
  )
}

/**
 * Choosing or changing the address: the part before the @, checked as typed. A change says what happens to the old
 * one before it saves: it stops working at once and can never be chosen again, here or on any trip.
 */
function AddressDialog({
  tripId,
  current,
  domain,
  suggestion,
  onSaved,
  onClose,
}: {
  tripId: string
  current: string | null
  domain: string
  suggestion: string
  onSaved: (receipts: TripReceipts) => void
  onClose: () => void
}) {
  const toast = useToast()
  const [value, setValue] = useState(current ? '' : suggestion.slice(0, 40).replace(/-+$/, ''))
  const [taken, setTaken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const clean = value.trim().toLowerCase()
  const problem = !clean
    ? 'Enter the part before the @.'
    : !RECEIPTS_ADDRESS_PATTERN.test(clean)
      ? 'Use 3 to 40 lowercase letters, numbers and hyphens, starting and ending with a letter or number.'
      : clean === current
        ? 'That’s the address now.'
        : taken === clean
          ? 'That address isn’t available. Choose another.'
          : null
  async function save() {
    setBusy(true)
    setError(null)
    try {
      const saved = await api.setReceiptsAddress(tripId, clean)
      toast({ text: `Receipts go to ${saved.email ?? `${clean}@${domain}`} now.` })
      onSaved(saved)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setTaken(clean)
      else setError(err instanceof Error ? err.message : 'That didn’t save.')
    } finally {
      setBusy(false)
      setAsking(false)
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    if (problem || busy) return
    if (current) setAsking(true)
    else void save()
  }
  return (
    <Dialog
      title={current ? 'Change the receipts address' : 'Choose a receipts address'}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <ul className="list-disc pl-5 text-sm text-body">
          {current && (
            <li>
              Mail to {current}@{domain} stops arriving at once.
            </li>
          )}
          <li>Give guests the new address. It shows on their trip page with how to pay.</li>
          <li>An address used once can’t be chosen again, here or on any other trip.</li>
        </ul>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          The part before the @
          <span className="flex flex-wrap items-center gap-2">
            <input
              className={`${field} min-w-0 flex-[1_1_160px]`}
              value={value}
              maxLength={40}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={Boolean(value && problem)}
            />
            <span className="break-all font-normal text-muted">@{domain}</span>
          </span>
          {value && problem && <span className="font-semibold text-[#B42318]">{problem}</span>}
        </label>
        <button
          type="submit"
          disabled={busy || Boolean(problem)}
          className={`${filled} self-start disabled:opacity-60`}
        >
          {current ? 'Change address' : 'Save address'}
        </button>
      </form>
      {asking && (
        <ConfirmDialog
          title="Change the receipts address?"
          confirmLabel="Change address"
          disabled={busy}
          onConfirm={() => void save()}
          onCancel={() => setAsking(false)}
        >
          <p>
            Receipts sent to {current}@{domain} stop arriving, and that address can’t be used again.
            New receipts go to {clean}@{domain}.
          </p>
        </ConfirmDialog>
      )}
    </Dialog>
  )
}

/** "Forwarded receipt" under a payment read from one, for the payment line. */
export const fromReceipt = (sentOn: string) =>
  `From a forwarded receipt · sent ${shortDate(sentOn)}`
