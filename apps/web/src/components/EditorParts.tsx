import type { ReactNode } from 'react'

/** The cards, fields and money inputs the trip editor's steps share. */
export const field =
  'w-full rounded-[10px] border border-[#5B6B80] bg-white px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
  as: Tag = 'label',
}: {
  label: string
  /** A short line under the label; give every field in a row one, so their boxes line up. */
  hint?: string
  children: ReactNode
  /** 'div' around a control that is a button (a Dropdown), which a label would click again. */
  as?: 'label' | 'div'
}) {
  return (
    <Tag className="flex flex-col gap-1.5 text-sm font-semibold">
      <span>
        {label}
        {hint && <span className="block font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </Tag>
  )
}

export function Money({
  value,
  onChange,
  placeholder = '0',
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** For a box with no label around it. */
  label?: string
}) {
  return (
    <span className="flex items-stretch overflow-hidden rounded-[10px] border border-[#5B6B80] bg-white focus-within:ring-2 focus-within:ring-royal">
      <span className="flex items-center bg-ground px-3 font-normal text-muted">$</span>
      <input
        className="min-w-0 flex-1 px-3 py-2.5 text-base font-normal text-ink focus:outline-none"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </span>
  )
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-2xl font-extrabold">{value}</dd>
      {note && <dd className="text-sm text-muted">{note}</dd>}
    </div>
  )
}
