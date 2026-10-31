import type { TermsDocument } from '@cc/types'

/**
 * One of Travel HQ's Terms documents: its title and numbered sections, as the /terms page and Terms screen show them.
 * The Organizer Terms end with the trip agreement guests sign (an "Addendum:" section, then one "Agreement: …" section
 * per part of it); that is a contract between guest and organizer, so it shows as its own part under a divider. It
 * stays inside the Organizer Terms' wording, so a change to the agreement still asks organizers to accept again.
 */
export function TermsText({ doc, level = 2 }: { doc: TermsDocument; level?: 2 | 3 }) {
  const Title = level === 2 ? 'h2' : 'h3'
  const Heading = level === 2 ? 'h3' : 'h4'
  const split = doc.sections.findIndex((s) => s.heading.startsWith('Addendum:'))
  const terms = split === -1 ? doc.sections : doc.sections.slice(0, split)
  const addendum = split === -1 ? null : doc.sections[split]
  const agreement = split === -1 ? [] : doc.sections.slice(split + 1)
  return (
    <section className="flex flex-col gap-3">
      <Title className="text-xl font-extrabold text-ink">{doc.title}</Title>
      {terms.map((s) => (
        <div key={s.heading} className="flex flex-col gap-1">
          <Heading className="font-bold text-ink">{s.heading}</Heading>
          <p className="whitespace-pre-line text-body">{s.body}</p>
        </div>
      ))}
      {addendum && (
        <div id="agreement" className="mt-4 flex flex-col gap-3 border-t border-rule pt-6">
          <Title className="text-xl font-extrabold text-ink">
            {addendum.heading.replace(/^Addendum:\s*/, '').replace(/^./, (c) => c.toUpperCase())}
          </Title>
          <p className="whitespace-pre-line text-body">{addendum.body}</p>
          {agreement.map((s) => (
            <div key={s.heading} className="flex flex-col gap-1">
              <Heading className="font-bold text-ink">
                {s.heading.replace(/^Agreement:\s*/, '').replace(/^./, (c) => c.toUpperCase())}
              </Heading>
              <p className="whitespace-pre-line text-body">{s.body}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
