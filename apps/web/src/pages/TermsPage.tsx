import type { PublicTerms } from '@cc/types'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { TermsText } from '@/components/TermsText'
import { api } from '@/lib/api'

/**
 * Travel HQ's Terms, /terms: the Terms of Use everyone accepts, and the Organizer Terms. The wording comes from the
 * API (src/terms/terms-text.ts), so this page, the join page and the organizer's Terms screen show the same words.
 */
export function TermsPage() {
  const [terms, setTerms] = useState<PublicTerms | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    document.title = 'Terms · Travel HQ'
    api
      .getTerms()
      .then(setTerms)
      .catch(() => setFailed(true))
  }, [])

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[760px] items-center px-5 py-4">
        <Logo />
      </header>

      <main className="mx-auto flex max-w-[760px] flex-col gap-4 px-5 pb-12">
        <h1 className="mt-4 text-4xl font-extrabold">Terms</h1>
        <p className="text-body">
          Everyone who uses Travel HQ accepts the Terms of Use. Anyone who runs a trip accepts the
          Organizer Terms as well. Each trip&apos;s own terms are in the trip agreement its guests
          sign with the organizer. How we handle your information is on our{' '}
          <Link to="/privacy" className="font-semibold text-royal underline">
            Privacy
          </Link>{' '}
          page.
        </p>
        {failed && (
          <p className="font-semibold text-[#B42318]">
            The Terms could not be loaded. Please try again in a moment.
          </p>
        )}
        {terms && (
          <>
            <div id="use" className="rounded-2xl bg-white p-5 shadow-card">
              <TermsText doc={terms.use} />
            </div>
            <div id="organizer" className="rounded-2xl bg-white p-5 shadow-card">
              <TermsText doc={terms.organizer} />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
