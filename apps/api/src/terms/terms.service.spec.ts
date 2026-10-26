import type { PrismaService } from '../prisma/prisma.service'
import { TermsService } from './terms.service'

// A stand-in database: acceptances that committed, and a count of the reads.
function fakeDb(committed: { userId: string; kind: string; fingerprint: string }[]) {
  const db = {
    reads: 0,
    termsAcceptance: {
      findFirst: async ({
        where,
      }: {
        where: { userId: string; kind: string; fingerprint: string }
      }) => {
        db.reads++
        return committed.some(
          (r) =>
            r.userId === where.userId &&
            r.kind === where.kind &&
            r.fingerprint === where.fingerprint
        )
          ? { id: 'x' }
          : null
      },
      createMany: async () => ({ count: 1 }),
    },
  }
  return db
}

describe('TermsService', () => {
  it('does not count an acceptance whose transaction rolled back', async () => {
    const db = fakeDb([])
    const terms = new TermsService(db as unknown as PrismaService)
    // The join step writes the acceptance, then the guest row fails and the transaction rolls back.
    await terms.record(db as never, 'g1', ['use'], { ip: '', userAgent: '' })
    expect(await terms.hasAccepted('g1', 'use')).toBe(false)
  })

  it('remembers a committed acceptance without reading again', async () => {
    const db = fakeDb([])
    const terms = new TermsService(db as unknown as PrismaService)
    terms.remember('g1', ['use'])
    expect(await terms.hasAccepted('g1', 'use')).toBe(true)
    expect(await terms.hasAccepted('g1', 'organizer')).toBe(false)
    expect(db.reads).toBe(1)
  })
})
