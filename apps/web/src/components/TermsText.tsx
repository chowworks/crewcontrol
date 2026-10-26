import type { TermsDocument } from '@cc/types'

/** One of CrewControl's Terms documents: its title and numbered sections, as the /terms page and Terms screen show them. */
export function TermsText({ doc, level = 2 }: { doc: TermsDocument; level?: 2 | 3 }) {
  const Title = level === 2 ? 'h2' : 'h3'
  return (
    <section className="flex flex-col gap-3">
      <Title className="text-xl font-extrabold text-ink">{doc.title}</Title>
      {doc.sections.map((s) => (
        <div key={s.heading} className="flex flex-col gap-1">
          <h4 className="font-bold text-ink">{s.heading}</h4>
          <p className="text-body">{s.body}</p>
        </div>
      ))}
    </section>
  )
}
