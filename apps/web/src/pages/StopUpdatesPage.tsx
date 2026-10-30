import type { StopUpdatesView } from '@cc/types'
import { BellOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { SiteFooter } from '@/components/SiteFooter'
import { api } from '@/lib/api'

/**
 * Where "Stop updates for this trip" in a reminder email lands. No sign-in: the link's secret names the guest. Opening
 * the page changes nothing (mail scanners open links); the button does, and the same page turns them back on.
 */
export function StopUpdatesPage() {
  const { token = '' } = useParams()
  const [view, setView] = useState<StopUpdatesView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .getStopUpdates(token)
      .then(setView)
      .catch(() => setError('This link doesn’t work any more.'))
  }, [token])

  async function set(stopped: boolean) {
    setBusy(true)
    setError(null)
    try {
      setView(await api.setStopUpdates(token, stopped))
    } catch {
      setError('That didn’t go through. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const filled =
    'inline-flex min-h-[48px] items-center rounded-xl bg-royal px-6 font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
  const outlined =
    'inline-flex min-h-[48px] items-center rounded-xl border border-royal px-6 font-semibold text-royal hover:bg-royal-pale disabled:opacity-60'

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[640px] items-center px-5 py-4">
        <Logo />
      </header>
      <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-5 pb-12">
        <section className="mt-4 flex flex-col items-start gap-3 rounded-2xl bg-white p-6 shadow-card">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-royal-pale text-royal">
            <BellOff className="h-5 w-5" aria-hidden="true" />
          </span>
          {error && (
            <p role="alert" className="font-semibold text-[#B42318]">
              {error}
            </p>
          )}
          {!view ? (
            !error && <p className="text-body">Loading…</p>
          ) : view.stopped ? (
            <>
              <h1 className="text-2xl font-extrabold">Updates stopped</h1>
              <p className="text-body">
                {view.firstName}, you won’t get reminders or announcement emails for {view.tripName}
                any more. Announcements still show on your trip page, and emails about your spot,
                like being accepted, still come.
              </p>
              <button type="button" disabled={busy} onClick={() => set(false)} className={outlined}>
                Turn updates back on
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold">Stop updates for {view.tripName}?</h1>
              <p className="text-body">
                {view.firstName}, you’ll stop getting emailed reminders and announcements for this
                trip. Announcements still show on your trip page, and you can turn emails back on
                here any time.
              </p>
              <button type="button" disabled={busy} onClick={() => set(true)} className={filled}>
                Stop updates
              </button>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
