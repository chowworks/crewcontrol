import { PAID_FEATURES, type MyFeatures, type PaidFeature } from '@cc/types'
import { ArrowLeft, Gem } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { Dialog } from '@/components/Dialog'
import { HelpButton } from '@/components/HelpButton'
import { Logo } from '@/components/Logo'
import { api } from '@/lib/api'
import { IconCircle } from './TripGuests'

// Paid features (issue #90): what an organizer has, and asking to try one early (owner's ask, 2026-11-15: until
// pricing is decided, a feature you don't have offers early access, which lands in Review Customer Requests). Reached
// from the Help panel and from the popup that introduces a new feature.

const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-royal px-4 font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale'

const day = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

export function PaidFeaturesPage() {
  const [mine, setMine] = useState<MyFeatures | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState<PaidFeature | null>(null)
  // Asked this visit, so the button says so instead of asking again.
  const [asked, setAsked] = useState<PaidFeature[]>([])

  useEffect(() => {
    api
      .myFeatures()
      .then(setMine)
      .catch(() => setError('Your membership could not be loaded. Reload to try again.'))
  }, [])

  return (
    <div className="min-h-screen bg-ground pb-16 text-ink">
      <header className="mx-auto flex max-w-[960px] items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <Link to="/organize" className={outlined}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Your trips
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto flex max-w-[960px] flex-col gap-6 px-5">
        <div>
          <h1 className="text-3xl font-extrabold">Your Membership</h1>
          <p className="mt-1 text-body">
            Paid features on top of running a trip, which stays free. Travel HQ never takes a cut of
            the trip money.
          </p>
        </div>
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        {mine && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {PAID_FEATURES.map((f) => {
              const status = mine.features.find((x) => x.key === f.key)
              return (
                <li
                  key={f.key}
                  className="flex flex-col items-start gap-3 rounded-2xl bg-white p-5 shadow-card sm:p-6"
                >
                  <IconCircle icon={Gem} />
                  <h2 className="flex flex-wrap items-center gap-2 text-xl font-extrabold">
                    {f.title}
                    {!f.built && (
                      <span className="rounded-full bg-royal-pale px-2.5 py-0.5 text-xs font-semibold text-royal">
                        Coming soon
                      </span>
                    )}
                  </h2>
                  <p className="text-body">{f.text}</p>
                  <div className="mt-auto pt-1">
                    {status?.has ? (
                      <p className="rounded-xl bg-royal-pale px-4 py-3 font-semibold text-royal">
                        You have it
                        {status.endsOn ? ` through ${day(status.endsOn)}` : ''}.
                      </p>
                    ) : asked.includes(f.key) ? (
                      <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
                        Thanks, we’ve got your ask. We’ll reply by email.
                      </p>
                    ) : (
                      <button type="button" onClick={() => setAsking(f.key)} className={filled}>
                        Ask for early access
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>
      <HelpButton page="features" />
      {asking && (
        <AskDialog
          feature={asking}
          onClose={() => setAsking(null)}
          onSent={() => setAsked((a) => [...a, asking])}
        />
      )}
    </div>
  )
}

/** Asking to try a feature early: why is optional; the end of the flow replaces the form. */
function AskDialog({
  feature,
  onClose,
  onSent,
}: {
  feature: PaidFeature
  onClose: () => void
  onSent: () => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const title = PAID_FEATURES.find((f) => f.key === feature)?.title ?? ''

  async function send(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      await api.addRequest({ kind: 'feature_access', feature, text: text.trim() })
      setSent(true)
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t send. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog title={`Try ${title} early`} onClose={onClose}>
      {sent ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-xl font-extrabold">Thanks, we’ve got it</h3>
          <p className="text-body">We’ll reply to you by email.</p>
          <button type="button" onClick={onClose} className={`${outlined} w-fit`}>
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-4" noValidate>
          {error && (
            <p role="alert" className="font-semibold text-[#B42318]">
              {error}
            </p>
          )}
          <p className="text-body">
            Paid features are being tried by a few organizers first. Ask and we’ll reply by email.
          </p>
          <label className="flex flex-col gap-1.5 font-semibold text-ink">
            Tell us how you’d use it (optional)
            <textarea
              value={text}
              rows={4}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              placeholder="Our reunion is every summer and I’d like one link for it"
              className="w-full rounded-xl border border-[#5B6B80] bg-white px-3.5 py-3 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={sending} className={filled}>
              {sending ? 'Sending…' : 'Ask for early access'}
            </button>
            <button type="button" onClick={onClose} className={outlined}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
