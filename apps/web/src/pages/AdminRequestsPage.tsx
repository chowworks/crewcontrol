import type { OrganizerRequest } from '@cc/types'
import { ArrowDown, ArrowUp, Download, FileText, Search, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Dropdown } from '@/components/Dropdown'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { downloadCsv } from '@/lib/csv'
import { AdminHow, AdminSection, AdminShell, AdminToolHead } from './AdminPage'
import { HelpAnswersSection, HelpQuestionsSection } from './AdminHelpSections'

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** A grid column: its heading, what it sorts, searches and exports by, and how a cell shows (the text, unless given). */
interface Column {
  key: string
  label: string
  value: (r: OrganizerRequest) => string
  cell?: (r: OrganizerRequest) => ReactNode
  className?: string
}

const date: Column = {
  key: 'date',
  label: 'Date',
  value: (r) => r.createdAt,
  cell: (r) => when(r.createdAt),
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

  const early = (requests ?? []).filter((r) => r.kind === 'early_access')
  const refunds = (requests ?? []).filter((r) => r.kind === 'refund_terms')

  return (
    <AdminShell>
      <AdminToolHead to="/admin/requests" />
      {error && (
        <p role="alert" className="mb-4 font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {requests && (
        <div className="flex flex-col gap-6">
          <HelpQuestionsSection />
          <AdminSection
            icon={UserPlus}
            title="Early access"
            steps={[
              'People who asked to start trips on the limited preview page, and friends invited by someone who runs a trip (Invited by).',
              'Approve someone and they can start trips as soon as they sign in with that email. Undo approval takes it back.',
              'Each new one is emailed to support as it arrives.',
            ]}
          >
            <Grid
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
            icon={FileText}
            title="Refund terms"
            steps={[
              'Organizers suggest these from the trip editor (Suggest other refund terms) when the presets don’t fit their trip.',
              'Nothing to approve: read them to decide which presets to add next.',
            ]}
          >
            <Grid
              rows={refunds}
              total={refunds.length}
              columns={refundColumns}
              exportName="refund-terms-requests"
              exportLabel="Refund Terms Requests"
              empty="No refund terms suggested yet."
            />
          </AdminSection>
          <HelpAnswersSection />
        </div>
      )}
      <AdminHow to="/admin/requests" />
    </AdminShell>
  )
}

/** One section's grid: search, an optional filter, sortable columns and Export (what's shown, as a spreadsheet). */
function Grid({
  rows,
  total,
  columns,
  exportName,
  exportLabel,
  empty,
  filter,
}: {
  rows: OrganizerRequest[]
  total: number
  columns: Column[]
  exportName: string
  exportLabel: string
  empty: string
  filter?: ReactNode
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'date', asc: false })
  const toast = useToast()

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase()
    const column = columns.find((c) => c.key === sort.key) ?? columns[0]
    return rows
      .filter(
        (r) =>
          !words ||
          columns.some((c) => c.key !== 'date' && c.value(r).toLowerCase().includes(words))
      )
      .sort((a, b) => column.value(a).localeCompare(column.value(b)) * (sort.asc ? 1 : -1))
  }, [rows, columns, query, sort])

  function exportRows() {
    downloadCsv(exportName, [
      columns.map((c) => c.label),
      ...shown.map((r) => columns.map((c) => (c.key === 'date' ? when(r.createdAt) : c.value(r)))),
    ])
    toast({ text: `Downloaded ${exportLabel}.` })
  }

  const sortBy = (key: string) =>
    setSort((s) => ({ key, asc: s.key === key ? !s.asc : key !== 'date' }))

  if (total === 0) return <p className="text-body">{empty}</p>

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="sr-only">Search</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="min-h-[44px] w-full rounded-[10px] border border-[#5B6B80] bg-white pl-10 pr-3.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal"
          />
        </label>
        {filter}
        <button
          type="button"
          onClick={exportRows}
          disabled={shown.length === 0}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 border-royal px-4 font-semibold text-royal hover:bg-royal-pale disabled:opacity-60"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export
        </button>
      </div>
      <p className="text-sm text-muted">
        {shown.length} of {total}
      </p>
      {/* Scrolls sideways inside its box on a phone, never the page. */}
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-rule">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    sort.key === c.key ? (sort.asc ? 'ascending' : 'descending') : undefined
                  }
                  className="px-3 py-2 font-semibold first:pl-4 sm:first:pl-3"
                >
                  <button
                    type="button"
                    onClick={() => sortBy(c.key)}
                    className="inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap hover:text-royal"
                  >
                    {c.label}
                    {sort.key === c.key &&
                      (sort.asc ? (
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      ))}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-rule align-top last:border-b-0">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-3 first:pl-4 sm:first:pl-3 ${c.className ?? ''}`}
                  >
                    {c.cell ? c.cell(r) : c.value(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="px-4 py-6 text-body sm:px-3">
            Nothing matches. Clear the search or the filter.
          </p>
        )}
      </div>
    </>
  )
}
