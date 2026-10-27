import { Link, useLocation } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { Logo } from '@/components/Logo'
import { SiteFooter } from '@/components/SiteFooter'

/**
 * The page for an address that leads nowhere, and for a trip that doesn't exist or isn't published. Like Audit
 * Differently's: a way home, and a way to tell us which link was broken.
 */
export function NotFoundPage({ message = "We couldn't find that page." }: { message?: string }) {
  const { pathname } = useLocation()
  const report = `/contact?topic=app-problem&page=${encodeURIComponent(pathname)}`
  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <AccountMenu />
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-center justify-center gap-4 px-5 py-16 text-center">
        <h1 className="text-4xl font-extrabold">Nothing here</h1>
        <p className="text-lg text-body">{message}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Link
            to="/"
            className="inline-flex min-h-[48px] items-center rounded-xl bg-royal px-6 font-semibold text-white hover:bg-royal-dark"
          >
            Back to Travel HQ
          </Link>
          <Link
            to={report}
            className="inline-flex min-h-[48px] items-center rounded-xl border-2 border-royal px-6 font-semibold text-royal hover:bg-royal-pale"
          >
            Tell us about this link
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
