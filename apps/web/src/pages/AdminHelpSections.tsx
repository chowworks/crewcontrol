import {
  HELP_ANSWER_MAX,
  HELP_PAGES,
  HELP_QUESTION_MAX,
  HELP_TOPICS,
  type AdminHelpEntry,
  type AdminHelpQuestion,
  type HelpEntryInput,
  type HelpPage,
  type HelpTopic,
} from '@cc/types'
import { BookOpen, MessageCircleQuestion } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'
import { Dropdown } from '@/components/Dropdown'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { AdminSection } from './AdminPage'

// The Admin toolbox's organizer help (issue #66), both shown in Review Customer Requests (owner's pick, 2026-11-02:
// one page): the questions organizers ask from the Help button, answered and emailed to them, and the answers behind
// the Help button, which start as Travel HQ's defaults in the code.

const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-royal px-4 font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale disabled:opacity-60'
const field =
  'w-full rounded-xl border border-[#5B6B80] bg-white px-3.5 py-3 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal'
const tag = 'rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide'

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const pageLabel = (p: HelpPage) => HELP_PAGES.find((x) => x.value === p)?.label ?? p
const topicLabel = (t: HelpTopic) => HELP_TOPICS.find((x) => x.value === t)?.label ?? t

const Problem = ({ children }: { children: ReactNode }) => (
  <span className="text-sm font-semibold text-[#B42318]">{children}</span>
)

/** Ticks for the pages an answer shows on first. */
function PagePicker({
  value,
  onChange,
  problem,
}: {
  value: HelpPage[]
  onChange: (pages: HelpPage[]) => void
  problem?: string
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 font-semibold text-ink">Shows first on</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {HELP_PAGES.map((p) => (
          <label key={p.value} className="flex min-h-[44px] items-center gap-3 text-body">
            <input
              type="checkbox"
              checked={value.includes(p.value)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...value, p.value] : value.filter((x) => x !== p.value)
                )
              }
              className="h-5 w-5 accent-royal"
            />
            {p.label}
          </label>
        ))}
      </div>
      {problem && <Problem>{problem}</Problem>}
    </fieldset>
  )
}

const topicOptions = HELP_TOPICS.map((t) => ({ value: t.value, label: t.label }))

