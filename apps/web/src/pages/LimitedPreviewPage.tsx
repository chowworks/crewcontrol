import { useUser } from '@clerk/clerk-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { field } from '@/components/EditorParts'
import { Logo } from '@/components/Logo'
import { SampleTripCards } from '@/components/SampleTripCards'
import { api } from '@/lib/api'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * What anyone but an admin sees on New trip while Travel HQ is a limited preview (owner's decision, 2026-10-30), with
 * no sign-in: the early access form (name, email, an optional note), asking someone who runs a trip here to refer
 * them, and the sample trips. The API refuses the trip itself too (TripsService.create).
 */
export function LimitedPreviewPage() {
  const { user } = useUser()
  const [form, setForm] = useState({
    name: user?.fullName ?? '',
    email: user?.primaryEmailAddress?.emailAddress ?? '',
    note: '',
    website: '',
  })
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const problems = {
    name: form.name.trim() ? null : 'Enter your name.',
    email: EMAIL.test(form.email.trim()) ? null : 'Enter your email address.',
  }

  const set =
    (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  async function send(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (problems.name || problems.email || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.askEarlyAccess(form)
      setSentTo(form.email.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t send. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const fieldError = (problem: string | null) =>
    tried && problem && <span className="font-semibold text-[#B42318]">{problem}</span>

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <AccountMenu />
      </header>

      <main className="mx-auto max-w-[1120px] px-5 pt-6 sm:pt-12">
        <div className="flex max-w-[640px] flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="w-fit rounded-full bg-marigold px-3 py-1 text-sm font-semibold text-ink">
              Limited preview
            </span>
            <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
              Travel HQ is in a limited preview
            </h1>
            <p className="text-lg text-body">
              For now, only preview and invited users can start new trips. Get on the early access
              list and we’ll let you know when you can run yours.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-card">
            {sentTo ? (
              <div role="status" className="flex flex-col gap-1.5">
                <h2 className="text-2xl font-extrabold">You’re on the list</h2>
                <p className="text-body">
                  We’ll email <strong className="text-ink">{sentTo}</strong> when you can start a
                  trip.
                </p>
              </div>
            ) : (
              <form onSubmit={send} noValidate className="relative flex flex-col gap-4">
                {error && (
                  <p role="alert" className="font-semibold text-[#B42318]">
                    {error}
                  </p>
                )}
                <h2 className="text-2xl font-extrabold">Get early access</h2>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Name
                  <input
                    className={`${field} font-normal`}
                    value={form.name}
                    onChange={set('name')}
                    maxLength={120}
                    autoComplete="name"
                    aria-invalid={Boolean(tried && problems.name)}
                  />
                  {fieldError(problems.name)}
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Email
                  <input
                    className={`${field} font-normal`}
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    maxLength={254}
                    autoComplete="email"
                    aria-invalid={Boolean(tried && problems.email)}
                  />
                  {fieldError(problems.email)}
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  What trip do you want to run? (optional)
                  <textarea
                    className={`${field} min-h-[100px] font-normal`}
                    value={form.note}
                    maxLength={2000}
                    onChange={set('note')}
                    placeholder="For example: a 30th birthday in Cabo next spring, about 12 of us."
                  />
                </label>
                {/* A honeypot, as on the contact form: out of sight and out of the tab order, so only a bot fills it. */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '-10000px',
                    width: 1,
                    height: 1,
                    overflow: 'hidden',
                  }}
                >
                  <input
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={set('website')}
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-[48px] items-center justify-center self-start rounded-xl bg-royal px-6 font-semibold text-white hover:bg-royal-dark disabled:opacity-60"
                >
                  {busy ? 'Sending…' : 'Get on the list'}
                </button>
              </form>
            )}
          </div>

          <p className="rounded-xl bg-royal-pale px-4 py-3 text-body">
            Know someone who already runs a trip on Travel HQ? Ask them to refer you.
          </p>
        </div>
      </main>

      <SampleTripCards>
        <h2 className="text-3xl font-extrabold">See what your crew would see</h2>
        <p className="mt-2 text-lg text-body">
          Open a sample trip to see the page your guests get.{' '}
          <Link to="/" className="font-semibold text-royal hover:text-royal-dark">
            More about Travel HQ
          </Link>
        </p>
      </SampleTripCards>
    </div>
  )
}
