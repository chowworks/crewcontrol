// Trip Control's Actions rows for vendor payments (issue #116): each expense still owed that is due within a week, or
// overdue, with Mark paid. The organizers are emailed about them too (a week before and on the day).
import { vendorPaymentsDue, type Expense, type OrganizerTrip } from '@cc/types'
import { Receipt } from 'lucide-react'
import type { ReactNode } from 'react'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { money, shortDate } from '@/lib/format'
import { today } from '@/lib/payments'
import { IconCircle } from './TripGuests'

const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'

/** Where the vendor costs are on Trip Control, for Details. */
export const VENDOR_COSTS_ID = 'vendor-costs'

const input = (e: Expense, paidOn: string | null) => ({
  payee: e.payee,
  description: e.description,
  amountCents: e.amountCents,
  paidOn,
  dueOn: e.dueOn,
})

/**
 * The rows, for Actions. `onTrip` takes the trip as reloaded after a change, so the count and Vendor costs follow;
 * `onError` puts what went wrong on Trip Control's line (null clears it).
 */
export function useVendorDueRows(
  trip: OrganizerTrip | null,
  onTrip: (trip: OrganizerTrip) => void,
  setError: (message: string | null) => void
): { actionRows: ReactNode[] } {
  const toast = useToast()
  if (!trip) return { actionRows: [] }
  const tripId = trip.id

  async function change(e: Expense, paidOn: string | null): Promise<boolean> {
    setError(null)
    try {
      await api.updateExpense(tripId, e.id, input(e, paidOn))
      onTrip(await api.getTrip(tripId))
      // The red count in the account menu drops a payment just marked paid.
      window.dispatchEvent(new Event('cc:actions-changed'))
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save. Try again.')
      return false
    }
  }

  async function markPaid(e: Expense) {
    if (!(await change(e, today()))) return
    toast({
      text: `${e.payee}, ${money(e.amountCents)}, marked paid.`,
      action: { label: 'Undo', onClick: () => void change(e, null) },
    })
  }

  const now = today()
  const actionRows = vendorPaymentsDue(trip).map((e) => {
    const late = e.dueOn! < now
    return (
      <li
        key={`vendor-${e.id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0"
      >
        <div className="flex min-w-0 flex-[1_1_240px] items-start gap-3">
          <IconCircle icon={Receipt} />
          <div className="min-w-0">
            <div className="font-semibold [overflow-wrap:anywhere]">
              {e.payee}
              <span className="font-normal text-muted"> · Vendor payment</span>
            </div>
            <div className="text-sm text-body [overflow-wrap:anywhere]">
              {money(e.amountCents)}
              {e.description && ` for ${e.description}`}
              {', '}
              <span className={late ? 'font-semibold text-[#B42318]' : undefined}>
                {late
                  ? `overdue, was due ${shortDate(e.dueOn!)}`
                  : e.dueOn === now
                    ? 'due today'
                    : `due ${shortDate(e.dueOn!)}`}
              </span>
              .
            </div>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" className={filled} onClick={() => void markPaid(e)}>
            Mark paid
          </button>
          <button
            type="button"
            className={outlined}
            onClick={() =>
              document
                .getElementById(VENDOR_COSTS_ID)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          >
            Details
          </button>
        </div>
      </li>
    )
  })
  return { actionRows }
}
