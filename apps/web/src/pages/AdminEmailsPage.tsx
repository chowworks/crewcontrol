import type { EmailPreview, EmailPreviewGuest, EmailTemplateView } from '@cc/types'
import type { EditorView } from '@codemirror/view'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { AdminHow, AdminShell, AdminToolHead } from './AdminPage'

// The code editor is big; only this page loads it.
const HtmlEditor = lazy(() => import('@/components/HtmlEditor'))

const field =
  'min-h-[44px] w-full rounded-[10px] border border-[#5B6B80] bg-white px-3.5 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal'
const filled =
  'inline-flex min-h-[44px] items-center rounded-xl bg-royal px-5 font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center rounded-xl border border-royal bg-white px-5 font-semibold text-royal hover:bg-royal-pale disabled:opacity-60'

const edited = (t: EmailTemplateView) =>
  t.isDefault
    ? 'Travel HQ’s wording'
    : `Edited ${new Date(t.updatedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

/** Emails: every email Travel HQ sends, each opening in its editor. */
export function AdminEmailsPage() {
  const [emails, setEmails] = useState<EmailTemplateView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .adminEmails()
      .then(setEmails)
      .catch(() => setError('The emails could not be loaded.'))
  }, [])

  return (
    <AdminShell>
      <AdminToolHead to="/admin/emails" />
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {emails?.map((e) => (
          <li
            key={e.kind}
            className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:flex-row sm:items-center"
          >
            <div className="flex-1">
              <p className="text-[17px] font-bold">{e.name}</p>
              <p className="text-sm text-body">{e.when}</p>
              <p className="mt-1 text-[13px] text-muted">{edited(e)}</p>
            </div>
            <Link to={`/admin/emails/${e.kind}`} className={`${filled} self-start sm:self-auto`}>
              Edit
            </Link>
          </li>
        ))}
      </ul>
      <AdminHow to="/admin/emails" />
    </AdminShell>
  )
}

const GUESTS: { value: EmailPreviewGuest; label: string }[] = [
  { value: 'can_pay', label: 'Able to pay now' },
  { value: 'not_yet', label: 'Not accepted yet' },
  { value: 'waitlisted', label: 'On the waitlist' },
]

/** One email's editor: subject and HTML with variables, and a live preview for a sample guest. */
export function AdminEmailPage() {
  const { kind = '' } = useParams()
  const toast = useToast()
  const [saved, setSaved] = useState<EmailTemplateView | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [guest, setGuest] = useState<EmailPreviewGuest>('can_pay')
  const [view, setView] = useState<'html' | 'text'>('html')
  const [preview, setPreview] = useState<EmailPreview | null>(null)
  const [check, setCheck] = useState<EmailPreview | null>(null)
  // The draft the last check was for: Save waits until the check matches what's typed.
  const [checkedFor, setCheckedFor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [help, setHelp] = useState(false)
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyView = useRef<EditorView | null>(null)
  // Where a picked variable goes: the field the cursor was last in.
  const target = useRef<'subject' | 'body'>('body')

  const load = (t: EmailTemplateView) => {
    setSaved(t)
    setSubject(t.subject)
    setBody(t.body)
  }

  useEffect(() => {
    api
      .adminEmail(kind)
      .then(load)
      .catch(() => setError('This email could not be loaded.'))
  }, [kind])

  // The preview follows the draft as it's typed, a moment after the last key.
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => {
      if (!subject.trim() || !body.trim()) return
      api
        .previewEmail(kind, { subject, body }, guest)
        .then((p) => {
          setCheck(p)
          setCheckedFor(subject + '\u0000' + body)
          if (!p.subjectProblems.length && !p.bodyProblems.length) setPreview(p)
        })
        .catch(() => {})
    }, 350)
    return () => clearTimeout(t)
  }, [kind, saved, subject, body, guest])

  // Each problem goes beside its field. The preview keeps the last version that worked while one is fixed.
  const subjectProblems = subject.trim() ? (check?.subjectProblems ?? []) : ['Write a subject.']
  const bodyProblems = body.trim() ? (check?.bodyProblems ?? []) : ['Write the email.']
  const problems = [...subjectProblems, ...bodyProblems]
  const changed = saved !== null && (subject !== saved.subject || body !== saved.body)
  const checking = checkedFor !== subject + '\u0000' + body

  /** Puts a variable where the cursor was last: in the subject or in the email. */
  function insert(text: string) {
    const input = subjectRef.current
    if (target.current === 'subject' && input) {
      const [a, b] = [input.selectionStart ?? subject.length, input.selectionEnd ?? subject.length]
      setSubject(subject.slice(0, a) + text + subject.slice(b))
      requestAnimationFrame(() => {
        input.focus()
        input.setSelectionRange(a + text.length, a + text.length)
      })
      return
    }
    const view = bodyView.current
    if (!view) return
    view.dispatch(view.state.replaceSelection(text))
    view.focus()
  }

  async function save() {
    if (busy || checking || problems.length) return
    setBusy(true)
    setError(null)
    try {
      load(await api.saveEmail(kind, { subject, body }))
      toast({ text: `“${saved!.name}” saved. It’s sent this way from now on.` })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed.')
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setResetting(false)
    setError(null)
    try {
      load(await api.resetEmail(kind))
      toast({ text: `“${saved!.name}” is back to Travel HQ’s wording.` })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resetting failed.')
    }
  }

  return (
    <AdminShell wide>
      <nav className="mb-3 mt-2 text-sm text-muted" aria-label="Breadcrumb">
        <Link to="/admin" className="text-royal hover:underline">
          Admin toolbox
        </Link>{' '}
        /{' '}
        <Link to="/admin/emails" className="text-royal hover:underline">
          Emails
        </Link>{' '}
        / {saved?.name ?? 'Email'}
      </nav>
      {saved && (
        <>
          <div className="mb-5">
            <h1 className="text-3xl font-extrabold">{saved.name}</h1>
            <p className="mt-0.5 text-body">{saved.when}</p>
          </div>
          {error && (
            <div role="alert" className="mb-4 font-semibold text-[#B42318]">
              {error}
            </div>
          )}
          <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
            <section className="flex min-w-0 flex-col gap-4 rounded-2xl bg-white p-5 shadow-card">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Subject
                <input
                  ref={subjectRef}
                  className={field}
                  value={subject}
                  maxLength={200}
                  onFocus={() => (target.current = 'subject')}
                  onChange={(e) => setSubject(e.target.value)}
                  aria-invalid={subjectProblems.length > 0}
                />
                <FieldProblems problems={subjectProblems} />
              </label>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="email-body" className="text-sm font-semibold">
                    Email (HTML)
                  </label>
                  <button
                    type="button"
                    aria-expanded={help}
                    aria-controls="email-help"
                    onClick={() => setHelp(!help)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-royal hover:bg-royal-pale"
                  >
                    <CircleHelp className="h-5 w-5" aria-hidden="true" />
                    How to write it
                  </button>
                </div>
                {help && <TemplateHelp />}
                <Suspense
                  fallback={
                    <div className="h-[70vh] min-h-[420px] rounded-[10px] border border-[#5B6B80]" />
                  }
                >
                  <HtmlEditor
                    id="email-body"
                    value={body}
                    onChange={setBody}
                    onFocus={() => (target.current = 'body')}
                    onReady={(v) => (bodyView.current = v)}
                  />
                </Suspense>
                <FieldProblems problems={bodyProblems} />
              </div>
              <Variables email={saved} onPick={insert} />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={filled}
                  disabled={busy || checking || !changed || problems.length > 0}
                  onClick={save}
                >
                  Save
                </button>
                {changed && (
                  <button type="button" className={outlined} onClick={() => load(saved)}>
                    Undo changes
                  </button>
                )}
                {!saved.isDefault && (
                  <button type="button" className={outlined} onClick={() => setResetting(true)}>
                    Use Travel HQ’s wording
                  </button>
                )}
              </div>
            </section>
            <section className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-extrabold">Preview</h2>
                <Segmented
                  label="Show"
                  value={view}
                  options={[
                    { value: 'html', label: 'Email' },
                    { value: 'text', label: 'Plain text' },
                  ]}
                  onChange={setView}
                />
              </div>
              {saved.variables.some((g) => g.group === 'Guest') && (
                <div className="flex flex-col gap-1.5">
                  <p id="preview-scenario" className="text-sm font-semibold">
                    Preview as a guest who is…
                  </p>
                  <p className="-mt-1 text-[13px] text-muted">
                    One template, worded for each case by its {'{{#if}}'} parts.
                  </p>
                  <Segmented
                    label="Preview as a guest who is"
                    value={guest}
                    options={GUESTS}
                    onChange={setGuest}
                  />
                </div>
              )}
              <p className="text-sm text-body">
                <span className="font-semibold">Subject:</span> {preview?.subject || '…'}
              </p>
              {!preview ? (
                <div className="grid h-[70vh] min-h-[420px] w-full place-items-center rounded-xl border border-rule bg-ground text-sm text-muted">
                  Building the preview…
                </div>
              ) : view === 'html' ? (
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={preview?.html ?? ''}
                  className="h-[70vh] min-h-[420px] w-full rounded-xl border border-rule bg-ground"
                />
              ) : (
                <pre className="h-[70vh] min-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-rule bg-ground p-4 text-[13px]">
                  {preview?.text}
                </pre>
              )}
              <p className="text-[13px] text-muted">
                {saved.variables.some((g) => g.group === 'Guest')
                  ? 'A fictional guest on a fictional trip. Payment details are always there; show them inside {{#if guest.canPay}} so only a guest who can pay now sees them.'
                  : 'A fictional message from a fictional person.'}
              </p>
            </section>
          </div>
        </>
      )}
      {!saved && error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {resetting && (
        <ConfirmDialog
          title="Use Travel HQ’s wording?"
          confirmLabel="Use Travel HQ’s wording"
          onConfirm={reset}
          onCancel={() => setResetting(false)}
        >
          Your version of this email is deleted, and it’s sent with the wording Travel HQ started
          with from now on.
        </ConfirmDialog>
      )}
      <AdminHow to="/admin/emails" />
    </AdminShell>
  )
}

/** The variables an email can use, by group; picking one puts it in the email where the cursor is. */
function Variables({
  email,
  onPick,
}: {
  email: EmailTemplateView
  onPick: (text: string) => void
}) {
  return (
    <details className="rounded-xl bg-royal-pale px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">Variables</summary>
      <p className="mt-2 text-[13px] text-body">
        Pick one to put it where your cursor was, in the subject or the email. Lists go inside{' '}
        {'{{#each …}}…{{/each}}'}; anything can go inside {'{{#if …}}…{{else}}…{{/if}}'}.
      </p>
      {email.variables.map((g) => (
        <div key={g.group} className="mt-3">
          <p className="text-[13px] font-bold text-muted">{g.group}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {g.items.map((v) => (
              <button
                key={v.path}
                type="button"
                title={v.label}
                onClick={() =>
                  onPick(
                    v.fields
                      ? `{{#each ${v.path}}}${v.fields.map((f) => `{{${f.name}}}`).join(' ')}{{/each}}`
                      : `{{${v.path}}}`
                  )
                }
                className="min-h-[36px] rounded-lg border border-royal bg-white px-2.5 font-mono text-[12px] text-royal hover:bg-royal-pale"
              >
                {v.path}
                {v.fields ? '[]' : ''}
              </button>
            ))}
          </div>
        </div>
      ))}
    </details>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[44px] rounded-xl px-3.5 text-sm font-semibold ${
            value === o.value ? 'bg-royal text-white' : 'border border-royal bg-white text-royal'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** What the template language is and where to learn it: the royal-pale tip panel, opened from "How to write it". */
function TemplateHelp() {
  return (
    <div id="email-help" className="rounded-xl bg-royal-pale px-4 py-3 text-[13px] text-body">
      <p className="font-semibold text-ink">
        Emails are written in Handlebars: HTML with {'{{ }}'} for what changes.
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5">
        <li>
          <code>{'{{trip.name}}'}</code> puts in a value. Pick one from Variables below.
        </li>
        <li>
          <code>{'{{#if guest.canPay}}…{{else}}…{{/if}}'}</code> shows text only sometimes;{' '}
          <code>{'{{#unless}}'}</code> is the opposite.
        </li>
        <li>
          <code>{'{{#each paymentDetails.methods}}{{name}}{{/each}}'}</code> repeats for each item
          in a list.
        </li>
        <li>
          Only if, unless and each work here, and every value is escaped, so a name can’t add HTML.
        </li>
      </ul>
      <a
        href="https://handlebarsjs.com/guide/"
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex min-h-[44px] items-center font-semibold text-royal underline"
      >
        Handlebars guide (opens in a new tab)
      </a>
    </div>
  )
}

/** What's wrong with one field, beside it. */
function FieldProblems({ problems }: { problems: string[] }) {
  if (!problems.length) return null
  return <span className="text-sm font-semibold text-[#B42318]">{problems.join(' ')}</span>
}
