import {
  MEMBERSHIP_NOTE_MAX,
  PAID_FEATURES,
  type Membership,
  type MembershipInput,
  type PaidFeature,
} from '@cc/types'
import { Gem, Plus } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
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
    <Dialog title={member ? 'Change paid features' : 'Add a member'} onClose={onClose}>
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

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 font-semibold text-ink">Paid features</legend>
          {PAID_FEATURES.map((f) => (
            <label
              key={f.key}
              className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-rule px-4 py-3"
            >
              <input
                type="checkbox"
                checked={features.includes(f.key)}
                onChange={(e) => toggle(f.key, e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-royal"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {f.title}
                  {!f.built && (
                    <span className="rounded-full bg-royal-pale px-2.5 py-0.5 text-xs font-semibold text-royal">
                      Coming soon
                    </span>
                  )}
                </span>
                <span className="text-sm text-body">{f.text}</span>
              </span>
            </label>
          ))}
          {touched.features && featuresProblem && (
            <span className={problemText}>{featuresProblem}</span>
          )}
        </fieldset>

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
