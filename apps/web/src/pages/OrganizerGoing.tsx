import { useUser } from '@clerk/clerk-react'
import { UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'

/** An organizer going on their own trip (issue #53): their details as a guest's, from sign-in. */
export interface OrganizerGoingInput {
  name: string
  phone: string
  email: string
}

// Trip Control's buttons (TripGuests.tsx).
const filled =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-royal px-3 text-sm font-semibold text-white hover:bg-royal-dark'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'
const input =
  'min-h-[44px] rounded-[10px] border border-[#5B6B80] bg-white px-3.5 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** "I'm going too" in Manage Guests, and the dialog that takes the organizer's spot. */
export function GoingButton({
  spotsLeft,
  onGoing,
}: {
  /** Spots still open, or null with no limit. */
  spotsLeft: number | null
  onGoing: (input: OrganizerGoingInput) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${outlined} self-start`}>
        <UserPlus className="h-5 w-5" aria-hidden="true" />
        I’m going too
      </button>
      {open && (
        <GoingDialog spotsLeft={spotsLeft} onGoing={onGoing} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function GoingDialog({
  spotsLeft,
  onGoing,
  onClose,
}: {
  spotsLeft: number | null
  onGoing: (input: OrganizerGoingInput) => Promise<boolean>
  onClose: () => void
}) {
  const { user } = useUser()
  const [draft, setDraft] = useState<OrganizerGoingInput>(() => ({
    name: user?.fullName ?? '',
    phone: user?.primaryPhoneNumber?.phoneNumber ?? '',
    email: user?.primaryEmailAddress?.emailAddress ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const problems = {
    name: draft.name.trim() ? null : 'Add your name.',
    phone: draft.phone.replace(/\D/g, '').length < 7 ? 'Add a phone number.' : null,
    email: EMAIL.test(draft.email.trim()) ? null : 'Enter an email address.',
  }
  const full = spotsLeft !== null && spotsLeft <= 0
  const ok = !full && !problems.name && !problems.phone && !problems.email
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    try {
      if (await onGoing({ ...draft, email: draft.email.trim().toLowerCase() })) onClose()
    } finally {
      setBusy(false)
    }
  }
  const field = (key: keyof OrganizerGoingInput, label: string, type: string) => (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      <input
        type={type}
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        aria-invalid={Boolean(problems[key])}
        className={input}
      />
      {problems[key] && <span className="font-semibold text-[#B42318]">{problems[key]}</span>}
    </label>
  )
  return (
    <Dialog title="Going on this trip too?" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {full && (
          <p role="alert" className="font-semibold text-[#B42318]">
            Every spot is taken. Raise the number of spots in the trip editor first.
          </p>
        )}
        <p className="text-body">
          You take one of the trip’s spots now, with no need to accept yourself.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-body">
          <li>You don’t sign the trip agreement.</li>
          <li>You owe nothing here. To track your own share, add a charge in your Details.</li>
          <li>Guests see you as one of the crew.</li>
        </ul>
        {field('name', 'Your name', 'text')}
        {field('phone', 'Phone', 'tel')}
        {field('email', 'Email', 'email')}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy || !ok} className={`${filled} disabled:opacity-60`}>
            Take my spot
          </button>
          <button type="button" onClick={onClose} className={outlined}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/** "I'm not going" on the organizer's own row, asked first: it gives their spot back. */
export function NotGoingButton({ onNotGoing }: { onNotGoing: () => Promise<boolean> }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAsking(true)} className={outlined}>
        I’m not going
      </button>
      {asking && (
        <ConfirmDialog
          title="Give up your spot?"
          confirmLabel="Give it up"
          disabled={busy}
          onConfirm={async () => {
            setBusy(true)
            try {
              if (await onNotGoing()) setAsking(false)
            } finally {
              setBusy(false)
            }
          }}
          onCancel={() => setAsking(false)}
        >
          Your spot opens for a guest. Anything you logged on your balance stays in the trip’s
          history.
        </ConfirmDialog>
      )}
    </>
  )
}

/**
 * Editor step 2, beside the number of spots (owner's decision, 2026-11-01): whether the organizer is going too, and
 * their phone if so. Saving the step takes their spot. Once they're going, it says so; giving the spot back is on Trip
 * Control.
 */
export function GoingQuestion({
  going,
  want,
  phone,
  phoneProblem,
  onWant,
  onPhone,
}: {
  going: boolean
  want: boolean | null
  phone: string
  phoneProblem: string | null
  onWant: (want: boolean) => void
  onPhone: (phone: string) => void
}) {
  if (going)
    return (
      <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
        You’re going on this trip, so one of these spots is yours. To give it up, use “I’m not
        going” in Manage Guests on Trip Control.
      </p>
    )
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1 text-sm font-semibold">Are you going on this trip too?</legend>
      <p className="mb-1 text-sm text-muted">
        Yes takes one of the spots above for you when you save. You don’t sign the trip agreement or
        accept yourself.
      </p>
      <div className="flex flex-wrap gap-3">
        {[
          { value: true, label: 'Yes, I’m going' },
          { value: false, label: 'No' },
        ].map((o) => (
          <label
            key={o.label}
            className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3.5 ${
              want === o.value ? 'border-royal bg-royal-pale' : 'border-rule'
            }`}
          >
            <input
              type="radio"
              name="organizerGoing"
              checked={want === o.value}
              onChange={() => onWant(o.value)}
              className="h-4 w-4 accent-royal"
            />
            <span className="font-semibold">{o.label}</span>
          </label>
        ))}
      </div>
      {want && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Your phone
          <input
            type="tel"
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
            aria-invalid={Boolean(phoneProblem)}
            className={input}
          />
          {phoneProblem ? (
            <span className="font-semibold text-[#B42318]">{phoneProblem}</span>
          ) : (
            <span className="font-normal text-muted">
              So guests and other organizers can reach you, as with every guest.
            </span>
          )}
        </label>
      )}
    </fieldset>
  )
}
