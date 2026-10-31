import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { FAQ } from '@/lib/faq'

/** Stub FAQ page. Questions live in lib/faq.ts so the homepage can show the first few. */
export function FaqPage() {
  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[760px] items-center px-5 py-4">
        <Logo />
      </header>
      <main className="mx-auto flex max-w-[760px] flex-col gap-4 px-5 pb-12">
        <h1 className="mt-4 text-4xl font-extrabold">Questions organizers ask</h1>
        <dl className="flex flex-col gap-3">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-2xl bg-white p-5 shadow-card">
              <dt className="text-lg font-extrabold">{f.q}</dt>
              <dd className="mt-1 text-body">{f.a}</dd>
            </div>
          ))}
        </dl>
        <p className="text-body">
          Something else? Send us a message through{' '}
          <Link
            to="/contact?topic=question"
            className="font-semibold text-royal hover:text-royal-dark"
          >
            our contact form
          </Link>
          .
        </p>
      </main>
    </div>
  )
}
