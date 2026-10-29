// Reporting a payment (owner's pick, 2026-10-29): the total first, then how it's applied across the balances the
// person pays (themselves and the travelers they look after): due now first, split evenly, or their own amounts.
import { paymentMethodLabel, type JoinView, type MyGuest } from '@cc/types'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Dialog } from '@/components/Dialog'
import { ApiError, api } from '@/lib/api'
import { money } from '@/lib/format'
import { centsFrom, dollarsFor, owed, today } from '@/lib/payments'

const input =
  'rounded-[10px] border border-[#5B6B80] bg-white px-3.5 py-3 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal'
const primary =
  'min-h-[52px] rounded-xl bg-royal px-5 text-[17px] font-semibold text-white hover:bg-royal-dark'

const Problem = ({ children }: { children: ReactNode }) => (
  <span className="text-sm font-semibold text-[#B42318]">{children}</span>
)

/** Applies `total` to each person's balance: what's due now for each, in order, then what's left, in order. */
function dueFirst(total: number, people: MyGuest[]): Record<string, number> {
  const out: Record<string, number> = {}
  let rest = total
  for (const g of people) {
    const take = Math.min(rest, owed(g.terms!).dueNow)
    out[g.id] = take
    rest -= take
  }
  for (const g of people) {
    const take = Math.min(rest, owed(g.terms!).left - out[g.id])
    out[g.id] += take
    rest -= take
  }
  return out
}

/** The same total in equal shares, the odd cents to the first, never past what someone has left. */
function evenly(total: number, people: MyGuest[]): Record<string, number> {
  const each = Math.floor(total / people.length / 100) * 100
  const out: Record<string, number> = {}
  people.forEach((g, i) => {
    out[g.id] = Math.min(owed(g.terms!).left, i === 0 ? total - each * (people.length - 1) : each)
  })
  return out
}

interface PayProps {
  view: JoinView
  people: MyGuest[]
  onDone: (v: JoinView) => void
  onClose: () => void
}

/**
 * Total first (owner's ask, 2026-10-28): what did you send, then how it's applied. Every problem shows beside its
 * field as soon as it's known; pressing Report payment with any left lists them all at once (owner's ask, 2026-10-29:
 * the whole total applied, and "I sent this payment" ticked).
 */
