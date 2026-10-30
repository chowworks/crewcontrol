import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { SiteFooter } from '@/components/SiteFooter'

/*
 * DRAFT privacy page, adapted from Audit Differently's. It describes how Travel HQ handles data as the product is
 * built out (organizer sign-in, payment tracking, reminders, the guest portal), as the owner asked, and the banner
 * says some of that is still being built. Keep it in step with the build order in CLAUDE.md, and have it reviewed
 * before launch.
 */
export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[760px] items-center px-5 py-4">
        <Logo />
      </header>

      <main className="mx-auto flex max-w-[760px] flex-col gap-4 px-5 pb-12">
        <h1 className="mt-4 text-4xl font-extrabold">Privacy and Data Protection</h1>
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-[15px] text-body">
          Travel HQ is in early access, and this page is a draft. It describes how we handle data as
          the product comes together. Some of what it covers, like organizer sign-in, payment
          tracking and reminders, is still being built.
        </p>

        <Section title="Our approach">
          <p>
            Travel HQ exists to get a group trip out of the group chat, not to collect data. We keep
            what an organizer needs to run the trip, show each person only what they need to see,
            and never sell any of it.
          </p>
        </Section>

        <Section title="What we collect">
          <ul className="list-disc pl-5">
            <li>
              <strong>Organizers:</strong> your name, email and sign-in details, and the trips you
              create: dates, cost, highlights, key dates, photos, payment instructions and your trip
              settings.
            </li>
            <li>
              <strong>Guests:</strong> your sign-in details, the name, phone number and email you
              give when you join a trip, whether the organizer has accepted you, and the messages
              and reminders the trip sends you.
            </li>
            <li>
              <strong>Trip agreements:</strong> the agreement you signed, exactly as you saw it,
              with the name you typed, when you signed, and the internet address and browser you
              signed from, so it can be shown later what you agreed to.
            </li>
            <li>
              <strong>Terms you accepted:</strong> which version of Travel HQ&apos;s Terms of Use
              (and, for organizers, the Organizer Terms) you accepted, when, and the internet
              address and browser you accepted them from.
            </li>
            <li>
              <strong>Refused joins:</strong> if you try to join a trip with an email that
              can&apos;t be used, what you typed, your account, and the internet address and browser
              you used, shown to that trip&apos;s organizers.
            </li>
            <li>
              <strong>Payment records:</strong> what the organizer logs about who paid, how much,
              when and how (for example &ldquo;Zelle, $300, March 1&rdquo;), and each guest&apos;s
              plan and balance.
            </li>
          </ul>
          <p>
            We never collect card numbers or bank logins. Travel HQ doesn&apos;t process, move or
            hold money: guests pay the organizer directly, and we keep the record.
          </p>
        </Section>

        <Section title="Who sees it">
          <ul className="list-disc pl-5">
            <li>
              <strong>The organizer</strong> sees their trip&apos;s guest list, contact details,
              signed agreements and payment records, and no other organizer&apos;s.
            </li>
            <li>
              <strong>Each guest</strong> sees the trip page and, once they join, their own signed
              agreement, plan, payments and balance. Guests never see each other&apos;s phone
              numbers, emails or balances.
            </li>
            <li>
              <strong>The public trip page</strong> never shows phone numbers, emails or money owed.
              If the organizer turns on &ldquo;who&apos;s going&rdquo;, it shows accepted guests by
              first name and last initial.
            </li>
            <li>
              <strong>Our service providers</strong> for hosting, sign-in, email and text messages
              handle data only to run Travel HQ for us, under agreements that require them to
              protect it.
            </li>
          </ul>
        </Section>

        <Section title="Messages to your crew">
          <p>
            Reminders and announcements go to guests only because their organizer set them up for
            that trip. We don&apos;t send marketing to guests, and we don&apos;t share their contact
            details with anyone for marketing. Guests can stop reminders for a trip at any time.
          </p>
        </Section>

        <Section title="How it's protected">
          <ul className="list-disc pl-5">
            <li>Data is encrypted in transit (HTTPS) and at rest.</li>
            <li>
              Organizers sign in to reach their trips, and each trip is visible only to its
              organizer.
            </li>
            <li>Only people who need access to run the service have it.</li>
            <li>We keep only what a trip needs, and you can delete it when you&apos;re done.</li>
          </ul>
          <p>
            No method of storing or sending data over the internet is 100% secure. If something goes
            wrong that affects your data, we&apos;ll tell you.
          </p>
        </Section>

        <Section title="Keeping and deleting data">
          <p>
            A trip&apos;s owner can delete it, and with it the trip&apos;s guest list and payment
            records, whenever they choose. Travel HQ has them download everything on the trip first,
            and emails each guest who signed their own signed agreement and payments. A deleted trip
            is hidden at once and erased for good 30 days later; until then its owner can restore
            it. Organizers are responsible for keeping their own copies of anything they need.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can ask to see, correct or delete the personal data we hold about you, or object to
            how we use it. Use{' '}
            <Link
              to="/contact?topic=privacy"
              className="font-semibold text-royal hover:text-royal-dark"
            >
              our contact form
            </Link>{' '}
            and we&apos;ll take care of it. Guests can also ask their trip&apos;s organizer.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about your data or this page:{' '}
            <Link
              to="/contact?topic=privacy"
              className="font-semibold text-royal hover:text-royal-dark"
            >
              our contact form
            </Link>
          </p>
        </Section>
      </main>

      <SiteFooter />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-5 text-body shadow-card">
      <h2 className="text-xl font-extrabold text-ink">{title}</h2>
      {children}
    </section>
  )
}
