import { HELP_ASK_MAX, HELP_TOPICS, type HelpEntry, type HelpPage, type HelpTopic } from '@cc/types'
import { ChevronDown, CircleHelp, Search } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import { Dialog } from './Dialog'
import { useToastShowing } from './Toast'

// Organizer help (issue #66, owner's pick 2026-11-01): a floating Help button at the bottom right of every organizer
// page opens the help in a dialog, starting with the questions for the page or editor step the organizer is on, then
// every topic folded into sections, then "Ask us a question". The answers come from the API: Travel HQ's defaults
// (apps/api/src/help/help-defaults.ts) with the admin's changes.

const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-royal px-4 font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale'
const field =
  'w-full rounded-xl border border-[#5B6B80] bg-white px-3.5 py-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'

// Loaded once per visit: the answers rarely change, and every organizer page shares them.
let loaded: Promise<HelpEntry[]> | null = null
const loadHelp = () => {
  loaded ??= api.help().catch((err) => {
    loaded = null
    throw err
  })
  return loaded
}

/** The answer's paragraphs: a blank line starts a new one, a single line break stays a line break. */
function Answer({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 pb-3 text-[15px] leading-relaxed text-body">
      {text.split(/\n\s*\n/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  )
}

/** One question that unfolds to its answer. */
function Item({ entry, open: startOpen = false }: { entry: HelpEntry; open?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const id = useId()
  return (
    <li className="border-t border-rule first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex min-h-[48px] w-full items-start gap-3 py-3 text-left font-semibold text-ink"
      >
        <span className="flex-1">{entry.question}</span>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 shrink-0 text-royal transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={id}>
          <Answer text={entry.answer} />
        </div>
      )}
    </li>
  )
}

/** A topic in "All topics": folded until opened, with how many questions it holds. */
function Topic({ label, entries }: { label: string; entries: HelpEntry[] }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className="rounded-xl border border-rule">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left font-bold text-ink"
      >
        <span className="flex-1">{label}</span>
        <span className="rounded-full bg-royal-pale px-2.5 py-0.5 text-sm font-semibold text-royal">
          {entries.length}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-royal transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul id={id} className="px-4">
          {entries.map((e) => (
            <Item key={e.key} entry={e} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** Every word typed appears in the question or its answer. */
export function matches(entry: HelpEntry, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const text = `${entry.question} ${entry.answer}`.toLowerCase()
  return words.every((w) => text.includes(w))
}

function Ask({ page, tripId, onBack }: { page: HelpPage; tripId?: string; onBack: () => void }) {
  const [question, setQuestion] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function send(e: FormEvent) {
    e.preventDefault()
    const text = question.trim()
    if (!text) return setProblem('Type your question first.')
    setSending(true)
    setError(null)
    try {
      await api.askHelp({ question: text, page, tripId })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t send. Try again.')
    } finally {
      setSending(false)
    }
  }

  if (sent)
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-xl font-extrabold">Thanks, we’ve got it</h3>
        <p className="text-body">We’ll email you the answer.</p>
        <button type="button" onClick={onBack} className={`${outlined} w-fit`}>
          Back to help
        </button>
      </div>
    )
  return (
    <form onSubmit={send} className="flex flex-col gap-3" noValidate>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1.5 font-semibold text-ink">
        Your question
        <textarea
          value={question}
          maxLength={HELP_ASK_MAX}
          rows={4}
          onChange={(e) => {
            setQuestion(e.target.value)
            setProblem(null)
          }}
          className={`${field} font-normal`}
          placeholder="What do you want to know about Travel HQ?"
        />
        {problem && <span className="text-sm font-semibold text-[#B42318]">{problem}</span>}
      </label>
      <p className="text-sm text-muted">
        We answer by email. Good questions join this help for everyone, without your name.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={sending} className={filled}>
          {sending ? 'Sending…' : 'Send question'}
        </button>
        <button type="button" onClick={onBack} className={outlined}>
          Back to help
        </button>
      </div>
    </form>
  )
}

function HelpPanel({ page, tripId }: { page: HelpPage; tripId?: string }) {
  const [entries, setEntries] = useState<HelpEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    loadHelp()
      .then(setEntries)
      .catch(() => setError('Help could not be loaded. Close it and try again.'))
  }, [])

  if (asking) return <Ask page={page} tripId={tripId} onBack={() => setAsking(false)} />
  if (error)
    return (
      <p role="alert" className="font-semibold text-[#B42318]">
        {error}
      </p>
    )
  if (!entries) return <p className="text-muted">Loading…</p>

  const here = entries.filter((e) => e.pages.includes(page))
  const found = query.trim() ? entries.filter((e) => matches(e, query)) : null
  const byTopic = (t: HelpTopic) => entries.filter((e) => e.topic === t)

  return (
    <div className="flex flex-col gap-5">
      <label className="relative block">
        <span className="sr-only">Search help</span>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help"
          className={`${field} pl-11`}
        />
      </label>

      {found ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-royal">
            {found.length === 0
              ? 'Nothing matches'
              : `${found.length} ${found.length === 1 ? 'answer' : 'answers'}`}
          </h3>
          {/* Typing drops the sections: a flat list with every answer open (owner's ask, 2026-11-01). */}
          <ul key={query}>
            {found.map((e) => (
              <Item key={e.key} entry={e} open />
            ))}
          </ul>
        </section>
      ) : (
        <>
          {here.length > 0 && (
            <section className="flex flex-col gap-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-royal">
                On this page
              </h3>
              <ul>
                {here.map((e) => (
                  <Item key={e.key} entry={e} />
                ))}
              </ul>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-royal">All topics</h3>
            <ul className="flex flex-col gap-2">
              {HELP_TOPICS.filter((t) => byTopic(t.value).length > 0).map((t) => (
                <Topic key={t.value} label={t.label} entries={byTopic(t.value)} />
              ))}
            </ul>
          </section>
        </>
      )}

      <div className="flex flex-col items-start gap-3 rounded-xl bg-royal-pale px-4 py-3">
        <p className="text-ink">Didn’t find it? Ask us and we’ll email you the answer.</p>
        <button type="button" onClick={() => setAsking(true)} className={filled}>
          Ask us a question
        </button>
      </div>
    </div>
  )
}

/**
 * The floating Help button and its dialog, for an organizer page. `page` picks the questions shown first. While a
 * toast is on screen the button moves up out of its way.
 */
export function HelpButton({ page, tripId }: { page: HelpPage; tripId?: string }) {
  const [open, setOpen] = useState(false)
  const toastShowing = useToastShowing()
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed right-4 z-40 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-royal pl-3.5 pr-5 text-base font-bold text-white shadow-[0_8px_20px_rgba(63,30,102,0.35)] transition-[bottom] hover:bg-royal-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-royal/40 motion-reduce:transition-none ${
          toastShowing
            ? 'bottom-[calc(6rem+env(safe-area-inset-bottom,0px))]'
            : 'bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]'
        }`}
      >
        <CircleHelp className="h-6 w-6" aria-hidden="true" />
        Help
      </button>
      {open && (
        <Dialog title="Help" onClose={() => setOpen(false)}>
          <HelpPanel page={page} tripId={tripId} />
        </Dialog>
      )}
    </>
  )
}
