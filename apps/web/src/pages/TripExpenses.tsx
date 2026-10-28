// Trip Financials' vendor expenses (issue #16): what the organizer pays out for the trip (the house, the resort, a
// chef), so they can see what's left after costs without a spreadsheet. Recorded only: Travel HQ never moves money.
// An expense is paid once it has a paid date and still owed until then, by its due date when it has one.
import type { Expense, ExpenseInput, OrganizerTrip } from '@cc/types'
import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'
import { useAdminView } from '@/components/AdminView'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { money, shortDate } from '@/lib/format'
import { centsFrom, dollarsFor, today } from '@/lib/payments'

const filled =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-royal px-3 text-sm font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'
const field =
  'min-h-[44px] rounded-lg border border-[#5B6B80] bg-white px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'

const input = (e: Expense): ExpenseInput => ({
  payee: e.payee,
  description: e.description,
  amountCents: e.amountCents,
  paidOn: e.paidOn,
  dueOn: e.dueOn,
})

/** What was paid out and what is still owed, for Trip Financials' totals and its export. */
export function expenseTotals(expenses: Expense[]) {
  const paid = expenses.filter((e) => e.paidOn).reduce((n, e) => n + e.amountCents, 0)
  const owed = expenses.filter((e) => !e.paidOn).reduce((n, e) => n + e.amountCents, 0)
  return { paid, owed }
}

