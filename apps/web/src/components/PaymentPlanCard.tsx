import { paymentPlan, roomPrice, roomsPricedApart, type TripRoom } from '@cc/types'
import { useState, type ReactNode } from 'react'
import { Dropdown, REMIND_OPTIONS } from '@/components/Dropdown'
import { Card, Field, field, Money } from '@/components/EditorParts'
import { money } from '@/lib/format'
import { spreadDates } from '@/lib/pricing'

// The payment plan (step 5 of the trip editor): how many payments guests make, by when, and the reminders. It is the
// trip's own, saved with it, and goes into the agreement guests sign.

const cents = (dollars: string) => Math.round((Number(dollars.replace(/[$,\s]/g, '')) || 0) * 100)
/** A percentage typed ("33.5") as hundredths of a percent (3350). */
const hundredths = (pct: string) => Math.round((Number(pct.replace(/[%,\s]/g, '')) || 0) * 100)
const FULL = 10_000

type PlanWay = 'even' | 'deposit' | 'custom'

/**
 * What's wrong with a custom plan, or null. One price for everyone: the amounts add up to it. Rooms priced apart: the
 * percentages add up to 100.
 */
export function sharesProblem(
  shares: number[] | null,
  priceCents: number,
  byPercent: boolean
): string | null {
  if (!shares) return null
  const sum = shares.reduce((a, b) => a + b, 0)
  if (shares.some((v) => !(v > 0))) return 'Give every payment an amount.'
  if (byPercent && sum !== FULL) return `The payments add up to ${sum / 100}%, not 100%.`
  if (!byPercent && sum !== priceCents)
    return `The payments add up to ${money(sum)}, not the price, ${money(priceCents)}.`
  return null
}

const bars = (heights: number[]) => (
  <svg viewBox="0 0 56 44" aria-hidden="true" className="h-9 w-11">
    {heights.map((h, i) => (
      <rect
        key={i}
        x={6 + i * 16}
        y={40 - h}
        width="12"
        height={h}
        rx="2"
        fill={i === 0 ? '#EFE8F8' : '#fff'}
        stroke="currentColor"
        strokeWidth="2"
      />
    ))}
  </svg>
)

const PLAN_WAYS: { value: PlanWay; label: string; hint: string; art: ReactNode }[] = [
  {
    value: 'even',
    label: 'Even split',
    hint: 'One payment, or the same amount each time.',
    art: bars([20, 20, 20]),
  },
  {
    value: 'deposit',
    label: 'Deposit first',
    hint: 'A set first payment holds the spot; the rest is even.',
    art: bars([32, 14, 14]),
  },
  {
    value: 'custom',
    label: 'Custom',
    hint: 'You set each payment’s amount.',
    art: bars([12, 32, 22]),
  },
]

