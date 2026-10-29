import { useUser } from '@clerk/clerk-react'
import type { TripInvite, TripPeople, TripPerson, TripRole } from '@cc/types'
import { ArrowLeft, Check, ChevronDown, Users } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'
import { Logo } from '@/components/Logo'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { IconCircle } from './TripGuests'

// A trip's People screen: who runs the trip. Its owners (and the admin, from the Admin toolbox) add people by the
// email they signed in with, change their role and remove them. Organizers see the list only.

const input =
  'rounded-[10px] border border-[#5B6B80] bg-white px-3.5 py-3 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal'
const outlined =
  'inline-flex min-h-[44px] items-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'
const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-royal px-4 font-semibold text-white hover:bg-royal-dark disabled:opacity-50'
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

const ROLES: { role: TripRole; title: string; line: string }[] = [
  {
    role: 'organizer',
    title: 'Organizer',
    line: 'Runs the trip: guests, payments, the trip page.',
  },
  {
    role: 'owner',
    title: 'Owner',
    line: 'Everything an organizer does, and decides who runs the trip.',
  },
]
const roleName = (r: TripRole) => (r === 'owner' ? 'Owner' : 'Organizer')

export function PeoplePage({ admin = false }: { admin?: boolean }) {
  const { id = '' } = useParams()
  const { user } = useUser()
  const [data, setData] = useState<TripPeople | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<TripPerson | null>(null)
  const toast = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    api
      .getPeople(id, admin)
      .then(setData)
      .catch(() => setError('This trip could not be loaded.'))
  }, [id, admin])

  /** True when the change saved; otherwise the reason shows at the top of the section. */
  async function save(change: () => Promise<TripPeople>): Promise<boolean> {
    setError(null)
    try {
      setData(await change())
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That change did not save.')
      return false
    }
  }

  async function setRole(p: TripPerson, role: TripRole) {
    if (await save(() => api.setPersonRole(id, p.userId, role, admin)))
      toast({
        text: `${p.name} is now ${role === 'owner' ? 'an owner' : 'an organizer'}.`,
        action: { label: 'Undo', onClick: () => void setRole(p, p.role) },
      })
  }

  async function setInviteRole(i: TripInvite, role: TripRole) {
    if (await save(() => api.setInviteRole(id, i.email, role, admin)))
      toast({
        text: `${i.email} will join as ${role === 'owner' ? 'an owner' : 'an organizer'}.`,
        action: { label: 'Undo', onClick: () => void setInviteRole(i, i.role) },
      })
  }

  async function cancelInvite(i: TripInvite) {
    if (await save(() => api.cancelInvite(id, i.email, admin)))
      toast({
        text: `Invite to ${i.email} cancelled.`,
        action: {
          label: 'Undo',
          onClick: () =>
            void save(() =>
              api.addPerson(id, { email: i.email, role: i.role, notify: false }, admin)
            ),
        },
      })
  }

  async function remove(p: TripPerson) {
    setRemoving(null)
    setError(null)
    let left: TripPeople | null
    try {
      left = await api.removePerson(id, p.userId, admin)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That change did not save.')
      return
    }
    // An owner who stepped down no longer sees the trip.
    if (!left) {
      toast({ text: `You no longer run ${data?.tripName ?? 'this trip'}.` })
      navigate('/organize')
      return
    }
    setData(left)
    toast({
      text: `${p.name} no longer runs this trip.`,
      action: p.email
        ? {
            label: 'Undo',
            onClick: () =>
              void save(() =>
                api.addPerson(id, { email: p.email, role: p.role, notify: false }, admin)
              ),
          }
        : undefined,
    })
  }

  if (!data && error) return <p className="p-8 text-body">{error}</p>
  if (!data) return <div className="min-h-screen bg-ground" aria-busy="true" />
  const owners = data.people.filter((p) => p.role === 'owner').length

  return (
    <div className="min-h-screen bg-ground pb-16 text-ink">
      <header className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            to={admin ? '/admin/trips' : `/organize/${id}/control`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {admin ? 'Trip admin' : 'Control panel'}
          </Link>
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto flex max-w-[960px] flex-col gap-6 px-5">
        <div>
          <p className="text-sm font-semibold text-muted">People</p>
          <h1 className="text-3xl font-extrabold">{data.tripName}</h1>
        </div>

        <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-3 text-xl font-extrabold">
              <IconCircle icon={Users} />
              Who runs this trip
            </h2>
            {data.canManage && (
              <button type="button" onClick={() => setAdding(true)} className={filled}>
                Add a person
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="font-semibold text-[#B42318]">
              {error}
            </p>
          )}
          {!data.canManage && (
            <p className="rounded-xl bg-royal-pale px-4 py-3">
              Only the trip’s owners can change who runs it.
            </p>
          )}
          {data.people.length + data.invites.length === 0 ? (
            <p className="text-body">Nobody runs this trip yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-rule">
              {data.people.map((p) => (
                <li
                  key={p.userId}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {p.name}
                      {p.userId === user?.id && <span className="text-muted"> (you)</span>}
                    </div>
                    <div className="break-all text-sm text-body">{p.email}</div>
                    {!data.canManage && (
                      <div
                        className={`text-sm font-semibold ${p.role === 'owner' ? 'text-royal' : 'text-muted'}`}
                      >
                        {roleName(p.role)}
                      </div>
                    )}
                    {data.canManage && p.role === 'owner' && owners === 1 && (
                      <div className="text-sm text-muted">
                        The only owner. Make someone else an owner to change this.
                      </div>
                    )}
                  </div>
                  {data.canManage && (
                    <div className="flex items-center gap-2 sm:w-[250px] sm:shrink-0">
                      {/* A menu, so more roles can join later. The last owner stays: a trip always has one. */}
                      <RoleMenu
                        label={`Role for ${p.name}`}
                        value={p.role}
                        disabled={p.role === 'owner' && owners === 1}
                        ownerOff={data.isSample}
                        onChange={(role) => void setRole(p, role)}
                      />
                      {(p.role === 'organizer' || owners > 1) && (
                        <button type="button" onClick={() => setRemoving(p)} className={outlined}>
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
              {/* Invited before they signed in: they join with this role when they first do. */}
              {data.invites.map((i) => (
                <li
                  key={i.email}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="break-all font-semibold">{i.email}</div>
                    <div className="text-sm text-muted">
                      Invited · joins when they first sign in
                      {!data.canManage && ` · ${roleName(i.role)}`}
                    </div>
                  </div>
                  {data.canManage && (
                    <div className="flex items-center gap-2 sm:w-[250px] sm:shrink-0">
                      <RoleMenu
                        label={`Role for ${i.email}`}
                        value={i.role}
                        disabled={false}
                        ownerOff={data.isSample}
                        onChange={(role) => void setInviteRole(i, role)}
                      />
                      <button type="button" onClick={() => cancelInvite(i)} className={outlined}>
                        Cancel
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {adding && (
        <AddPerson
          isSample={data.isSample}
          onClose={() => setAdding(false)}
          onAdd={async (email, role) => {
            const saved = await api.addPerson(id, { email, role }, admin)
            setData(saved)
            setAdding(false)
            const added = saved.people.find((p) => p.email.toLowerCase() === email)
            toast({
              text: added
                ? `${added.name} now helps run this trip.${added.userId === user?.id ? '' : ' We emailed them.'}`
                : `${email} is invited. We emailed them how to sign up.`,
            })
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          confirmLabel="Remove"
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        >
          <p>
            {removing.userId === user?.id
              ? 'You will no longer see this trip.'
              : 'They will no longer see this trip or its guests.'}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}

/**
 * A person's role as our own menu, not the browser's (owner's call, 2026-10-28: the browser's open list can't be
 * styled). Each role says in a line what it may do. Arrow keys move, Enter picks, Escape or a click outside closes.
 */
function RoleMenu({
  label,
  value,
  disabled,
  ownerOff,
  onChange,
}: {
  label: string
  value: TripRole
  disabled: boolean
  /** Sample trips have no owner. */
  ownerOff: boolean
  onChange: (role: TripRole) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const uid = useId()
  const choices = ROLES.filter((r) => !(ownerOff && r.role === 'owner'))

  useEffect(() => {
    if (!open) return
    setActive(
      Math.max(
        0,
        choices.findIndex((r) => r.role === value)
      )
    )
    list.current?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function pick(role: TripRole) {
    setOpen(false)
    if (role !== value) onChange(role)
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') setActive((i) => Math.min(choices.length - 1, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Enter' || e.key === ' ') pick(choices[active].role)
    else return
    e.preventDefault()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${roleName(value)}`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-[48px] w-[150px] items-center justify-between gap-2 rounded-xl border border-rule bg-white px-3 text-[16px] font-semibold text-ink hover:border-royal focus:outline-none focus-visible:ring-2 focus-visible:ring-royal/30 disabled:bg-ground disabled:font-normal disabled:text-muted disabled:hover:border-rule"
      >
        {roleName(value)}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${uid}-${choices[active]?.role}`}
          onKeyDown={onKey}
          className="absolute left-0 top-[calc(100%+6px)] z-20 w-[280px] rounded-2xl border border-rule bg-white p-2 shadow-[0_16px_40px_rgba(15,28,46,0.14)] focus:outline-none"
        >
          {choices.map((r, i) => (
            <li
              key={r.role}
              id={`${uid}-${r.role}`}
              role="option"
              aria-selected={r.role === value}
              onClick={() => pick(r.role)}
              onPointerEnter={() => setActive(i)}
              className={`flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2.5 ${
                i === active ? 'bg-royal-pale' : ''
              }`}
            >
              <Check
                className={`mt-0.5 h-4 w-4 shrink-0 text-royal ${r.role === value ? '' : 'invisible'}`}
                aria-hidden="true"
              />
              <span>
                <span className="block font-semibold text-ink">{r.title}</span>
                <span className="text-sm text-body">{r.line}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Adding someone by the email they signed in with, as an organizer or an owner. */
function AddPerson({
  isSample,
  onClose,
  onAdd,
}: {
  isSample: boolean
  onClose: () => void
  /** Throws with the reason when it didn't save. */
  onAdd: (email: string, role: TripRole) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<TripRole>('organizer')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const trimmed = email.trim().toLowerCase()
  const problem = !trimmed
    ? 'Enter their email.'
    : !EMAIL.test(trimmed)
      ? 'Enter an email address.'
      : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (problem) return
    setBusy(true)
    setError(null)
    try {
      await onAdd(trimmed, role)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'They could not be added.')
      setBusy(false)
    }
  }

  return (
    <Dialog title="Add a person" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <p className="rounded-xl bg-royal-pale px-4 py-3">
          Use the email they sign in to Travel HQ with. If they haven’t signed in yet, they join the
          trip when they first do.
        </p>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Email
          <input
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            type="email"
            maxLength={254}
            autoComplete="off"
          />
          {touched && problem && <span className="font-semibold text-[#B42318]">{problem}</span>}
        </label>
        {!isSample && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-semibold">Role</legend>
            {ROLES.map((r) => (
              <label
                key={r.role}
                className={`flex min-h-[56px] cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-sm ${
                  role === r.role ? 'border-royal bg-royal-pale' : 'border-rule bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  checked={role === r.role}
                  onChange={() => setRole(r.role)}
                  className="mt-1 h-4 w-4 accent-royal"
                />
                <span>
                  <span className="block font-semibold text-ink">{r.title}</span>
                  <span className="text-body">{r.line}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <button type="submit" disabled={busy} className={`${filled} min-h-[52px] text-[17px]`}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </form>
    </Dialog>
  )
}
