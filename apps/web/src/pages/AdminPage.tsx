import { Luggage, MessageSquareText, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { Logo } from '@/components/Logo'

/**
 * The tools, in the order the Admin toolbox shows them, the way Audit Differently lists its admin tools. Each tool's
 * page reads its header from here (AdminToolHead): the tile's icon and title, `sub` (one line: what to do here) and
 * `how` (the longer explanation, behind "How this works"). A new tool adds an entry here (CLAUDE.md "Design rules").
 */
const TOOLS: {
  to: string
  icon: LucideIcon
  title: string
  text: string
  sub: string
  how: string
}[] = [
  {
    to: '/admin/trips',
    icon: Luggage,
    title: 'Trip admin',
    text: 'Every trip on CrewControl: who runs it, who has signed up, and a way into its Trip Control panel.',
    sub: 'Every trip, with a way into each one’s Trip Control panel.',
    how: 'Opening a trip’s Trip Control panel or editor seats you on it as an organizer, so you see its guests; every seat is written to the trip’s access log, which its owners can read. Sample trips belong to no one and are reset by the seed, which also clears seats on them. A trip made before sign-in has no owner until an admin takes it over with “Make me the owner”.',
  },
  {
    to: '/admin/requests',
    icon: MessageSquareText,
    title: 'Organizer requests',
    text: 'What organizers asked for that CrewControl doesn’t do yet, like other refund terms.',
    sub: 'What organizers asked for, newest first.',
    how: 'Organizers send these from the trip editor (“Suggest other refund terms”) when the presets don’t fit their trip. Each shows who asked, the trip they were setting up, and their words. Nobody can change or delete one.',
  },
  {
    to: '/admin/settings',
    icon: SlidersHorizontal,
    title: 'System Settings',
    text: 'Values that apply to every trip on CrewControl, like the waitlist buffer.',
    sub: 'Values that apply to every trip.',
    how: 'These apply to every trip at once, from the moment you save. They change how trips behave from then on; nothing already decided (a guest on the waitlist, a payment confirmed) changes.',
  },
]

const tool = (to: string) => TOOLS.find((t) => t.to === to)!

/** The frame every admin page shares: the logo and the account menu at the far right. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ground pb-16 text-ink">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <AccountMenu />
      </header>
      <main className="mx-auto flex max-w-[1120px] flex-col px-5">{children}</main>
    </div>
  )
}

/** The Admin toolbox: one tile per tool, for admins (Clerk public metadata `{"role": "admin"}`). */
export function AdminPage() {
  return (
    <AdminShell>
      <div className="mb-6 mt-2">
        <p className="text-sm font-semibold text-muted">Platform admin</p>
        <h1 className="text-3xl font-extrabold">Admin toolbox</h1>
        <p className="mt-1 text-body">Tools for running CrewControl.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group flex flex-col items-start gap-2 rounded-2xl border border-rule bg-white p-6 shadow-card focus:outline-none focus-visible:ring-4 focus-visible:ring-royal"
          >
            <ToolIcon icon={t.icon} />
            <span className="text-[17px] font-bold">{t.title}</span>
            <span className="min-h-[3em] text-sm text-muted">{t.text}</span>
            <span className="mt-auto pt-1 font-bold text-royal group-hover:underline">
              Open tool →
            </span>
          </Link>
        ))}
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-rule p-6">
          <span className="text-[17px] font-bold text-muted">More tools coming</span>
          <span className="text-sm text-muted">New admin tools will appear here.</span>
        </div>
      </div>
    </AdminShell>
  )
}

function ToolIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="mb-2 grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-royal-pale text-royal">
      <Icon className="h-7 w-7" aria-hidden="true" />
    </span>
  )
}

/** A tool page's breadcrumb (Admin toolbox / the tool) and header: the tile's icon, the title and one line. */
export function AdminToolHead({ to }: { to: string }) {
  const t = tool(to)
  return (
    <>
      <nav className="mb-3 mt-2 text-sm text-muted" aria-label="Breadcrumb">
        <Link to="/admin" className="text-royal hover:underline">
          Admin toolbox
        </Link>{' '}
        / {t.title}
      </nav>
      <div className="mb-5 flex items-center gap-4">
        <ToolIcon icon={t.icon} />
        <div>
          <h1 className="text-3xl font-extrabold">{t.title}</h1>
          <p className="mt-0.5 text-body">{t.sub}</p>
        </div>
      </div>
    </>
  )
}

/** The longer explanation of a tool, closed until asked for, at the end of the tool's page. */
export function AdminHow({ to }: { to: string }) {
  return (
    <details className="mt-4 text-[13px] text-muted">
      <summary className="cursor-pointer font-semibold">How this works</summary>
      <p className="mt-1">{tool(to).how}</p>
    </details>
  )
}
