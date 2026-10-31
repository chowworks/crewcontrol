import {
  Inbox,
  Luggage,
  Mail,
  MailWarning,
  MessageSquareText,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
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
    text: 'Every trip on Travel HQ: who runs it and who has signed up, to look at read-only or hand to an owner.',
    sub: 'Every trip, to look at read-only or hand to an owner.',
    how: 'Control panel and Edit open a trip read-only: you see its guests and money but change nothing, and a look is not logged. To change a trip, add yourself on its People screen; every change you make to a trip’s people is written to its access log, which its owners can read. Sample trips belong to no one and are reset by the seed, which also clears people added to them. A trip made before sign-in has no owner until an admin takes it over with “Make me the owner”.',
  },
  {
    to: '/admin/requests',
    icon: MessageSquareText,
    title: 'Requests',
    text: 'What people asked for that Travel HQ doesn’t do yet: other refund terms, and early access to start trips.',
    sub: 'What people asked for, newest first.',
    how: 'Organizers suggest refund terms from the trip editor (“Suggest other refund terms”) when the presets don’t fit their trip. While Travel HQ is a limited preview, anyone but an admin who presses New trip can ask for early access instead, once each, with a line about their trip if they like. Each shows who asked, their email, the trip they were setting up, and their words. Nobody can change or delete one.',
  },
  {
    to: '/admin/emails',
    icon: Mail,
    title: 'Emails',
    text: 'The emails Travel HQ sends: their wording and design, with variables for each trip and guest.',
    sub: 'What each email says, with a preview for a sample guest.',
    how: 'Each email is HTML inside Travel HQ’s frame (the purple band and the footer), with variables like {{trip.name}} that are filled in for each guest. A variable that doesn’t exist, or isn’t allowed in that email, stops the save. Payment details are filled in for every guest who signed; show them inside {{#if guest.canPay}}, which is true only for a guest whose trip page shows how to pay. Every subject starts with “[Travel HQ] ”, added for you. Every email also goes out as plain text, made from the HTML. A save applies to every email sent from then on; “Use Travel HQ’s wording” goes back to the default.',
  },
  {
    to: '/admin/email-problems',
    icon: MailWarning,
    title: 'Email problems',
    text: 'Emails that bounced, were blocked or were marked as spam, on every trip, and who they were for.',
    sub: 'Bounces, blocked sends and spam complaints, newest first.',
    how: 'Resend, which sends Travel HQ’s email, tells us each time an email bounces, is blocked because that address bounced before, or is marked as spam. Each one is listed here with the guests on that address. Their organizer sees the same problem in Trip Control’s Actions and fixes the address there; then it shows as fixed. Resend stops sending to a bad address on its own, so nothing here needs you unless a guest asks why they get no email.',
  },
  {
    to: '/admin/forwarded-receipts',
    icon: Inbox,
    title: 'Forwarded receipts',
    text: 'Forwarded payment emails that reached no trip or failed, and every receipts address used.',
    sub: 'Emails that reached no trip or failed, and the addresses trips have used.',
    how: 'Each trip has its own receipts address, chosen by its organizers in the trip editor. A receipt that names a guest becomes their payment; anything else waits in that trip’s Actions. Mail from nobody on the trip that isn’t a payment is refused. Organizers can change an address but never clear it, and an address used once is held so no other trip gets mail meant for the old one. Release it here once nothing has arrived at it for a while; any trip can choose it after that. This page lists only what reached no trip or went wrong: a recorded or matched email is its trip’s. An email Resend couldn’t hand over after five tries shows as Failed; Run again tries once more. Emails are kept for 30 days.',
  },
  {
    to: '/admin/settings',
    icon: SlidersHorizontal,
    title: 'System Settings',
    text: 'Values that apply to every trip on Travel HQ, like the waitlist buffer.',
    sub: 'Values that apply to every trip.',
    how: 'These apply to every trip at once, from the moment you save. They change how trips behave from then on; nothing already decided (a guest on the waitlist, a payment confirmed) changes.',
  },
]

const tool = (to: string) => TOOLS.find((t) => t.to === to)!

/**
 * The frame every admin page shares: the logo and the account menu at the far right. `wide` uses the whole screen,
 * for an editor that needs room (the Emails editor).
 */
export function AdminShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const width = wide ? 'max-w-[1600px]' : 'max-w-[1120px]'
  return (
    <div className="min-h-screen bg-ground pb-16 text-ink">
      <header className={`mx-auto flex ${width} items-center justify-between gap-3 px-5 py-4`}>
        <Logo />
        <AccountMenu />
      </header>
      <main className={`mx-auto flex ${width} flex-col px-5`}>{children}</main>
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
        <p className="mt-1 text-body">Tools for running Travel HQ.</p>
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