/** Answering an organizer's question: emailed to them, and added to the help for everyone when ticked. */
function AnswerDialog({
  q,
  onClose,
  onDone,
}: {
  q: AdminHelpQuestion
  onClose: () => void
  onDone: (emailed: boolean) => void
}) {
  const [answer, setAnswer] = useState('')
  const [add, setAdd] = useState(false)
  const [question, setQuestion] = useState(q.question.slice(0, HELP_QUESTION_MAX))
  const [topic, setTopic] = useState<HelpTopic>('start')
  const [pages, setPages] = useState<HelpPage[]>([q.page])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const problems = {
    answer: !answer.trim() ? 'Write your answer.' : undefined,
    question:
      add && !question.trim() ? 'Write the question as organizers would ask it.' : undefined,
    pages: add && pages.length === 0 ? 'Pick at least one page.' : undefined,
  }
  const [tried, setTried] = useState(false)

  async function send(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.values(problems).some(Boolean)) return
    setBusy(true)
    setError(null)
    try {
      const { emailed } = await api.answerHelpQuestion(q.id, {
        answer: answer.trim(),
        addToHelp: add ? { question: question.trim(), topic, pages } : null,
      })
      onDone(emailed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save. Try again.')
      setBusy(false)
    }
  }

  return (
    <Dialog title={`Answer ${q.userName.split(' ')[0]}`} onClose={onClose}>
      <form onSubmit={send} className="flex flex-col gap-4" noValidate>
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <div className="rounded-xl bg-royal-pale px-4 py-3">
          <p className="whitespace-pre-line font-semibold text-ink">{q.question}</p>
          <p className="mt-1 text-sm text-muted">
            {q.userName} · {pageLabel(q.page)}
            {q.tripName && ` · ${q.tripName}`} · {when(q.createdAt)}
          </p>
        </div>
        <label className="flex flex-col gap-1.5 font-semibold text-ink">
          Your answer
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={HELP_ANSWER_MAX}
            rows={6}
            className={field}
          />
          {tried && problems.answer && <Problem>{problems.answer}</Problem>}
        </label>
        <p className="text-sm text-muted">
          We email it to {q.userEmail || 'them'}. Replies come to support.
        </p>
        <label className="flex min-h-[44px] items-center gap-3 font-semibold text-ink">
          <input
            type="checkbox"
            checked={add}
            onChange={(e) => setAdd(e.target.checked)}
            className="h-5 w-5 accent-royal"
          />
          Also add it to the help for every organizer
        </label>
        {add && (
          <div className="flex flex-col gap-4 border-l-4 border-royal-pale pl-4">
            <label className="flex flex-col gap-1.5 font-semibold text-ink">
              The question, as organizers would ask it
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={HELP_QUESTION_MAX}
                className={field}
              />
              {tried && problems.question && <Problem>{problems.question}</Problem>}
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-ink">Topic</span>
              <Dropdown label="Topic" value={topic} options={topicOptions} onChange={setTopic} />
            </div>
            <PagePicker
              value={pages}
              onChange={setPages}
              problem={tried ? problems.pages : undefined}
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={filled}>
            {busy ? 'Sending…' : 'Send answer'}
          </button>
          <button type="button" onClick={onClose} className={outlined}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/** Adding an answer, or changing one: a default, the admin's version of one, or one the admin added. */
function EntryDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: AdminHelpEntry | null
  onClose: () => void
  onSaved: (entries: AdminHelpEntry[], text: string) => void
}) {
  const [form, setForm] = useState<HelpEntryInput>(
    entry
      ? {
          topic: entry.topic,
          question: entry.question,
          answer: entry.answer,
          pages: entry.pages,
          hidden: entry.hidden,
        }
      : { topic: 'start', question: '', answer: '', pages: [], hidden: false }
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [removing, setRemoving] = useState(false)
  const set = <K extends keyof HelpEntryInput>(k: K, v: HelpEntryInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))
  const problems = {
    question: !form.question.trim() ? 'Write the question.' : undefined,
    answer: !form.answer.trim() ? 'Write the answer.' : undefined,
    pages: form.pages.length === 0 ? 'Pick at least one page.' : undefined,
  }

  async function run(action: () => Promise<AdminHelpEntry[]>, text: string) {
    setBusy(true)
    setError(null)
    try {
      onSaved(await action(), text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save. Try again.')
      setBusy(false)
    }
  }

  function save(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.values(problems).some(Boolean)) return
    const input = { ...form, question: form.question.trim(), answer: form.answer.trim() }
    void run(
      () => (entry ? api.saveHelpEntry(entry.key, input) : api.addHelpEntry(input)),
      entry ? 'Answer saved.' : 'Answer added.'
    )
  }

  return (
    <Dialog title={entry ? 'Edit answer' : 'Add an answer'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        {entry?.defaultChanged && entry.original && (
          <div className="flex flex-col gap-1 rounded-xl bg-royal-pale px-4 py-3 text-ink">
            <p className="font-semibold">Travel HQ’s wording changed since you edited this.</p>
            <p className="text-sm">The new default:</p>
            <p className="text-sm font-semibold">{entry.original.question}</p>
            <p className="whitespace-pre-line text-sm">{entry.original.answer}</p>
            <p className="text-sm">Save to keep yours, or use Travel HQ’s wording.</p>
          </div>
        )}
        <label className="flex flex-col gap-1.5 font-semibold text-ink">
          Question
          <input
            value={form.question}
            onChange={(e) => set('question', e.target.value)}
            maxLength={HELP_QUESTION_MAX}
            className={field}
          />
          {tried && problems.question && <Problem>{problems.question}</Problem>}
        </label>
        <label className="flex flex-col gap-1.5 font-semibold text-ink">
          Answer
          <textarea
            value={form.answer}
            onChange={(e) => set('answer', e.target.value)}
            maxLength={HELP_ANSWER_MAX}
            rows={8}
            className={field}
          />
          <span className="text-sm font-normal text-muted">
            A blank line starts a new paragraph.
          </span>
          {tried && problems.answer && <Problem>{problems.answer}</Problem>}
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold text-ink">Topic</span>
          <Dropdown
            label="Topic"
            value={form.topic}
            options={topicOptions}
            onChange={(v) => set('topic', v)}
          />
        </div>
        <PagePicker
          value={form.pages}
          onChange={(v) => set('pages', v)}
          problem={tried ? problems.pages : undefined}
        />
        <label className="flex min-h-[44px] items-center gap-3 font-semibold text-ink">
          <input
            type="checkbox"
            checked={form.hidden}
            onChange={(e) => set('hidden', e.target.checked)}
            className="h-5 w-5 accent-royal"
          />
          Hide it from organizers
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={filled}>
            {busy ? 'Saving…' : entry ? 'Save' : 'Add answer'}
          </button>
          {entry?.source === 'edited' && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() => api.resetHelpEntry(entry.key), 'Back to Travel HQ’s wording.')
              }
              className={outlined}
            >
              Use Travel HQ’s wording
            </button>
          )}
          {entry?.source === 'added' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRemoving(true)}
              className={outlined}
            >
              Delete
            </button>
          )}
        </div>
      </form>
      {removing && entry && (
        <ConfirmDialog
          title="Delete this answer?"
          confirmLabel="Delete"
          onCancel={() => setRemoving(false)}
          onConfirm={() => {
            setRemoving(false)
            void run(() => api.resetHelpEntry(entry.key), 'Answer deleted.')
          }}
        >
          Organizers stop seeing it at once.
        </ConfirmDialog>
      )}
    </Dialog>
  )
}

