import { useClerk } from '@clerk/clerk-react'
import type { MyTerms, PublicTerms } from '@cc/types'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { TermsText } from '@/components/TermsText'
import { api, TERMS_REQUIRED_EVENT } from '@/lib/api'

/**
 * The organizer screens, behind CrewControl's Terms: anyone who runs a trip accepts the Terms of Use and the Organizer
 * Terms first, and again whenever their wording changes (modeled on Audit Differently's TermsGate). The API refuses
 * organizer requests until then (OrganizerTermsGuard); when it refuses one because the wording changed while this tab
 * was open, this screen shows again.
 */
export function OrganizerTerms({ children }: { children: ReactNode }) {
  const [mine, setMine] = useState<MyTerms | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    api
      .getMyTerms()
      .then(setMine)
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(TERMS_REQUIRED_EVENT, load)
    return () => window.removeEventListener(TERMS_REQUIRED_EVENT, load)
  }, [load])

  if (failed && !mine)
    return (
      <p className="mx-auto max-w-md p-8 text-body">
        This page could not be loaded. Please try again in a moment.
      </p>
    )
  if (!mine) return null
  if (mine.organizer.accepted) return <>{children}</>
  return <TermsScreen mine={mine} onAccepted={setMine} />
}

function TermsScreen({ mine, onAccepted }: { mine: MyTerms; onAccepted: (m: MyTerms) => void }) {
  const { signOut } = useClerk()
  const [terms, setTerms] = useState<PublicTerms | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [readAll, setReadAll] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const updated = mine.organizer.previouslyAccepted

  useEffect(() => {
    api
      .getTerms()
      .then(setTerms)
      .catch(() => {
        // A hiccup never locks anyone out: they read the Terms on their own page instead.
        setLoadFailed(true)
        setReadAll(true)
      })
  }, [])

  // Short enough to fit without scrolling: nothing more to read.
  useEffect(() => {
    const el = box.current
    if (terms && el && el.scrollHeight <= el.clientHeight + 4) setReadAll(true)
  }, [terms])

  const onScroll = () => {
    const el = box.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadAll(true)
  }

  const accept = async (e: FormEvent) => {
    e.preventDefault()
    if (!agreed || busy) return
    setBusy(true)
    setError(null)
    try {
      // The versions on screen; the API refuses them if the wording changed in the meantime.
      onAccepted(
        await api.acceptTerms({
          use: terms?.use.version ?? mine.use.version,
          organizer: terms?.organizer.version ?? mine.organizer.version,
        })
      )
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex w-full max-w-[760px] items-center px-5 py-4">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-[760px] px-5 pb-12">
        <form
          onSubmit={accept}
          className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-7"
        >
          <h1 className="text-[clamp(26px,6vw,34px)] font-extrabold leading-tight">
            {updated ? 'Our Terms have been updated' : 'Before you run a trip'}
          </h1>
          <p className="text-body">
            {updated
              ? 'Please read the updated Terms and accept them to keep running your trips.'
              : 'You’re responsible for the trips you run and the money you collect. CrewControl only keeps the record. Please read the Terms and accept them to continue.'}
          </p>
          {error && (
            <p role="alert" className="font-semibold text-[#B42318]">
              {error}
            </p>
          )}
          {loadFailed ? (
            <p className="text-body">
              The Terms did not load here.{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-royal underline"
              >
                Read them in a new tab
              </a>{' '}
              before you accept.
            </p>
          ) : (
            <div
              ref={box}
              onScroll={onScroll}
              tabIndex={0}
              aria-label="CrewControl's Terms"
              className="flex max-h-[55vh] flex-col gap-6 overflow-y-auto rounded-xl bg-ground p-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-royal"
            >
              {terms && (
                <>
                  <TermsText doc={terms.organizer} level={3} />
                  <TermsText doc={terms.use} level={3} />
                </>
              )}
            </div>
          )}
          <p
            role="status"
            className={`text-sm font-semibold ${readAll ? 'text-royal' : 'text-muted'}`}
          >
            {readAll
              ? '✓ You’ve reached the end of the Terms.'
              : '↓ Scroll to the end of the Terms to continue.'}
          </p>
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              disabled={!readAll}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-royal"
            />
            <span>I have read and accept the Organizer Terms and the Terms of Use.</span>
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={!agreed || busy}
              className="min-h-[52px] rounded-xl bg-royal px-6 text-[17px] font-semibold text-white hover:bg-royal-dark disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Accept and continue'}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="min-h-[44px] px-2 font-semibold text-royal underline"
            >
              Sign out
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
