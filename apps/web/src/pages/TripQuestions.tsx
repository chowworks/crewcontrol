import {
  ANSWER_MAX,
  QUESTION_MAX,
  type OrganizerTrip,
  type QuestionAnswerInput,
  type TripQuestion,
  type TripQuestions,
} from '@cc/types'
import { ChevronDown, ChevronUp, CircleHelp } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { avatarColor } from '@/components/Announcements'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'
import { useToast } from '@/components/Toast'
import { api, ApiError } from '@/lib/api'
import { IconCircle } from './TripGuests'

// Trip Control's Questions (issue #13): each waiting question is one of the Actions, answered for everyone (it joins
// the trip page's questions) or for the asker only; the card listing the trip page's questions comes last on the page,
// where organizers add, edit, reorder and delete them (owner's decisions, 2026-10-30).

const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'
// Up and down sit stacked at the left of each entry, always both, the one that can't move greyed out.
const arrow =
  'grid h-11 w-11 place-items-center rounded-lg text-royal hover:bg-royal-pale disabled:cursor-default disabled:text-rule disabled:hover:bg-transparent'
const field =
  'min-h-[44px] w-full rounded-lg border border-[#5B6B80] bg-white px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'
const tag =
  'rounded-md bg-royal-pale px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-royal'

type Editing =
  { mode: 'answer'; q: TripQuestion } | { mode: 'edit'; q: TripQuestion } | { mode: 'add' }

const firstName = (name: string | null) => (name ?? '').split(' ')[0] || 'them'

/**
 * Trip Control's questions: the Actions rows for the waiting ones, and the card for the end of the page (with the
 * dialogs). Reloaded when the trip changes, so "on the trip" stays right as guests are accepted.
 */
