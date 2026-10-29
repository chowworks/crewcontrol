import type { ClerkService } from '../auth/clerk.service'
import type { EmailsService } from '../messaging/emails.service'
import type { PrismaService } from '../prisma/prisma.service'
import { PeopleService } from './people.service'

// Adding someone on a trip's People screen emails them (issue #12): a link to the Control panel when they have an
// account, to sign-up when they're invited, and nothing on Undo or when an admin seats themselves.
const owner = { userId: 'u1', isAdmin: false }

function setup(existing: string | null) {
  const trip = {
    name: 'Aruba Crew Getaway 2028',
    isSample: false,
    destination: 'Aruba',
    startDate: '2028-03-03',
    endDate: '2028-03-08',
    members: [{ userId: 'u1', role: 'owner' }],
    invites: [] as { email: string; role: string }[],
  }
  const prisma = {
    trip: { findFirst: jest.fn(async () => trip) },
    tripMember: { create: jest.fn(async () => ({})) },
    tripInvite: { create: jest.fn(async () => ({})) },
  }
  const clerk = {
    userIdByEmail: jest.fn(async () => existing),
    contact: jest.fn(async () => ({ name: 'Nia Brooks', email: 'nia@example.com' })),
    people: jest.fn(async () => new Map()),
  }
  const emails = { sendInvite: jest.fn(async () => undefined) }
  const service = new PeopleService(
    prisma as unknown as PrismaService,
    clerk as unknown as ClerkService,
    emails as unknown as EmailsService
  )
  return { service, emails }
}

beforeEach(() => {
  process.env.FRONTEND_URL = 'https://travel-hq.app'
})

it('emails someone with an account a link to the Control panel, replying to whoever added them', async () => {
  const { service, emails } = setup('u2')
  await service.add('t1', { email: 'dana@example.com', role: 'organizer' }, owner, false)
  expect(emails.sendInvite).toHaveBeenCalledWith(
    expect.objectContaining({
      tripName: 'Aruba Crew Getaway 2028',
      dates: 'Mar 3 – 8, 2028',
      inviterName: 'Nia Brooks',
      isOwner: false,
      email: 'dana@example.com',
      signedUp: true,
      link: 'https://travel-hq.app/organize/t1/control',
    }),
    'nia@example.com'
  )
})

it('emails someone without an account a link to sign up', async () => {
  const { service, emails } = setup(null)
  await service.add('t1', { email: 'dana@example.com', role: 'owner' }, owner, false)
  expect(emails.sendInvite).toHaveBeenCalledWith(
    expect.objectContaining({
      isOwner: true,
      signedUp: false,
      link: 'https://travel-hq.app/sign-up',
    }),
    'nia@example.com'
  )
})

it('sends nothing on Undo, or when an admin seats themselves', async () => {
  const undo = setup('u2')
  await undo.service.add(
    't1',
    { email: 'dana@example.com', role: 'organizer', notify: false },
    owner,
    false
  )
  expect(undo.emails.sendInvite).not.toHaveBeenCalled()
  const self = setup('a1')
  await self.service.add(
    't1',
    { email: 'admin@example.com', role: 'organizer' },
    { userId: 'a1', isAdmin: true },
    true
  )
  expect(self.emails.sendInvite).not.toHaveBeenCalled()
})