export function Expenses({
  trip,
  expenses,
  onChange,
  collected,
  agreed,
}: {
  trip: OrganizerTrip
  expenses: Expense[]
  onChange: (next: Expense[]) => void
  /** All money that arrived from guests. */
  collected: number
  /** What the accepted guests agreed to pay. */
  agreed: number
}) {
  const admin = useAdminView()
  const toast = useToast()
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [removing, setRemoving] = useState<Expense | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { paid, owed } = expenseTotals(expenses)

  /** Runs a change and takes the list it returns; the reason it failed goes on the section's (or dialog's) line. */
  async function save(change: () => Promise<Expense[]>): Promise<boolean> {
    setError(null)
    try {
      onChange(await change())
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.')
      return false
    }
  }

  async function submit(form: ExpenseInput) {
    const before = editing
    const saved = await save(() =>
      before && before !== 'new'
        ? api.updateExpense(trip.id, before.id, form)
        : api.addExpense(trip.id, form)
    )
    if (!saved) return false
    setEditing(null)
    toast({
      text:
        before === 'new'
          ? `${money(form.amountCents)} to ${form.payee} added.`
          : `${form.payee} updated.`,
    })
    return true
  }

  async function markPaid(e: Expense) {
    if (!(await save(() => api.updateExpense(trip.id, e.id, { ...input(e), paidOn: today() }))))
      return
    toast({
      text: `${money(e.amountCents)} to ${e.payee} marked paid.`,
      action: {
        label: 'Undo',
        onClick: () => void save(() => api.updateExpense(trip.id, e.id, input(e))),
      },
    })
  }

  async function remove(e: Expense) {
    setRemoving(null)
    if (!(await save(() => api.removeExpense(trip.id, e.id)))) return
    setEditing(null)
    toast({
      text: `${e.payee} removed.`,
      action: { label: 'Undo', onClick: () => void save(() => api.addExpense(trip.id, input(e))) },
    })
  }

  const stat = (label: string, value: number, negative = false) => (
    <div className="rounded-xl bg-ground px-4 py-3">
      <div className="text-sm text-muted">{label}</div>
      <div className={`font-display text-xl font-extrabold ${negative ? 'text-[#B42318]' : ''}`}>
        {money(value)}
      </div>
    </div>
  )
  const onHand = collected - paid
  const atEnd = agreed - paid - owed

  return (
    <div className="flex flex-col gap-3 border-t border-[#E4E9EE] pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-extrabold">Vendor costs</h3>
        {!admin && (
          <button type="button" className={filled} onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add a cost
          </button>
        )}
      </div>
      {error && !editing && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat('Paid to vendors', paid)}
        {stat('Still owed', owed)}
        {stat('On hand now', onHand, onHand < 0)}
        {stat('Left after bills', atEnd, atEnd < 0)}
      </div>
      <p className="text-sm text-muted">
        On hand now is all money in less what you’ve paid. Left after bills is what accepted guests
        agreed to pay, less every cost.
      </p>
      {expenses.length === 0 ? (
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
          Add what you pay for the trip (the house, the resort, a chef) to see what’s left after
          costs. Travel HQ only records it; the money still goes from you to them.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#E4E9EE]">
          {expenses.map((e) => {
            const late = !e.paidOn && e.dueOn !== null && e.dueOn < today()
            return (
              <li key={e.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-semibold">{e.payee}</span>
                    <span className="shrink-0 font-semibold sm:hidden">{money(e.amountCents)}</span>
                  </div>
                  {e.description && <div className="text-sm text-body">{e.description}</div>}
                  <div
                    className={`text-sm ${late ? 'font-semibold text-[#B42318]' : 'text-muted'}`}
                  >
                    {e.paidOn
                      ? `Paid ${shortDate(e.paidOn)}`
                      : e.dueOn
                        ? `${late ? 'Overdue, was due' : 'Due'} ${shortDate(e.dueOn)}`
                        : 'Not paid yet'}
                  </div>
                </div>
                <span className="hidden w-24 shrink-0 text-right font-semibold sm:block">
                  {money(e.amountCents)}
                </span>
                {!admin && (
                  <div className="flex gap-2 sm:w-[196px] sm:justify-end">
                    {!e.paidOn && (
                      <button type="button" className={filled} onClick={() => void markPaid(e)}>
                        Mark paid
                      </button>
                    )}
                    <button type="button" className={outlined} onClick={() => setEditing(e)}>
                      Edit
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {editing && (
        <ExpenseForm
          expense={editing === 'new' ? null : editing}
          error={error}
          onSubmit={submit}
          onRemove={(e) => setRemoving(e)}
          onClose={() => {
            setEditing(null)
            setError(null)
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${money(removing.amountCents)} to ${removing.payee}?`}
          confirmLabel="Remove"
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        >
          <p>It comes off Trip Financials and the export.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

/** Adding or changing one cost: who, what for, how much, and whether it's paid (and when) or still owed. */
function ExpenseForm({
  expense,
  error,
  onSubmit,
  onRemove,
  onClose,
}: {
  expense: Expense | null
  error: string | null
  onSubmit: (form: ExpenseInput) => Promise<boolean>
  onRemove: (e: Expense) => void
  onClose: () => void
}) {
  const [payee, setPayee] = useState(expense?.payee ?? '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(expense ? dollarsFor(expense.amountCents) : '')
  const [isPaid, setIsPaid] = useState(expense ? expense.paidOn !== null : true)
  const [paidOn, setPaidOn] = useState(expense?.paidOn ?? today())
  const [dueOn, setDueOn] = useState(expense?.dueOn ?? '')
  const [tried, setTried] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const cents = centsFrom(amount)
  const problems: Record<string, string> = {}
  if (!payee.trim()) problems.payee = 'Say who gets paid.'
  if (!cents) problems.amount = 'Enter the amount.'
  else if (cents > 100_000_00) problems.amount = 'That’s more than $100,000.'
  if (isPaid && !paidOn) problems.paidOn = 'Enter the day you paid.'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(problems).length > 0) return
    setBusy(true)
    try {
      await onSubmit({
        payee: payee.trim(),
        description: description.trim(),
        amountCents: cents,
        paidOn: isPaid ? paidOn : null,
        // A paid cost keeps the due date it had; a new one paid already has none.
        dueOn: isPaid ? (expense?.dueOn ?? null) : dueOn || null,
      })
    } finally {
      setBusy(false)
    }
  }
  const touch = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }))
  const problem = (k: string) =>
    (tried || touched[k]) && problems[k] ? (
      <span className="font-semibold text-[#B42318]">{problems[k]}</span>
    ) : null
  const choice = (on: boolean) =>
    `min-h-[44px] flex-1 rounded-lg px-3 text-sm font-semibold ${on ? 'bg-royal text-white' : 'text-royal hover:bg-royal-pale'}`

  return (
    <Dialog title={expense ? `Edit ${expense.payee}` : 'Add a cost'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Who gets paid
          <input
            className={field}
            placeholder="Seaside Rentals"
            maxLength={160}
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            onBlur={touch('payee')}
          />
          {problem('payee')}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          What it’s for (optional)
          <input
            className={field}
            placeholder="House deposit"
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Amount
          <input
            className={field}
            inputMode="decimal"
            placeholder="$0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={touch('amount')}
          />
          {problem('amount')}
        </label>
        <div className="flex flex-col gap-1.5 text-sm font-semibold">
          <span id="expense-paid">Paid yet?</span>
          <div
            role="group"
            aria-labelledby="expense-paid"
            className="flex gap-1 rounded-xl border border-royal p-1"
          >
            <button
              type="button"
              aria-pressed={isPaid}
              className={choice(isPaid)}
              onClick={() => setIsPaid(true)}
            >
              Paid
            </button>
            <button
              type="button"
              aria-pressed={!isPaid}
              className={choice(!isPaid)}
              onClick={() => setIsPaid(false)}
            >
              Still owed
            </button>
          </div>
        </div>
        {isPaid ? (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Day you paid
            <input
              type="date"
              className={field}
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              onBlur={touch('paidOn')}
            />
            {problem('paidOn')}
          </label>
        ) : (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Due date (optional)
            <input
              type="date"
              className={field}
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={filled}>
            {expense ? 'Save' : 'Add cost'}
          </button>
          {expense && (
            <button type="button" className={outlined} onClick={() => onRemove(expense)}>
              Remove
            </button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