export function ReportPayment({ view, people, onDone, onClose }: PayProps) {
  const { trip, me } = view
  const o = trip.organizerName
  const methods = people[0]?.paymentMethods ?? []
  const [amount, setAmount] = useState('')
  const [split, setSplit] = useState<'due' | 'even' | 'own'>('due')
  const [own, setOwn] = useState<Record<string, string> | null>(null)
  const [method, setMethod] = useState<number | null>(methods.length === 1 ? 0 : null)
  const [sentOn, setSentOn] = useState(today())
  const [note, setNote] = useState('')
  const [certified, setCertified] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = centsFrom(amount)
  const allDue = people.reduce((n, g) => n + owed(g.terms!).dueNow, 0)
  const allLeft = people.reduce((n, g) => n + owed(g.terms!).left, 0)
  const auto = split === 'even' ? evenly(total, people) : dueFirst(total, people)
  const shares: Record<string, number> = own
    ? Object.fromEntries(people.map((g) => [g.id, centsFrom(own[g.id] ?? '')]))
    : auto
  const applied = people.reduce((n, g) => n + (shares[g.id] ?? 0), 0)
  const name = (g: MyGuest) => (g.id === me?.id ? 'You' : `${g.firstName} ${g.lastName}`)
  const short = people.some((g) => shares[g.id] > 0 && shares[g.id] < owed(g.terms!).dueNow)

  const problems: Record<string, string> = {}
  if (!total) problems.amount = 'Enter how much you sent.'
  else if (total > allLeft) problems.amount = `That’s more than the ${money(allLeft)} left in all.`
  for (const g of people)
    if (shares[g.id] > owed(g.terms!).left)
      problems[g.id] =
        `More than the ${money(owed(g.terms!).left)} ${g.id === me?.id ? 'you have' : 'they have'} left.`
  if (total && applied !== total)
    problems.applied =
      applied < total
        ? `${money(total - applied)} still to apply.`
        : `That’s ${money(applied - total)} more than you sent.`
  if (method === null && methods.length > 0) problems.method = 'Pick how you paid.'
  if (!sentOn) problems.sentOn = 'Enter the day you sent it.'
  else if (sentOn > today()) problems.sentOn = 'That day hasn’t happened yet.'
  if (short && !note.trim()) problems.note = 'Say why it’s less than what’s due.'
  if (!certified) problems.certified = `Send the payment to ${o} first, then tick this.`
  const show = (k: string) => (tried || touched[k] ? problems[k] : undefined)
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(problems).length > 0 || busy) return
    const forGuests = people
      .filter((g) => shares[g.id] > 0)
      .map((g) => ({ guestId: g.id, amount: shares[g.id] }))
    setBusy(true)
    setError(null)
    try {
      onDone(
        await api.reportPayment(trip.slug, {
          guestPaymentAmount: total,
          methodIndex: method,
          sentOn,
          note: short ? note.trim() : '',
          certified: true,
          ...(forGuests.length === 1 && forGuests[0].guestId === me?.id ? {} : { forGuests }),
        })
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't go through. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const totalField = (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 font-semibold">
        How much did you send in total?
        <input
          className={`${input} text-2xl font-bold`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="$0"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
          }}
          onBlur={() => touch('amount')}
          aria-invalid={Boolean(show('amount'))}
        />
      </label>
      {allDue > 0 && (
        <button
          type="button"
          onClick={() => {
            setAmount(dollarsFor(allDue))
            touch('amount')
          }}
          className="self-start text-sm font-semibold text-royal underline"
        >
          Everything due now: {money(allDue)}
        </button>
      )}
      {show('amount') && <Problem>{show('amount')}</Problem>}
    </div>
  )

  const editable = split === 'own'
  const applyList = (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-semibold">How it’s applied</legend>
      <div className="mb-1 grid grid-cols-3 gap-1.5 rounded-xl bg-ground p-1 text-sm font-semibold">
        {(
          [
            ['due', 'Due now first'],
            ['even', 'Split evenly'],
            ['own', 'I’ll choose'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={split === key}
            onClick={() => {
              setSplit(key)
              setOwn(
                key === 'own'
                  ? Object.fromEntries(people.map((g) => [g.id, dollarsFor(shares[g.id] ?? 0)]))
                  : null
              )
            }}
            className={`min-h-[44px] rounded-lg px-2 ${split === key ? 'bg-white text-royal shadow-card' : 'text-body'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {people.map((g) => {
        const { dueNow, left } = owed(g.terms!)
        return (
          <div
            key={g.id}
            className="flex items-center justify-between gap-3 border-t border-rule pt-2 first-of-type:border-t-0"
          >
            <span className="min-w-0">
              <span className="block font-semibold">{name(g)}</span>
              <span className="text-sm text-muted">
                {dueNow > 0 ? `${money(dueNow)} due now` : `${money(left)} left`}
              </span>
              {problems[g.id] && (
                <span className="block">
                  <Problem>{problems[g.id]}</Problem>
                </span>
              )}
            </span>
            {editable ? (
              <input
                className={`${input} w-28 py-2 text-right`}
                inputMode="decimal"
                aria-label={`For ${name(g)}`}
                value={own ? (own[g.id] ?? '') : shares[g.id] ? dollarsFor(shares[g.id]) : ''}
                placeholder="$0"
                onChange={(e) =>
                  setOwn({
                    ...(own ??
                      Object.fromEntries(
                        people.map((x) => [x.id, shares[x.id] ? dollarsFor(shares[x.id]) : ''])
                      )),
                    [g.id]: e.target.value,
                  })
                }
              />
            ) : (
              <span className="font-bold">{money(shares[g.id] ?? 0)}</span>
            )}
          </div>
        )
      })}
      <p className="flex justify-between border-t border-rule pt-2 font-semibold">
        <span>Applied</span>
        <span>
          {money(applied)} of {money(total)}
        </span>
      </p>
      {problems.applied && <Problem>{problems.applied}</Problem>}
    </fieldset>
  )

  const howAndWhen = (
    <>
      {methods.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 font-semibold">How you paid</legend>
          {methods.length === 1 ? (
            <p className="text-body">{paymentMethodLabel(methods[0])}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {methods.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={method === i}
                  onClick={() => setMethod(i)}
                  className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${
                    method === i ? 'border-royal bg-royal-pale text-royal' : 'border-rule text-body'
                  }`}
                >
                  {paymentMethodLabel(m)}
                </button>
              ))}
            </div>
          )}
          {show('method') && <Problem>{show('method')}</Problem>}
        </fieldset>
      )}
      <label className="flex flex-col gap-1.5 font-semibold">
        Day you sent it
        <input
          type="date"
          className={input}
          value={sentOn}
          max={today()}
          onChange={(e) => setSentOn(e.target.value)}
        />
        {show('sentOn') && <Problem>{show('sentOn')}</Problem>}
      </label>
    </>
  )

  const finish = (
    <>
      {short && (
        <label className="flex flex-col gap-1.5 font-semibold">
          Why it’s less than what’s due
          <textarea
            className={`${input} min-h-[80px]`}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: the rest on Friday, after payday."
          />
          {show('note') && <Problem>{show('note')}</Problem>}
        </label>
      )}
      <div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={certified}
            onChange={(e) => {
              setCertified(e.target.checked)
              touch('certified')
            }}
            className="mt-0.5 h-5 w-5 shrink-0 accent-royal"
          />
          <span>
            I sent this payment to {o}
            {total ? `: ${money(total)}` : ''}.
          </span>
        </label>
        {show('certified') && <Problem>{show('certified')}</Problem>}
      </div>
      {tried && Object.keys(problems).length > 0 && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {Object.keys(problems).length === 1
            ? 'Fix the one thing marked above to report this payment.'
            : `Fix the ${Object.keys(problems).length} things marked above to report this payment.`}
        </p>
      )}
      <button type="submit" aria-disabled={busy} className={primary}>
        {busy ? 'Sending…' : 'Report payment'}
      </button>
    </>
  )

  return (
    <Dialog title="Report a payment" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        {totalField}
        {/* One person: all of it is theirs, nothing to split. */}
        {people.length > 1 && applyList}
        {howAndWhen}
        {finish}
      </form>
    </Dialog>
  )
}