/** The plan every guest signs, at the trip's price and at each room's own (issue #30). */
export function PaymentPlanCard({
  rooms,
  startDate,
  costCents,
  installments,
  onInstallments,
  dueDates,
  onDueDates,
  firstPaymentCents,
  onFirstPayment,
  shares,
  onShares,
  depositKept,
  onDepositKept,
  depositKeptLocked,
  reminderDays,
  onReminderDays,
}: {
  rooms: TripRoom[]
  startDate: string
  costCents: number
  installments: number
  onInstallments: (n: number) => void
  dueDates: string[]
  onDueDates: (dates: string[]) => void
  firstPaymentCents: number | null
  onFirstPayment: (cents: number | null) => void
  /** A custom plan's shares (dollars in cents, or hundredths of a percent when rooms are priced apart), or null. */
  shares: number[] | null
  onShares: (shares: number[] | null) => void
  /** The deposit isn't refunded when a guest drops out: the trip's "Keep the deposit" refund terms. */
  depositKept: boolean
  onDepositKept: (kept: boolean) => void
  /** Guests signed under the refund terms, so they can't change. */
  depositKeptLocked: boolean
  reminderDays: number | null
  onReminderDays: (days: number | null) => void
}) {
  const planAt = (price: number) =>
    paymentPlan(price, installments, firstPaymentCents, dueDates, shares)
  const plan = planAt(costCents)
  const apart = roomsPricedApart(rooms, costCents)
  const way: PlanWay = shares ? 'custom' : firstPaymentCents !== null ? 'deposit' : 'even'
  // Rooms priced apart: a custom plan is in percentages, shown in dollars for a room the organizer picks.
  const [sampleId, setSampleId] = useState<string | null>(null)
  const sample = rooms.find((r) => (r.id ?? r.name) === sampleId) ?? rooms[0]
  const samplePlan = sample ? planAt(roomPrice(sample, costCents)) : plan
  const problem = sharesProblem(shares, costCents, apart)
  /** A custom plan to start from: the plan as it is now, in dollars or in percentages. */
  function sharesFor(n: number): number[] {
    const now = paymentPlan(costCents, n, null, [])
    if (!apart) return now.map((p) => p.amountCents)
    const pct = now.map((p) => Math.round((p.amountCents / costCents) * FULL))
    pct[n - 1] = FULL - pct.slice(0, -1).reduce((a, b) => a + b, 0)
    return pct
  }
  function choose(next: PlanWay) {
    if (next === way) return
    // A deposit or a custom plan needs more than one payment.
    const n = next === 'even' ? installments : Math.max(installments, next === 'deposit' ? 2 : 3)
    if (n !== installments) {
      onInstallments(n)
      changeEnds(first, last, n)
    }
    onShares(next === 'custom' ? sharesFor(n) : null)
    onFirstPayment(next === 'deposit' ? Math.min(lowest, 30000) || null : null)
  }
  // What the last payment would be if it took up the difference; only offered when that leaves it above zero.
  const lastRest = shares
    ? (apart ? FULL : costCents) - shares.slice(0, -1).reduce((a, b) => a + b, 0)
    : 0
  const putRestLast = () =>
    shares && onShares(shares.map((v, i) => (i === shares.length - 1 ? lastRest : v)))
  // One line per price, naming its rooms ("$500 · Casita 1, Casita 2").
  const prices = [...new Set(rooms.map((r) => roomPrice(r, costCents)))]
    .sort((a, b) => a - b)
    .map((price) => ({
      price,
      plan: planAt(price),
      rooms: rooms.filter((r) => roomPrice(r, costCents) === price).map((r) => r.name || 'Room'),
    }))
  const lowest = Math.min(costCents, ...rooms.map((r) => roomPrice(r, costCents)))

  // The first and last due dates; until both are set (with more than one payment), they wait here unsaved.
  const [ends, setEnds] = useState({ first: '', last: '' })
  const first = dueDates[0] ?? ends.first
  const last =
    installments > 1 ? (dueDates.length > 1 ? dueDates[dueDates.length - 1] : ends.last) : first
  function changeEnds(f: string, l: string, n = installments) {
    setEnds({ first: f, last: l })
    if (n === 1) onDueDates(f ? [f] : [])
    else onDueDates(f && l && f <= l ? spreadDates(f, l, n) : [])
  }
  function changeCount(n: number) {
    onInstallments(n)
    if (shares) onShares(n > 1 ? sharesFor(n) : null)
    changeEnds(first, installments === 1 ? ends.last : last, n)
  }

  return (
    <>
      <Card title="How do guests pay it off?">
        <div
          role="radiogroup"
          aria-label="How guests pay it off"
          className="grid gap-2 sm:grid-cols-3"
        >
          {PLAN_WAYS.map((w) => (
            <button
              key={w.value}
              type="button"
              role="radio"
              aria-checked={way === w.value}
              onClick={() => choose(w.value)}
              className={`grid min-h-[44px] grid-cols-[44px_1fr] items-center gap-3 rounded-xl border-2 p-3 text-left sm:grid-cols-1 sm:content-start sm:items-start ${
                way === w.value
                  ? 'border-royal bg-royal-pale'
                  : 'border-rule bg-white hover:border-royal'
              }`}
            >
              <span className="flex h-9 items-center text-royal">{w.art}</span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-ink">{w.label}</span>
                <span className="text-sm text-body">{w.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>
      <Card title="Payment plan">
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Payments" hint="1 to 24">
            <input
              className={field}
              type="number"
              onFocus={(e) => e.target.select()}
              min={1}
              max={24}
              value={installments}
              onChange={(e) =>
                changeCount(Math.min(24, Math.max(1, Math.round(Number(e.target.value) || 1))))
              }
            />
          </Field>
          <Field
            label={installments === 1 ? 'Due by' : 'First one due'}
            hint={installments === 1 ? 'The whole price' : 'Payment 1'}
          >
            <input
              className={field}
              type="date"
              value={first}
              onChange={(e) => changeEnds(e.target.value, last)}
            />
          </Field>
          {installments > 1 && (
            <Field label="Last one due" hint="Others are spaced evenly">
              <input
                className={field}
                type="date"
                value={last}
                onChange={(e) => changeEnds(first, e.target.value)}
              />
            </Field>
          )}
        </div>
        {first && last && installments > 1 && first > last && (
          <p role="alert" className="text-sm font-semibold text-[#B42318]">
            The last payment can’t be due before the first.
          </p>
        )}
        {way === 'deposit' && (
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            {firstPaymentCents !== null && (
              <Field label="Deposit" hint="The rest is split evenly">
                <Money
                  value={String(firstPaymentCents / 100)}
                  onChange={(v) => onFirstPayment(cents(v) || null)}
                />
                {firstPaymentCents > lowest && (
                  <span role="alert" className="font-semibold text-[#B42318]">
                    More than the {apart ? 'lowest ' : ''}price, {money(lowest)}.
                  </span>
                )}
              </Field>
            )}
            {firstPaymentCents !== null && (
              <label className="flex items-start gap-3 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={depositKept}
                  disabled={depositKeptLocked}
                  onChange={(e) => onDepositKept(e.target.checked)}
                  className="mt-0.5 h-5 w-5 accent-royal"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">The deposit is non-refundable</span>
                  <span className="text-muted">
                    {depositKeptLocked
                      ? 'Locked: guests have already signed these refund terms.'
                      : 'A guest who drops out after you accept them doesn’t get it back. This is the same as “Keep the deposit” in step 3’s refund terms.'}
                  </span>
                </span>
              </label>
            )}
          </div>
        )}

        {way === 'custom' && apart && rooms.length > 0 && (
          <Field
            as="div"
            label="Show dollars for"
            hint="Payments are a percentage of each room’s price"
          >
            <Dropdown
              label="Show dollars for"
              value={sample?.id ?? sample?.name ?? ''}
              options={rooms.map((r) => ({
                value: r.id ?? r.name,
                label: `${r.name || 'Room'}, ${money(roomPrice(r, costCents))}`,
              }))}
              onChange={setSampleId}
            />
          </Field>
        )}

        {costCents === 0 ? (
          <p className="rounded-xl bg-ground p-4 text-body">
            Set the price guests see in step 4, Pricing, to see the plan.
          </p>
        ) : (
          <ol className="flex flex-col">
            <li className="hidden grid-cols-2 gap-3 pb-2 text-sm font-semibold text-muted sm:grid">
              <span>Due by</span>
              <span className="text-right">Each guest pays</span>
            </li>
            {plan.map((c, k) => (
              <li
                key={k}
                className="grid grid-cols-2 items-center gap-x-3 gap-y-1 border-t border-rule py-2.5"
              >
                <span className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                  <span className="text-sm font-semibold">
                    Payment {k + 1} of {plan.length}
                  </span>
                  {dueDates.length === plan.length ? (
                    <input
                      className={field}
                      type="date"
                      aria-label={`Payment ${k + 1} due by`}
                      value={dueDates[k]}
                      onChange={(e) =>
                        e.target.value &&
                        onDueDates(dueDates.map((d, j) => (j === k ? e.target.value : d)))
                      }
                    />
                  ) : (
                    <span className="text-sm text-muted">No date yet</span>
                  )}
                  {k > 0 && dueDates[k] && dueDates[k] < dueDates[k - 1] && (
                    <span role="alert" className="text-sm font-semibold text-[#B42318]">
                      Before payment {k}’s date.
                    </span>
                  )}
                </span>
                <span className="font-semibold sm:text-right">
                  <span className="block text-sm font-normal text-muted sm:hidden">
                    Each guest pays
                  </span>
                  {shares && shares.length === plan.length ? (
                    <span className="flex flex-col items-start gap-1 sm:items-end">
                      {apart ? (
                        <>
                          <span className="flex w-32 items-stretch overflow-hidden rounded-[10px] border border-[#5B6B80] bg-white focus-within:ring-2 focus-within:ring-royal">
                            <input
                              className="min-w-0 flex-1 px-3 py-2.5 text-right text-base font-normal text-ink focus:outline-none"
                              inputMode="decimal"
                              aria-label={`Payment ${k + 1}, percent of the price`}
                              value={shares[k] ? String(shares[k] / 100) : ''}
                              onChange={(e) =>
                                onShares(
                                  shares.map((v, j) => (j === k ? hundredths(e.target.value) : v))
                                )
                              }
                            />
                            <span className="flex items-center bg-ground px-3 font-normal text-muted">
                              %
                            </span>
                          </span>
                          {sample && (
                            <span className="text-sm font-normal text-muted">
                              {money(samplePlan[k].amountCents)} for {sample.name || 'this room'}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="block w-36">
                          <Money
                            label={`Payment ${k + 1} amount`}
                            value={shares[k] ? String(shares[k] / 100) : ''}
                            onChange={(v) =>
                              onShares(shares.map((x, j) => (j === k ? cents(v) : x)))
                            }
                          />
                        </span>
                      )}
                    </span>
                  ) : apart ? (
                    prices.map((g) => (
                      <span key={g.price} className="block">
                        {money(g.plan[k].amountCents)}{' '}
                        <span className="text-sm font-normal text-muted">{g.rooms.join(', ')}</span>
                      </span>
                    ))
                  ) : (
                    money(c.amountCents)
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
        {shares && (
          <div className="flex flex-wrap items-center gap-3">
            {problem ? (
              <>
                <span role="alert" className="text-sm font-semibold text-[#B42318]">
                  {problem}
                </span>
                {lastRest > 0 && (
                  <button
                    type="button"
                    onClick={putRestLast}
                    className="inline-flex min-h-[44px] items-center rounded-xl border border-royal px-4 text-sm font-semibold text-royal hover:bg-royal-pale"
                  >
                    Make the last payment {apart ? `${lastRest / 100}%` : money(lastRest)}
                  </button>
                )}
              </>
            ) : (
              <span className="text-sm text-muted">
                {apart
                  ? 'Adds up to 100% of each room’s price.'
                  : `Adds up to the price, ${money(costCents)}.`}
              </span>
            )}
          </div>
        )}

        {startDate && dueDates.length > 0 && dueDates[dueDates.length - 1] > startDate && (
          <p className="rounded-xl bg-ground px-4 py-3 text-ink">
            The last payment falls after the trip starts. Try an earlier last due date.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field as="div" label="Email guests who still owe" hint="A reminder before each due date">
            <Dropdown
              label="Email guests who still owe"
              value={reminderDays}
              options={REMIND_OPTIONS}
              onChange={onReminderDays}
            />
          </Field>
        </div>
        {reminderDays !== null && dueDates.length === 0 && (
          <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
            Reminders go out once the payments have due dates.
          </p>
        )}
      </Card>
    </>
  )
}
