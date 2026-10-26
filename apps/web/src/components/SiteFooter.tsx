import { Link } from 'react-router-dom'
import { Logo } from './Logo'

/** The footer on public pages: who we are, how data is handled, and who to write to. */
export function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-4 px-5 pb-10 text-sm text-muted">
      <div className="flex flex-col gap-1">
        <Logo />
        <span>Get your trip out the group chat.</span>
      </div>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1 font-semibold">
        <Link to="/faq" className="py-2 hover:text-royal">
          FAQ
        </Link>
        <Link to="/privacy" className="py-2 hover:text-royal">
          Privacy
        </Link>
        <Link to="/terms" className="py-2 hover:text-royal">
          Terms
        </Link>
        <Link to="/contact" className="py-2 hover:text-royal">
          Contact us
        </Link>
      </nav>
    </footer>
  )
}