export function useTripQuestions(trip: OrganizerTrip | null): {
  actionRows: ReactNode[]
  card: ReactNode
} {
  const toast = useToast()
  const [data, setData] = useState<TripQuestions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<TripQuestion | null>(null)
  useEffect(() => {
    if (!trip) return
    api
      .getQuestions(trip.id)
      .then(setData)
      .catch(() => setError('Questions could not be loaded.'))
  }, [trip])

  if (!trip) return { actionRows: [], card: null }
  const tripId = trip.id

  async function change(step: () => Promise<TripQuestions>, done: string): Promise<boolean> {
    try {
      setData(await step())
      setError(null)
      toast({ text: done })
      // The red count in the account menu drops a question just answered or deleted.
      window.dispatchEvent(new Event('cc:actions-changed'))
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t save. Try again.')
      return false
    }
  }

  function move(list: TripQuestion[], i: number, by: -1 | 1) {
    const ids = list.map((q) => q.id)
    ;[ids[i], ids[i + by]] = [ids[i + by], ids[i]]
    void change(() => api.reorderQuestions(tripId, ids), 'Order saved.')
  }

  async function save(input: QuestionAnswerInput): Promise<string | null> {
    if (!editing) return null
    const who = editing.mode === 'add' ? '' : firstName(editing.q.askerName)
    const ok =
      editing.mode === 'add'
        ? await change(() => api.addQuestion(tripId, input), 'Question added to the trip page.')
        : editing.mode === 'answer'
          ? await change(
              () => api.answerQuestion(tripId, editing.q.id, input),
              input.status === 'public'
                ? `Answer added to the trip page. We emailed ${who}.`
                : `Answer sent to ${who}.`
            )
          : await change(() => api.editQuestion(tripId, editing.q.id, input), 'Question saved.')
    if (ok) setEditing(null)
    return ok ? null : 'That didn’t save. Try again.'
  }

  const actionRows = (data?.waiting ?? []).map((q) => (
    <li
      key={q.id}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0"
    >
      <div className="flex min-w-0 flex-[1_1_240px] items-start gap-3">
        <span
          aria-hidden="true"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${avatarColor(q.askerName ?? '')} font-bold text-ink`}
        >
          {(q.askerName ?? '?').trim()[0]?.toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="font-semibold">
            {q.askerName}
            {/* Whether they signed up for the trip, so the organizer knows who they're answering. */}
            <span className="font-normal text-muted">
              {q.askerOnTrip
                ? ' · Question from a guest on the trip'
                : ' · Question from someone not signed up yet'}
            </span>
          </div>
          <div className="text-sm text-body [overflow-wrap:anywhere]">“{q.question}”</div>
        </div>
      </div>
      <div className="ml-auto flex gap-2">
        <button type="button" className={filled} onClick={() => setEditing({ mode: 'answer', q })}>
          Answer
        </button>
        <button type="button" className={outlined} onClick={() => setDeleting(q)}>
          Delete
        </button>
      </div>
    </li>
  ))

  const published = data?.published ?? []
  const card = (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xl font-extrabold">
          <IconCircle icon={CircleHelp} />
          Questions on the trip page
        </h2>
        <button type="button" className={filled} onClick={() => setEditing({ mode: 'add' })}>
          Add a question
        </button>
      </div>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {data && published.length === 0 && (
        <p className="text-body">
          None yet. Questions you answer for everyone, and ones you add, show on the trip page for
          anyone with the link, without who asked.
        </p>
      )}
      {published.length > 0 && (
        <ol>
          {published.map((q, i) => (
            <Row
              key={q.id}
              q={q}
              onEdit={() => setEditing({ mode: 'edit', q })}
              onDelete={() => setDeleting(q)}
            >
              <button
                type="button"
                className={arrow}
                aria-label={`Move “${q.question}” up`}
                disabled={i === 0}
                onClick={() => move(published, i, -1)}
              >
                <ChevronUp className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={arrow}
                aria-label={`Move “${q.question}” down`}
                disabled={i === published.length - 1}
                onClick={() => move(published, i, 1)}
              >
                <ChevronDown className="h-5 w-5" aria-hidden="true" />
              </button>
            </Row>
          ))}
        </ol>
      )}
      {data && data.private.length > 0 && (
        <>
          <h3 className="mt-2 font-bold">Answered just for the person who asked</h3>
          <ul>
            {data.private.map((q) => (
              <Row
                key={q.id}
                q={q}
                onEdit={() => setEditing({ mode: 'edit', q })}
                onDelete={() => setDeleting(q)}
              />
            ))}
          </ul>
        </>
      )}
      {editing && <AnswerDialog editing={editing} onSave={save} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={
            deleting.status === 'waiting'
              ? 'Delete this question?'
              : 'Delete this question and its answer?'
          }
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const q = deleting
            setDeleting(null)
            void change(() => api.removeQuestion(tripId, q.id), 'Question deleted.')
          }}
        >
          <p className="[overflow-wrap:anywhere]">“{deleting.question}”</p>
          <p>
            {deleting.status === 'waiting'
              ? `${firstName(deleting.askerName)} isn’t told, and it won’t show anywhere.`
              : deleting.status === 'public'
                ? 'It comes off the trip page. Nobody is told.'
                : `${firstName(deleting.askerName)} won’t see it on the trip page any more.`}
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
  return { actionRows, card }
}

function Row({
  q,
  onEdit,
  onDelete,
  children,
}: {
  q: TripQuestion
  onEdit: () => void
  onDelete: () => void
  /** The arrows that move it up and down the trip page. */
  children?: ReactNode
}) {
  return (
    <li className="flex items-center gap-3 border-t border-rule py-3 first:border-t-0">
      {children && <div className="-ml-2 flex shrink-0 flex-col">{children}</div>}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_240px]">
          <div className="flex flex-wrap items-center gap-2 font-bold [overflow-wrap:anywhere]">
            {q.question}
            {q.status === 'private' && <span className={tag}>Private · {q.askerName}</span>}
          </div>
          <div className="line-clamp-2 text-[15px] text-muted [overflow-wrap:anywhere]">
            {q.answer}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" className={outlined} onClick={onEdit}>
            Edit
          </button>
          <button type="button" className={outlined} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </li>
  )
}

/** Answering a question, adding an entry or editing one: the question, the answer, and who sees it. */
function AnswerDialog({
  editing,
  onSave,
  onClose,
}: {
  editing: Editing
  /** Resolves to why it didn't save, or null once it did. */
  onSave: (input: QuestionAnswerInput) => Promise<string | null>
  onClose: () => void
}) {
  const q = editing.mode === 'add' ? null : editing.q
  const [question, setQuestion] = useState(q?.question ?? '')
  const [answer, setAnswer] = useState(q?.answer ?? '')
  const [status, setStatus] = useState<'public' | 'private'>(
    q?.status === 'private' ? 'private' : 'public'
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Everyone's problems at once, beside their fields (CLAUDE.md "Forms").
  const questionProblem =
    question.trim().length > QUESTION_MAX ? `Keep it to ${QUESTION_MAX} characters.` : null
  const answerProblem =
    answer.trim().length > ANSWER_MAX
      ? `Keep it to ${ANSWER_MAX.toLocaleString('en-US')} characters.`
      : null
  const ready = question.trim() && answer.trim() && !questionProblem && !answerProblem
  const who = firstName(q?.askerName ?? null)
  const title =
    editing.mode === 'add'
      ? 'Add a question'
      : editing.mode === 'answer'
        ? `Answer ${who}`
        : 'Edit question'

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    const problem = await onSave({ question: question.trim(), answer: answer.trim(), status })
    setBusy(false)
    setError(problem)
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="q-question" className="font-semibold">
            Question
          </label>
          <input
            id="q-question"
            className={field}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          {questionProblem && (
            <p className="text-sm font-semibold text-[#B42318]">{questionProblem}</p>
          )}
          {editing.mode === 'answer' && (
            <p className="text-sm text-muted">
              Tidy the wording if you like. On the trip page it shows without {who}’s name.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="q-answer" className="font-semibold">
            {editing.mode === 'add' ? 'Answer' : 'Your answer'}
          </label>
          <textarea
            id="q-answer"
            rows={4}
            className={`${field} resize-y`}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          {answerProblem && <p className="text-sm font-semibold text-[#B42318]">{answerProblem}</p>}
        </div>
        {q?.askerName && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">Who sees the answer</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Choice
                checked={status === 'public'}
                onChange={() => setStatus('public')}
                title="Everyone"
                line={`On the trip page’s questions, without ${who}’s name`}
              />
              <Choice
                checked={status === 'private'}
                onChange={() => setStatus('private')}
                title={`Just ${who}`}
                line={`Only ${who} sees it, tagged Private`}
              />
            </div>
          </fieldset>
        )}
        {editing.mode === 'answer' && (
          <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-body">
            {who} gets your answer by email either way.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className={outlined} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={filled} disabled={!ready || busy}>
            {busy
              ? 'Saving…'
              : editing.mode === 'add'
                ? 'Add question'
                : editing.mode === 'answer'
                  ? 'Send answer'
                  : 'Save'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/** One of the two choices of who sees an answer, as a card with a radio button. */
function Choice({
  checked,
  onChange,
  title,
  line,
}: {
  checked: boolean
  onChange: () => void
  title: string
  line: string
}) {
  return (
    <label
      className={`flex cursor-pointer gap-2.5 rounded-xl p-3.5 ${checked ? 'border-2 border-royal bg-royal-pale' : 'border border-rule p-[15px]'}`}
    >
      <input
        type="radio"
        name="who-sees"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-[18px] w-[18px] accent-royal"
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-bold">{title}</span>
        <span className="text-sm text-body">{line}</span>
      </span>
    </label>
  )
}
