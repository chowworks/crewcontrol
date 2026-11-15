import { PAID_FEATURES, type OrganizerRequest } from '@cc/types'
import { FileText, Gem, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AdminGrid, type GridColumn } from '@/components/AdminGrid'
import { Dropdown } from '@/components/Dropdown'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { AdminHow, AdminSection, AdminShell, AdminToolHead } from './AdminPage'
import { HelpAnswersSection, HelpQuestionsSection, useAdminHelp } from './AdminHelpSections'

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

type Column = GridColumn<OrganizerRequest>

const date: Column = {
  key: 'date',
  label: 'Date',
  value: (r) => r.createdAt,
  cell: (r) => when(r.createdAt),
  exportValue: (r) => when(r.createdAt),
  className: 'whitespace-nowrap text-muted',
}
const name: Column = {
  key: 'name',
  label: 'Name',
  value: (r) => r.userName,
  className: 'font-semibold',
}
const email: Column = { key: 'email', label: 'Email', value: (r) => r.userEmail }
const note = (label: string): Column => ({
  key: 'text',
  label,
  value: (r) => r.text,
  className: 'max-w-[320px] whitespace-pre-line text-body',
})

type Show = 'all' | 'referred' | 'self' | 'waiting' | 'approved'
const SHOWS: { value: Show; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'referred', label: 'Invited by a friend' },
  { value: 'self', label: 'Signed up themselves' },
  { value: 'waiting', label: 'Not approved yet' },
  { value: 'approved', label: 'Approved' },
]
const shows: Record<Show, (r: OrganizerRequest) => boolean> = {
  all: () => true,
  referred: (r) => Boolean(r.referredBy),
  self: (r) => !r.referredBy,
  waiting: (r) => !r.approved,
  approved: (r) => r.approved,
}

/**
 * Requests: organizers' questions from the Help button first (they wait on an answer), then what people asked for that
 * Travel HQ doesn't do yet, one section each with its own grid to search, sort and export, then the help answers. Early access, asked for or invited by a friend who runs a trip, is approved here: whoever signs in with that
 * email may then start trips (issue #39). Refund terms are organizers' suggestions, to read.
 */
export function AdminRequestsPage() {
  const [requests, setRequests] = useState<OrganizerRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<Show>('all')
  const toast = useToast()
  const help = useAdminHelp()

  useEffect(() => {
    api
      .adminRequests()
      .then(setRequests)
      .catch(() => setError('The requests could not be loaded.'))
  }, [])

  async function approve(r: OrganizerRequest, approved: boolean, undo = true) {
    setError(null)
    try {
      await api.approveEarlyAccess(r.id, approved)
      setRequests((list) => list?.map((x) => (x.id === r.id ? { ...x, approved } : x)) ?? null)
      toast({
        text: approved
          ? `Approved ${r.userName}. They can start trips now.`
          : `${r.userName} is no longer approved.`,
        ...(undo && { action: { label: 'Undo', onClick: () => approve(r, !approved, false) } }),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save. Try again.')
    }
  }

  const earlyColumns: Column[] = [
    date,
    name,
    email,
    {
      key: 'referredBy',
      label: 'Invited by',
      value: (r) => r.referredBy || 'Signed up themselves',
      cell: (r) => r.referredBy || <span className="text-muted">Signed up themselves</span>,
    },
    note('Their note'),
    {
      key: 'status',
      label: 'Status',
      value: (r) => (r.approved ? 'Approved' : 'Not approved'),
      cell: (r) =>
        r.approved ? (
          <div className="flex flex-col items-start gap-2">
            <span className="whitespace-nowrap rounded-full bg-royal-pale px-3 py-1 font-semibold text-royal">
              Approved
            </span>
            <button
              type="button"
              onClick={() => approve(r, false)}
              className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-xl border-2 border-royal px-3 font-semibold text-royal hover:bg-royal-pale"
            >
              Undo approval
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => approve(r, true)}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-royal px-4 font-semibold text-white hover:bg-royal-dark"
          >
            Approve
          </button>
        ),
    },
  ]
  const refundColumns: Column[] = [
    date,
    name,
    email,
    { key: 'trip', label: 'Trip', value: (r) => r.tripName },
    note('Terms they asked for'),
  ]

  const featureColumns: Column[] = [
    date,
    name,
    email,
    {
      key: 'feature',
      label: 'Feature',
      value: (r) => PAID_FEATURES.find((f) => f.key === r.feature)?.title ?? r.feature,
      className: 'font-semibold',
    },
    note('How they’d use it'),
  ]

  const early = (requests ?? []).filter((r) => r.kind === 'early_access')
  const featureAsks = (requests ?? []).filter((r) => r.kind === 'feature_access')
  const refunds = (requests ?? []).filter((r) => r.kind === 'refund_terms')

  return (
    <AdminShell>
      <AdminToolHead to="/admin/requests" />
      {error && (
        <p role="alert" className="mb-4 font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {/* The help sections load on their own, so organizers' questions show even if the requests don't. */}
      <div className="flex flex-col gap-6">
        <HelpQuestionsSection help={help} />
        {requests && (
          <>
            <AdminSection
              icon={UserPlus}
              title="Early access"
              steps={[
                'People who asked to start trips on the limited preview page, and friends invited by someone who runs a trip (Invited by).',
                'Approve someone and they can start trips as soon as they sign in with that email. Undo approval takes it back.',
                'Each new one is emailed to support as it arrives.',
              ]}
            >
              <AdminGrid
                rows={early.filter(shows[show])}
                total={early.length}
                columns={earlyColumns}
                exportName="early-access"
                exportLabel="Early Access"
                empty="Nobody has asked for early access yet."
                filter={
                  <Dropdown
                    label="Show"
                    value={show}
                    options={SHOWS}
                    onChange={setShow}
                    className="w-full sm:w-56"
                  />
                }
              />
            </AdminSection>
            <AdminSection
              icon={Gem}
              title="Paid features"
              steps={[
                'Organizers ask to try a paid feature early from Paid features, in the Help. Each one is emailed to support as it arrives; replying answers them.',
                'To give it to them, add their email in Manage Memberships and tick the feature.',
              ]}
            >
              <AdminGrid
                rows={featureAsks}
                total={featureAsks.length}
                columns={featureColumns}
                exportName="paid-feature-requests"
                exportLabel="Paid Feature Requests"
                empty="Nobody has asked for a paid feature yet."
              />
            </AdminSection>
            <AdminSection
              icon={FileText}
              title="Refund terms"
              steps={[
                'Organizers suggest these from the trip editor (Suggest other refund terms) when the presets don’t fit their trip.',
                'Nothing to approve: read them to decide which presets to add next.',
              ]}
            >
              <AdminGrid
                rows={refunds}
                total={refunds.length}
                columns={refundColumns}
                exportName="refund-terms-requests"
                exportLabel="Refund Terms Requests"
                empty="No refund terms suggested yet."
              />
            </AdminSection>
          </>
        )}
        <HelpAnswersSection help={help} />
      </div>
      <AdminHow to="/admin/requests" />
    </AdminShell>
  )
}
