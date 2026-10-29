import type { TermsDocument } from '@cc/types'

/** One of Travel HQ's Terms documents: its title and numbered sections, as the /terms page and Terms screen show them. */
export function TermsText({ doc, level = 2 }: { doc: TermsDocument; level?: 2 | 3 }) {
  const Title = level === 2 ? 'h2' : 'h3'
  const Heading = level === 2 ? 'h3' : 'h4'
  return (
    <section className="flex flex-col gap-3">
      <Title className="text-xl font-extrabold text-ink">{doc.title}</Title>
      {doc.sections.map((s) => (
        <div key={s.heading} className="flex flex-col gap-1">
          <Heading className="font-bold text-ink">{s.heading}</Heading>
          <p className="whitespace-pre-line text-body">{s.body}</p>
        </div>
      ))}
    </section>
  )
}
