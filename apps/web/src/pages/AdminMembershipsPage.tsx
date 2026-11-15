import {
  MEMBERSHIP_NOTE_MAX,
  PAID_FEATURES,
  type Membership,
  type MembershipInput,
  type PaidFeature,
} from '@cc/types'
import { Gem, Globe, Link2, Plus, Search, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { AdminGrid, type GridColumn } from '@/components/AdminGrid'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { AdminHow, AdminSection, AdminShell, AdminToolHead } from './AdminPage'

// Manage Memberships (issue #90): who has which paid features, by the email they sign in with. Travel HQ takes no
// payment for them; the admin ticks features by hand and keeps a note of what was paid and how.

const filled =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-royal px-4 font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl border-2 border-royal px-4 font-semibold text-royal hover:bg-royal-pale'
const field =
  'w-full rounded-xl border border-[#5B6B80] bg-white px-3.5 py-3 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal disabled:bg-ground disabled:text-muted'
const problemText = 'text-sm font-semibold text-[#B42318]'

const featureTitle = (k: PaidFeature) => PAID_FEATURES.find((f) => f.key === k)?.title ?? k
const day = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

type Row = Membership & { id: string }

/** A small picture for each feature's tile. */
const FEATURE_ART: Record<PaidFeature, LucideIcon> = {
  organizer_link: Link2,
  custom_domain: Globe,
}

/** Today in Eastern time (YYYY-MM-DD), the way the API decides a last day has passed. */
const todayEastern = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

/** A membership as the API takes it back, for Undo. */
const inputOf = (m: Membership): MembershipInput => ({
  features: m.features,
  endsOn: m.endsOn,
  note: m.note,
})

export function AdminMembershipsPage() {
  const [members, setMembers] = useState<Membership[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The dialog: a new member (null email) or one to change.
  const [editing, setEditing] = useState<Membership | 'new' | null>(null)
  const [removing, setRemoving] = useState<Membership | null>(null)
  const toast = useToast()

  useEffect(() => {
    api
      .adminMemberships()
      .then(setMembers)
      .catch(() => setError('The memberships could not be loaded.'))
  }, [])

  /** Puts a person's membership back as it was (Undo). */
  async function restore(email: string, before: Membership | null) {
    setError(null)
    try {
      setMembers(
        before
          ? await api.setMembership(email, inputOf(before), false)
          : await api.removeMembership(email)
      )
      toast({ text: `Put ${email} back as it was.` })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t undo. Try again.')
    }
  }

  async function remove(m: Membership) {
    setRemoving(null)
    setError(null)
    try {
      setMembers(await api.removeMembership(m.email))
      toast({
        text: `${m.email} has no paid features now.`,
        action: { label: 'Undo', onClick: () => restore(m.email, m) },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save. Try again.')
    }
  }

  const columns: GridColumn<Row>[] = [
    { key: 'email', label: 'Email', value: (m) => m.email, className: 'font-semibold' },
    {
      key: 'features',
      label: 'Paid features',
      value: (m) => m.features.map(featureTitle).join(', '),
      cell: (m) => (
        <div className="flex flex-wrap gap-1.5">
          {m.features.map((f) => (
            <span
              key={f}
              className="whitespace-nowrap rounded-full bg-royal-pale px-3 py-1 font-semibold text-royal"
            >
              {featureTitle(f)}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'endsOn',
      label: 'Last day',
      // No end sorts after every date.
      value: (m) => m.endsOn ?? '9999',
      searchValue: (m) => (m.endsOn ? `${day(m.endsOn)}${m.ended ? ' Ended' : ''}` : 'No end'),
      exportValue: (m) => (m.endsOn ? day(m.endsOn) : 'No end'),
      cell: (m) =>
        m.endsOn ? (
          <span className="flex flex-col items-start gap-1 whitespace-nowrap">
            {day(m.endsOn)}
            {m.ended && <span className="font-semibold text-[#B42318]">Ended</span>}
          </span>
        ) : (
          <span className="text-muted">No end</span>
        ),
    },
    {
      key: 'note',
      label: 'Note',
      value: (m) => m.note,
      className: 'max-w-[280px] whitespace-pre-line text-body',
    },
    {
      key: 'updated',
      label: 'Changed',
      value: (m) => m.updatedAt,
      searchValue: (m) => `${when(m.updatedAt)} ${m.updatedBy}`,
      exportValue: (m) => `${when(m.updatedAt)}${m.updatedBy ? `, ${m.updatedBy}` : ''}`,
      cell: (m) => (
        <span className="flex flex-col whitespace-nowrap text-muted">
          {when(m.updatedAt)}
          {m.updatedBy && <span>{m.updatedBy}</span>}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      actions: true,
      value: () => '',
      cell: (m) => (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(m)} className={filled}>
            Change
          </button>
          <button type="button" onClick={() => setRemoving(m)} className={outlined}>
            Remove
          </button>
        </div>
      ),
    },
  ]

  const rows: Row[] = (members ?? []).map((m) => ({ ...m, id: m.email }))

  return (
    <AdminShell>
      <AdminToolHead to="/admin/memberships" />
      {error && (
        <p role="alert" className="mb-4 font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {members && (
        <AdminSection
          icon={Gem}
          title="Members"
          steps={[
            'Add the email someone signs in with and tick their paid features. They needn’t have signed in yet.',
            'Each feature you give them is introduced in a popup the next time they open Travel HQ.',
            'After the last day their features switch off on their own. Nothing of theirs breaks: links fall back to the free ones.',
          ]}
        >
          <div>
            <button type="button" onClick={() => setEditing('new')} className={filled}>
              <Plus className="h-5 w-5" aria-hidden="true" />
              Add a member
            </button>
          </div>
          <AdminGrid
            rows={rows}
            total={rows.length}
            columns={columns}
            exportName="memberships"
            exportLabel="Memberships"
            empty="Nobody has paid features yet."
            sortFirst="updated"
          />
        </AdminSection>
      )}
      <AdminHow to="/admin/memberships" />

      {editing && (
        <MemberDialog
          member={editing === 'new' ? null : editing}
          taken={(members ?? []).map((m) => m.email)}
          onClose={() => setEditing(null)}
          onSaved={(list, email, before) => {
            setMembers(list)
            setEditing(null)
            toast({
              text: before ? `Changed ${email}’s paid features.` : `Added ${email}.`,
              action: { label: 'Undo', onClick: () => restore(email, before) },
            })
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.email}?`}
          confirmLabel="Remove"
          onConfirm={() => remove(removing)}
          onCancel={() => setRemoving(null)}
        >
          <p className="text-body">
            They lose {removing.features.map(featureTitle).join(' and ')} at once. Your note goes
            too.
          </p>
        </ConfirmDialog>
      )}
    </AdminShell>
  )
}

/** Adding a member or changing one: their email, the features, a last day if there is one, and a note. */
function MemberDialog({
  member,
  taken,
  onClose,
  onSaved,
}: {
  member: Membership | null
  taken: string[]
  onClose: () => void
  onSaved: (list: Membership[], email: string, before: Membership | null) => void
}) {
  const [email, setEmail] = useState(member?.email ?? '')
  const [features, setFeatures] = useState<PaidFeature[]>(member?.features ?? [])
  const [endsOn, setEndsOn] = useState(member?.endsOn ?? '')
  const [note, setNote] = useState(member?.note ?? '')
  const [touched, setTouched] = useState({ email: false, features: false })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const typed = email.trim().toLowerCase()
  // Every problem at once, beside its field (the forms rule).
  const emailProblem = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)
    ? 'Enter an email like name@example.com.'
    : !member && taken.includes(typed)
      ? 'This person is already a member. Change them in the list instead.'
      : null
  const featuresProblem = features.length === 0 ? 'Tick at least one feature.' : null
  // Not a problem, but easy to type by mistake: a past last day switches their features off at once.
  const pastEnd = endsOn !== '' && endsOn < todayEastern()

  const toggle = (k: PaidFeature, on: boolean) => {
    setTouched((t) => ({ ...t, features: true }))
    setFeatures((list) =>
      PAID_FEATURES.map((f) => f.key).filter((x) => (x === k ? on : list.includes(x)))
    )
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setTouched({ email: true, features: true })
    if (emailProblem || featuresProblem) return
    setSaving(true)
    setError(null)
    try {
      const list = await api.setMembership(
        typed,
        { features, endsOn: endsOn || null, note: note.trim() },
        !member
      )
      onSaved(list, typed, member)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save. Try again.')
      setSaving(false)
    }
  }

  return (
    <Dialog title={member ? 'Change paid features' : 'Add a member'} onClose={onClose} wide>
      <form onSubmit={save} className="flex flex-col gap-5" noValidate>
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-1.5 font-semibold text-ink">
          The email they sign in with
          <input
            type="email"
            value={email}
            disabled={Boolean(member)}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            placeholder="name@example.com"
            className={field}
          />
          {touched.email && emailProblem && <span className={problemText}>{emailProblem}</span>}
        </label>

        <FeaturePicker
          features={features}
          onToggle={toggle}
          problem={touched.features ? featuresProblem : null}
        />

        <label className="flex flex-col gap-1.5 font-semibold text-ink">
          Last day (optional)
          <input
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className={`${field} sm:w-60`}
          />
          <span className="text-sm font-normal text-muted">
            Leave it empty for no end. Their features stay on through this day.
          </span>
          {pastEnd && (
            <span className={problemText}>
              This day has passed, so their features are off as soon as you save.
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5 font-semibold text-ink">
          Add a note for yourself: what they paid, how and when
          <textarea
            value={note}
            rows={3}
            maxLength={MEMBERSHIP_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Paid $40 by Zelle on Nov 15"
            className={field}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className={filled}>
            {saving ? 'Saving…' : member ? 'Save changes' : 'Add member'}
          </button>
          <button type="button" onClick={onClose} className={outlined}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * Picking features (owner's ask, 2026-11-15): a search box that lists the matching features with tick boxes, and the
 * ticked ones below as tiles, each with Remove.
 */
const BUCKETS = [...new Set(PAID_FEATURES.map((f) => f.bucket))]

/** "3 features: all of Branding, 1 from Messaging". */
function pickedSummary(features: PaidFeature[]): string {
  const parts = BUCKETS.flatMap((b) => {
    const all = PAID_FEATURES.filter((f) => f.bucket === b)
    const n = all.filter((f) => features.includes(f.key)).length
    if (n === 0) return []
    return [n === all.length ? `all of ${b}` : `${n} from ${b}`]
  })
  const n = features.length
  return `${n} ${n === 1 ? 'feature' : 'features'}: ${parts.join(', ')}`
}

/**
 * Buckets on the left, the chosen bucket's features on the right (Chow's option C, 2026-11-15). A bucket only
 * ticks its features; the search looks through every feature.
 */
function FeaturePicker({
  features,
  onToggle,
  problem,
}: {
  features: PaidFeature[]
  onToggle: (k: PaidFeature, on: boolean) => void
  problem: string | null
}) {
  const [query, setQuery] = useState('')
  const [bucket, setBucket] = useState<string | null>(null)
  const uid = useId()
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = words.length
    ? PAID_FEATURES.filter((f) =>
        words.every((w) => `${f.title} ${f.text} ${f.bucket}`.toLowerCase().includes(w))
      )
    : PAID_FEATURES.filter((f) => bucket === null || f.bucket === bucket)
  const heading = words.length ? 'Matches' : (bucket ?? 'All features')
  const allOn = shown.length > 0 && shown.every((f) => features.includes(f.key))
  const count = (b: string | null) => {
    const all = PAID_FEATURES.filter((f) => b === null || f.bucket === b)
    return `${all.filter((f) => features.includes(f.key)).length} / ${all.length}`
  }
  const navItem = (b: string | null) => {
    const on = !words.length && bucket === b
    return (
      <button
        key={b ?? 'all'}
        type="button"
        aria-pressed={on}
        onClick={() => {
          setBucket(b)
          setQuery('')
        }}
        className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-left ${
          on ? 'bg-royal-pale font-semibold text-royal' : 'text-ink hover:bg-ground'
        }`}
      >
        <span className="flex-1">{b ?? 'All features'}</span>
        <span className={`text-sm ${on ? 'text-royal' : 'text-muted'}`}>{count(b)}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor={`${uid}-search`} className="mb-1.5 block font-semibold text-ink">
          Paid features
        </label>
        <Search
          className="pointer-events-none absolute bottom-[14px] left-3.5 h-5 w-5 text-muted"
          aria-hidden="true"
        />
        <input
          id={`${uid}-search`}
          type="text"
          autoComplete="off"
          value={query}
          placeholder="Search all features"
          onChange={(e) => setQuery(e.target.value)}
          className={`${field} pl-11`}
        />
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-rule p-3 sm:flex-row sm:gap-4">
        <nav
          aria-label="Feature buckets"
          className="flex flex-col gap-1 border-b border-rule pb-3 sm:w-52 sm:shrink-0 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3"
        >
          {navItem(null)}
          {BUCKETS.map(navItem)}
        </nav>
        <section aria-labelledby={`${uid}-head`} className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`${uid}-head`} className="text-xl font-bold text-ink">
              {heading}
            </h3>
            {shown.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  shown.forEach((f) => {
                    if (features.includes(f.key) === allOn) onToggle(f.key, !allOn)
                  })
                }
                className="inline-flex min-h-[44px] items-center rounded-xl border-2 border-royal bg-white px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
              >
                {allOn ? `Untick all ${shown.length}` : `Tick all ${shown.length}`}
              </button>
            )}
          </div>
          {shown.length === 0 && <p className="text-body">No feature matches.</p>}
          {shown.map((f) => {
            const on = features.includes(f.key)
            const Art = FEATURE_ART[f.key]
            return (
              <label
                key={f.key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${
                  on ? 'border-royal bg-royal-pale' : 'border-rule bg-white hover:border-royal'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => onToggle(f.key, e.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-royal"
                />
                <Art className="mt-0.5 h-6 w-6 shrink-0 text-royal" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                    {f.title}
                    {!f.built && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-royal ${
                          on ? 'bg-white' : 'bg-royal-pale'
                        }`}
                      >
                        Coming soon
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-normal text-body">{f.text}</span>
                  {words.length > 0 && <span className="text-sm text-muted">In {f.bucket}</span>}
                </span>
              </label>
            )
          })}
        </section>
      </div>
      {problem ? (
        <span className={problemText}>{problem}</span>
      ) : (
        features.length > 0 && <p className="text-sm text-body">{pickedSummary(features)}</p>
      )}
    </div>
  )
}
