import type { MyInterest, PublicTrip } from '@cc/types'
import { useUser } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { Dialog } from '@/components/Dialog'
import { useToast } from '@/components/Toast'
import { SaveTheDateTile } from '@/components/TripView'
import { api, ApiError } from '@/lib/api'
import { useSignedIn } from '@/lib/auth'

// A save the date's "I'm interested" (issue #47; owner's decisions, 2026-10-31): signed in, with a phone, and the
// confirmation is the tile itself ("You're on the list"), no email. They can take themselves off whenever they like.

const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal bg-white px-4 text-[15px] font-semibold text-royal hover:bg-royal-pale'
const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-4 text-[15px] font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const field =
  'w-full rounded-lg border border-[#5B6B80] px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'

export function InterestTile({ trip }: { trip: PublicTrip }) {
  const signedIn = useSignedIn()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [mine, setMine] = useState<MyInterest | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!signedIn) return setMine(null)
    let live = true
    api
      .getMyInterest(trip.slug)
      .then((m) => live && setMine(m))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [trip.slug, signedIn])

  // Back from signing in to say they're interested: the dialog opens by itself.
  useEffect(() => {
    if (!signedIn || params.get('interested') !== '1') return
    setAsking(true)
    params.delete('interested')
    setParams(params, { replace: true })
  }, [signedIn, params, setParams])

  function interested() {
    if (signedIn) return setAsking(true)
    const back = `${window.location.origin}/t/${trip.slug}?interested=1`
    window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(back)}`)
  }

  async function leave() {
    setBusy(true)
    setError(null)
    try {
      setMine(await api.leaveInterest(trip.slug))
      toast({ text: 'You’re off the list.' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SaveTheDateTile
        trip={trip}
        onList={Boolean(mine?.onList)}
        busy={busy}
        error={error}
        onInterested={interested}
        onLeave={() => void leave()}
      />
      {/* Out of the side column, which is sticky (its own layer): inside it, the photos would paint over the dialog. */}
      {asking &&
        createPortal(
          <InterestDialog
            trip={trip}
            onClose={() => setAsking(false)}
            onDone={(m) => {
              setMine(m)
              setAsking(false)
              toast({ text: `You’re on the list for ${trip.name}.` })
            }}
          />,
          document.body
        )}
    </>
  )
}

function InterestDialog({
  trip,
  onClose,
  onDone,
}: {
  trip: PublicTrip
  onClose: () => void
  onDone: (m: MyInterest) => void
}) {
  const { user } = useUser()
  const [name, setName] = useState(user?.fullName ?? '')
  const [phone, setPhone] = useState(user?.primaryPhoneNumber?.phoneNumber ?? '')
  const [tried, setTried] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problems = {
    name: name.trim() ? null : 'Add your name.',
    phone: phone.replace(/\D/g, '').length >= 7 ? null : 'Add a phone number we can text.',
  }
  const email = user?.primaryEmailAddress?.emailAddress

  async function send() {
    setTried(true)
    if (problems.name || problems.phone || sending) return
    setSending(true)
    try {
      onDone(await api.addInterest(trip.slug, { name: name.trim(), phone: phone.trim() }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t send. Try again.')
      setSending(false)
    }
  }

  return (
    <Dialog title={`Interested in ${trip.name}?`} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <p className="text-body">
          {trip.organizerName} sees your name, email and phone, and will let you know when sign-ups
          open. It doesn’t save you a spot.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="interest-name" className="font-semibold">
            Your name
          </label>
          <input
            id="interest-name"
            className={field}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {tried && problems.name && (
            <span className="text-sm font-semibold text-[#B42318]">{problems.name}</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="interest-phone" className="font-semibold">
            Phone
          </label>
          <input
            id="interest-phone"
            type="tel"
            className={field}
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {tried && problems.phone && (
            <span className="text-sm font-semibold text-[#B42318]">{problems.phone}</span>
          )}
        </div>
        {email && <p className="text-sm text-body">Email: {email} (from your sign-in)</p>}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className={outlined} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={filled} disabled={sending}>
            {sending ? 'Adding…' : 'I’m interested'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
