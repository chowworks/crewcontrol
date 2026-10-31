import { Link } from 'react-router-dom'
import { Logo } from './Logo'

/** Travel HQ's own public status page (Better Stack, docs/monitoring.md). The badge is served from it. */
export const STATUS_PAGE_URL = 'https://status.travel-hq.app'

/** The footer under every page: who we are, how data is handled, who to write to, and the live status badge. */
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
        <Link to="/contact?topic=feature" className="py-2 hover:text-royal">
          Request a feature
        </Link>
        {/* A plain link: the release notes are a static page outside the app (apps/web/vite.config.ts). */}
        <a href="/release-notes/" className="py-2 hover:text-royal">
          Release notes
        </a>
      </nav>
      {/* Fixed size, so the footer keeps its shape if the badge is blocked or slow. */}
      <iframe
        title="Travel HQ system status"
        src={`${STATUS_PAGE_URL}/badge?theme=light`}
        width={250}
        height={30}
        loading="lazy"
        scrolling="no"
        className="max-w-full border-0"
        style={{ colorScheme: 'normal' }}
      />
    </footer>
  )
}
