import { Prisma } from '@prisma/client'

/**
 * The tables that carry row-level security (the ones with a `tenant_read` policy, see
 * prisma/migrations/20261021050000_trip_rls). A spec keeps this list equal to the database. A query that cannot
 * reach any of them skips the per-query transaction that sets the tenant context. Today that is every table (the
 * Terms acceptances hold no trip data, but their policy needs the caller's id); the list exists so a table without
 * either can be added without that cost.
 */
export const TENANT_TABLES: ReadonlySet<string> = new Set([
  'Trip',
  'TripMember',
  'TripInvite',
  'Guest',
  'Room',
  'AccessLog',
  'AgreementSignature',
  'GuestEvent',
  'TripLog',
  'Payment',
  'Expense',
  'BalanceAdjustment',
  'ReminderSend',
  'Announcement',
  'AnnouncementRecipient',
  'AnnouncementReply',
  'TermsAcceptance',
  // Not trip data: one row of system settings, read by all and changed by the admin, so its writes carry the admin mark.
  'SystemSettings',
  // Not trip data: organizers' requests, read by the admin only.
  'OrganizerRequest',
  // Not trip data: the admin's versions of the emails, read by all and written by the admin.
  'EmailTemplate',
  // Not trip data: bounce and spam-complaint notices from Resend, read by the admin only.
  'EmailProblem',
  'ForwardedReceipt',
  'PayerAddress',
  // Not trip data: every receipts address used, read by the admin and trusted work only.
  'ReceiptsAddress',
])

type Fields = Map<string, string> // relation field name -> the model it points at
const relations = new Map<string, Fields>()
for (const m of Prisma.dmmf.datamodel.models) {
  relations.set(
    m.name,
    new Map(m.fields.filter((f) => f.kind === 'object').map((f) => [f.name, f.type]))
  )
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)

/**
 * Whether a query on `model` with these arguments can read or write a tenant table: the model itself is one, or a
 * relation followed anywhere in its select, include, where or nested writes leads to one. When in doubt (an unknown
 * model) it says yes, which only costs speed.
 */
export function touchesTenantTable(model: string, args: unknown): boolean {
  if (TENANT_TABLES.has(model)) return true
  const fields = relations.get(model)
  if (!fields) return true
  const walk = (node: unknown, current: string): boolean => {
    if (Array.isArray(node)) return node.some((n) => walk(n, current))
    if (!isPlain(node)) return false
    const own = relations.get(current)
    for (const [key, value] of Object.entries(node)) {
      const target = own?.get(key)
      if (target) {
        if (TENANT_TABLES.has(target) || walk(value, target)) return true
      } else if (walk(value, current)) {
        return true
      }
    }
    return false
  }
  return walk(args, model)
}