function QuestionRow({ q, onAnswer }: { q: AdminHelpQuestion; onAnswer?: () => void }) {
  return (
    <li className="flex flex-col gap-2 border-t border-rule py-3 first:border-t-0 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line font-semibold text-ink">{q.question}</p>
        <p className="text-sm text-muted">
          {q.userName}
          {q.userEmail && ` (${q.userEmail})`} · {pageLabel(q.page)}
          {q.tripName && ` · ${q.tripName}`} · {when(q.createdAt)}
        </p>
        {q.answer && (
          <details className="mt-1 text-sm text-body">
            <summary className="cursor-pointer font-semibold text-royal">
              Answered {q.answeredAt && when(q.answeredAt)}
            </summary>
            <p className="mt-1 whitespace-pre-line">{q.answer}</p>
          </details>
        )}
      </div>
      {onAnswer && (
        <button type="button" onClick={onAnswer} className={`${filled} shrink-0`}>
          Answer
        </button>
      )}
    </li>
  )
}

/**
 * Questions organizers asked from the Help button, for Review Customer Requests: waiting ones first with Answer, the
 * answered ones folded below.
 */
export function HelpQuestionsSection() {
  const [questions, setQuestions] = useState<AdminHelpQuestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [answering, setAnswering] = useState<AdminHelpQuestion | null>(null)
  const toast = useToast()

  const load = () =>
    api
      .adminHelp()
      .then((r) => setQuestions(r.questions))
      .catch(() => setError('The questions could not be loaded.'))
  useEffect(() => {
    void load()
  }, [])

  const waiting = (questions ?? []).filter((q) => !q.answeredAt)
  const answered = (questions ?? []).filter((q) => q.answeredAt)

  return (
    <AdminSection
      icon={MessageCircleQuestion}
      title={`Organizers’ questions${waiting.length ? ` (${waiting.length} waiting)` : ''}`}
      steps={[
        'Organizers ask these from the Help button on any organizer page. Support gets an email for each one.',
        'Answer here and we email them your answer. Tick “Also add it to the help” to show it to every organizer.',
      ]}
    >
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {questions &&
        (waiting.length === 0 ? (
          <p className="text-body">Nothing needs you right now.</p>
        ) : (
          <ul>
            {waiting.map((q) => (
              <QuestionRow key={q.id} q={q} onAnswer={() => setAnswering(q)} />
            ))}
          </ul>
        ))}
      {answered.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold text-royal">
            Answered ({answered.length})
          </summary>
          <ul className="mt-2">
            {answered.map((q) => (
              <QuestionRow key={q.id} q={q} />
            ))}
          </ul>
        </details>
      )}
      {answering && (
        <AnswerDialog
          q={answering}
          onClose={() => setAnswering(null)}
          onDone={(emailed) => {
            const first = answering.userName.split(' ')[0]
            void load()
            // The red count in the account menu drops it.
            window.dispatchEvent(new Event('cc:actions-changed'))
            setAnswering(null)
            toast({
              text: emailed
                ? `Answer emailed to ${first}.`
                : `Answer saved, but the email didn’t go. Reply to ${first} from support.`,
            })
          }}
        />
      )}
    </AdminSection>
  )
}

