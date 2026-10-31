import type { ClerkService } from '../auth/clerk.service'
import type { EmailsService } from '../messaging/emails.service'
import type { PrismaService } from '../prisma/prisma.service'
import type { AlertItem } from './alert-items'
import { AlertsService } from './alerts.service'

// The trip's Actions are given here as they are; alert-items.spec checks which Actions count.
jest.mock('../trips/trip-mapper', () => ({ toOrganizerTrip: (row: unknown) => row }))
jest.mock('./alert-items', () => ({
  ...jest.requireActual('./alert-items'),
  alertItems: (trip: { items: AlertItem[] }) => trip.items,
}))

type Row = { id: string; name: string; members: { userId: string }[]; items: AlertItem[] }
const HOUR = 60 * 60 * 1000
const t0 = new Date('2026-11-01T12:00:00Z')
const later = (hours: number) => new Date(t0.getTime() + hours * HOUR)
const pay = (key: string): AlertItem => ({ key, kind: 'payment' })

function setup(trips: Row[]) {
  let alerts: { id: string; userId: string; tripId: string; key: string; alertedAt: Date }[] = []
  let sends: { kind: string; toAddress: string; sentAt: Date }[] = []
  let n = 0
  let clock = t0
  const prisma = {
    emailSend: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      findFirst: async ({ where }: { where: { toAddress: string; sentAt: { gt: Date } } }) =>
        sends.find((s) => s.toAddress === where.toAddress && s.sentAt > where.sentAt.gt) ?? null,
    },
    systemSettings: {
      findUnique: async () => ({ waitlistBufferPercent: 10, alertWindowHours: 4 }),
    },
    trip: { findMany: async () => trips },
    actionAlert: {
      findMany: async () => alerts,
      deleteMany: async ({
        where,
      }: {
        where: { id?: { in: string[] }; userId?: string; alertedAt?: Date }
      }) => {
        alerts = alerts.filter((a) =>
          where.id
            ? !where.id.in.includes(a.id)
            : !(a.userId === where.userId && a.alertedAt === where.alertedAt)
        )
        return { count: 0 }
      },
      createMany: async ({ data }: { data: Omit<(typeof alerts)[number], 'id'>[] }) => {
        const fresh = data.filter(
          (d) =>
            !alerts.some((a) => a.userId === d.userId && a.tripId === d.tripId && a.key === d.key)
        )
        alerts.push(...fresh.map((d) => ({ ...d, id: `a${++n}` })))
        return { count: fresh.length }
      },
    },
  }
  const clerk = {
    people: async (ids: string[]) =>
      new Map(ids.map((id) => [id, { name: `${id} Organizer`, email: `${id}@travel-hq.app` }])),
  }
  const ok = { value: true }
  const sendAlert = jest.fn(async (_alert: unknown, to: string) => {
    sends.push({ kind: 'organizer_actions', toAddress: to, sentAt: clock })
    return ok.value
  })
  const service = new AlertsService(
    prisma as unknown as PrismaService,
    clerk as unknown as ClerkService,
    { sendAlert } as unknown as EmailsService
  )
  const run = (at: Date) => {
    clock = at
    return service.run(at)
  }
  return { run, sendAlert, ok, sent: () => sends.length, reset: () => (sends = []) }
}

describe('organizer alerts', () => {
  it('emails the first new action at once, then waits out the window and sends what came up meanwhile together', async () => {
    const trip: Row = { id: 'T1', name: 'Aruba', members: [{ userId: 'nia' }], items: [pay('p1')] }
    const { run, sendAlert } = setup([trip])

    expect(await run(t0)).toBe(1)
    expect(sendAlert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        firstName: 'nia',
        count: 1,
        single: true,
        trips: [expect.objectContaining({ name: 'Aruba', summary: '1 payment to confirm.' })],
        windowHours: 4,
      }),
      'nia@travel-hq.app'
    )

    // Nothing new: nothing sent.
    expect(await run(later(1))).toBe(0)
    // Two more payments an hour later wait for the window.
    trip.items = [pay('p1'), pay('p2'), pay('p3')]
    expect(await run(later(2))).toBe(0)
    // After it, one email with only the new ones.
    expect(await run(later(4.1))).toBe(1)
    expect(sendAlert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        count: 2,
        trips: [expect.objectContaining({ summary: '2 payments to confirm.' })],
      }),
      'nia@travel-hq.app'
    )
    expect(sendAlert).toHaveBeenCalledTimes(2)
  })

  it('names an action again only if it was done and came back', async () => {
    const trip: Row = { id: 'T1', name: 'Aruba', members: [{ userId: 'nia' }], items: [pay('p1')] }
    const { run, sendAlert } = setup([trip])
    await run(t0)
    trip.items = []
    await run(later(5))
    trip.items = [pay('p1')]
    expect(await run(later(10))).toBe(1)
    expect(sendAlert).toHaveBeenCalledTimes(2)
  })

  it('sends each person one email for all their trips, and each of a trip’s organizers their own', async () => {
    const { run, sendAlert } = setup([
      {
        id: 'T1',
        name: 'Aruba',
        members: [{ userId: 'nia' }, { userId: 'kai' }],
        items: [pay('p1')],
      },
      {
        id: 'T2',
        name: 'Tulum',
        members: [{ userId: 'nia' }],
        items: [{ key: 'g-accept', kind: 'accept' }],
      },
    ])
    expect(await run(t0)).toBe(2)
    const nia = sendAlert.mock.calls.find((c) => c[1] === 'nia@travel-hq.app')![0]
    expect(nia).toEqual(
      expect.objectContaining({
        count: 2,
        single: false,
        trips: [
          expect.objectContaining({ name: 'Aruba', summary: '1 payment to confirm.' }),
          expect.objectContaining({ name: 'Tulum', summary: '1 guest to accept.' }),
        ],
      })
    )
  })

  it('names them again after the window when the email could not be sent', async () => {
    const trip: Row = { id: 'T1', name: 'Aruba', members: [{ userId: 'nia' }], items: [pay('p1')] }
    const { run, sendAlert, ok } = setup([trip])
    ok.value = false
    await run(t0)
    ok.value = true
    expect(await run(later(1))).toBe(0)
    expect(await run(later(4.1))).toBe(1)
    expect(sendAlert).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 1 }),
      'nia@travel-hq.app'
    )
  })
})
