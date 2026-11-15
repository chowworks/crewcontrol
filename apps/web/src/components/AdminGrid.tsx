import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useToast } from './Toast'
import { downloadCsv } from '@/lib/csv'

/**
 * An Admin toolbox list (CLAUDE.md "Admin lists"): search, an optional filter, sortable columns and Export (what's
 * shown, as a spreadsheet). Shared by Review Customer Requests and Manage Memberships.
 */

/** A grid column: its heading, what it sorts, searches and exports by, and how a cell shows (the text, unless given). */
export interface GridColumn<T> {
  key: string
  label: string
  value: (r: T) => string
  cell?: (r: T) => ReactNode
  /** What Export writes, when not the sort value (a readable date). */
  exportValue?: (r: T) => string
  /** What search looks in, when not the sort value (what the cell shows). */
  searchValue?: (r: T) => string
  /** A column of buttons: no sorting, no search, left out of Export; `label` is read out only. */
  actions?: boolean
  className?: string
}

/** One section's grid: search, an optional filter, sortable columns and Export (what's shown, as a spreadsheet). */
export function AdminGrid<T extends { id: string }>({
  rows,
  total,
  columns,
  exportName,
  exportLabel,
  empty,
  filter,
  sortFirst = 'date',
}: {
  rows: T[]
  total: number
  columns: GridColumn<T>[]
  exportName: string
  exportLabel: string
  empty: string
  filter?: ReactNode
  /** The column sorted by at first, newest or last first. */
  sortFirst?: string
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: sortFirst, asc: false })
  const toast = useToast()

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase()
    const column = columns.find((c) => c.key === sort.key) ?? columns[0]
    return rows
      .filter(
        (r) =>
          !words ||
          columns.some(
            (c) =>
              c.key !== sortFirst &&
              !c.actions &&
              (c.searchValue ?? c.value)(r).toLowerCase().includes(words)
          )
      )
      .sort((a, b) => column.value(a).localeCompare(column.value(b)) * (sort.asc ? 1 : -1))
  }, [rows, columns, query, sort, sortFirst])

  const exported = columns.filter((c) => !c.actions)

  function exportRows() {
    downloadCsv(exportName, [
      exported.map((c) => c.label),
      ...shown.map((r) => exported.map((c) => (c.exportValue ?? c.value)(r))),
    ])
    toast({ text: `Downloaded ${exportLabel}.` })
  }

  const sortBy = (key: string) =>
    setSort((s) => ({ key, asc: s.key === key ? !s.asc : key !== sortFirst }))

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
                  {c.actions ? (
                    <span className="sr-only">{c.label}</span>
                  ) : (
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
                  )}
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