/** The answers behind the Help button, for Review Customer Requests: add, edit, hide or go back to Travel HQ's own. */
export function HelpAnswersSection() {
  const [entries, setEntries] = useState<AdminHelpEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminHelpEntry | 'new' | null>(null)
  const toast = useToast()

  useEffect(() => {
    api
      .adminHelp()
      .then((r) => setEntries(r.entries))
      .catch(() => setError('The help answers could not be loaded.'))
  }, [])

  const changed = (entries ?? []).filter((e) => e.defaultChanged).length

  return (
    <AdminSection
      icon={BookOpen}
      title={`Help answers${changed ? ` (${changed} to check)` : ''}`}
      steps={[
        'What organizers see behind the Help button, by topic. Each one shows first on the pages ticked for it.',
        'Travel HQ’s answers come with the app and change when the app does. Edit one to use your own wording; “Use Travel HQ’s wording” goes back.',
        'When Travel HQ’s wording changes after you edited an answer, it says so here and adds to your red count. Save yours or use Travel HQ’s wording to clear it.',
      ]}
    >
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      <button type="button" onClick={() => setEditing('new')} className={`${filled} w-fit`}>
        Add an answer
      </button>
      {HELP_TOPICS.map((t) => {
        const list = (entries ?? []).filter((e) => e.topic === t.value)
        if (list.length === 0) return null
        return (
          <div key={t.value} className="flex flex-col">
            <h3 className="text-xs font-bold uppercase tracking-wider text-royal">
              {topicLabel(t.value)}
            </h3>
            <ul>
              {list.map((e) => (
                <li
                  key={e.key}
                  className="flex flex-col gap-2 border-t border-rule py-3 first:border-t-0 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${e.hidden ? 'text-muted' : 'text-ink'}`}>
                      {e.question}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {e.source === 'edited' && (
                        <span className={`${tag} bg-royal-pale text-royal`}>Your wording</span>
                      )}
                      {e.source === 'added' && (
                        <span className={`${tag} bg-royal-pale text-royal`}>Added by you</span>
                      )}
                      {e.hidden && <span className={`${tag} bg-ground text-muted`}>Hidden</span>}
                      {e.defaultChanged && (
                        <span className={`${tag} bg-[#FDECEA] text-[#B42318]`}>
                          Travel HQ’s wording changed
                        </span>
                      )}
                      <span className="text-sm text-muted">
                        {e.pages.map(pageLabel).join(', ')}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(e)}
                    className={`${outlined} shrink-0`}
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {editing && (
        <EntryDialog
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(list, text) => {
            setEntries(list)
            // A checked answer drops off the red count in the account menu.
            window.dispatchEvent(new Event('cc:actions-changed'))
            setEditing(null)
            toast({ text })
          }}
        />
      )}
    </AdminSection>
  )
}
