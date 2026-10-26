// Three demo trips: a house trip, a resort vacation, and a villa trip with real photos, so the trip page is seen working for each kind.
// Every person here is made up. Run with `npm run db:seed --workspace @cc/api`; it replaces the demo trips.
// The seed writes as the database owner (SCHEMA_DATABASE_URL), which row-level security does not bind.
import '../scripts/lib/owner-env'
import { PrismaClient, type Prisma } from '@prisma/client'
import {
  agreementPreview,
  firstInstallmentCents,
  refundTerms,
  TEMPLATE_VERSION,
} from '../src/join/agreement'
import {
  paymentMethodLabel,
  type PaymentMethod,
  type TripHighlight,
  type TripKeyDate,
  type TripPhoto,
} from '../src/trips/trip-types'

const prisma = new PrismaClient()

type Seed = Omit<
  Prisma.TripCreateInput,
  'photos' | 'highlights' | 'keyDates' | 'guests' | 'paymentMethods'
> & {
  paymentMethods: PaymentMethod[]
  photos: TripPhoto[]
  highlights: TripHighlight[]
  keyDates: TripKeyDate[]
  approved: [string, string][]
  interested: [string, string][]
}

const trips: Seed[] = [
  {
    slug: 'mv-beach-house-2027',
    name: 'MV Beach House 2027',
    destination: "Martha's Vineyard, MA",
    startDate: '2027-06-18',
    endDate: '2027-06-21',
    organizerName: 'Chris',
    description:
      'A long weekend at a beach house on the Vineyard. We take the ferry over from Woods Hole, spend the days on the sand, and close it out with a chef dinner Saturday night.',
    costPerPersonCents: 120000,
    installmentCount: 4,
    galleryTitle: 'The house',
    showGuestNames: true,
    paymentMethods: [
      { kind: 'zelle', label: '', handle: '(555) 010-0142' },
      { kind: 'cashapp', label: '', handle: '$ChrisMV2027' },
      { kind: 'custom', label: 'Pay in person', handle: 'Cash at the Woods Hole ferry' },
    ],
    paymentInstructions: "Include your name and 'MV2027' in the memo.",
    published: true,
    joinMode: 'accept_first',
    isSample: true,
    photos: [
      { url: '/seed/mv-front.svg', caption: 'Front of the house' },
      { url: '/seed/mv-deck.svg', caption: 'Deck and ocean view' },
      { url: '/seed/mv-kitchen.svg', caption: 'Kitchen' },
      { url: '/seed/mv-bedrooms.svg', caption: 'Bedrooms' },
      { url: '/seed/mv-beach.svg', caption: 'Path to the beach' },
    ],
    highlights: [
      { icon: 'home', title: 'Beach house', detail: "Sleeps 10, five minutes' walk to the beach" },
      {
        icon: 'ferry',
        title: 'Ferry from Woods Hole',
        detail: "Tickets open March 1. You'll get a reminder.",
      },
      { icon: 'food', title: 'Chef dinner', detail: 'Saturday night, dietary needs covered' },
    ],
    keyDates: [
      {
        date: '2026-11-01',
        label: 'First $300 installment due once you’re accepted',
      },
      { date: '2027-03-01', label: 'Ferry tickets open' },
      { date: '2027-05-01', label: 'Final payment due' },
      { date: '2027-06-18', label: 'Arrive. Rental car pickup at the ferry terminal, 3:00 PM' },
    ],
    approved: [
      ['Jordan', 'Price'],
      ['Avery', 'Lane'],
      ['Marcus', 'Bell'],
      ['Dana', 'Whitfield'],
      ['Keisha', 'Ray'],
      ['Andre', 'Cole'],
      ['Simone', 'Tate'],
      ['Brianna', 'Moss'],
    ],
    interested: [
      ['Deja', 'Brooks'],
      ['Terrell', 'Greene'],
      ['Alicia', 'Fontaine'],
    ],
  },
  {
    slug: 'aruba-2028',
    name: 'Aruba Crew Getaway 2028',
    destination: 'Palm Beach, Aruba',
    startDate: '2028-04-13',
    endDate: '2028-04-18',
    organizerName: 'Nia',
    description:
      'Five nights at an all-inclusive resort on Palm Beach. Days are yours: pool, beach, or the catamaran. We come together for a welcome dinner the first night and a sunset sail mid-week.',
    costPerPersonCents: 240000,
    installmentCount: 8,
    galleryTitle: 'The resort',
    showGuestNames: false,
    paymentMethods: [{ kind: 'zelle', label: '', handle: 'nia.aruba@example.com' }],
    paymentInstructions: "Memo: your name + 'ARUBA28'.",
    published: true,
    // The first come, first served sample: confirming a payment takes the next spot.
    joinMode: 'first_come',
    maxGuests: 10,
    isSample: true,
    photos: [
      { url: '/seed/aruba-pool.svg', caption: 'Main pool' },
      { url: '/seed/aruba-beach.svg', caption: 'Palm Beach' },
      { url: '/seed/aruba-room.svg', caption: 'Ocean-view room' },
      { url: '/seed/aruba-dining.svg', caption: 'Beachfront dining' },
      { url: '/seed/aruba-sunset.svg', caption: 'Sunset sail' },
    ],
    highlights: [
      {
        icon: 'hotel',
        title: 'All-inclusive resort',
        detail: 'Meals and drinks covered, 5 nights',
      },
      { icon: 'car', title: 'Airport transfers', detail: 'Shuttle both ways from AUA' },
      { icon: 'activity', title: 'Catamaran day', detail: 'Snorkel stops and an open bar' },
      { icon: 'drink', title: 'Welcome dinner', detail: 'First night, the whole crew' },
    ],
    keyDates: [
      {
        date: '2027-08-01',
        label: 'First $300 installment due. Sign, pay it, and it holds your spot.',
      },
      { date: '2027-12-01', label: 'Send your flight details' },
      { date: '2028-03-01', label: 'Final payment due' },
      { date: '2028-04-13', label: 'Arrive. Transfers leave AUA every hour from noon.' },
    ],
    approved: [
      ['Camille', 'Ortiz'],
      ['Devon', 'Hayes'],
      ['Imani', 'Scott'],
      ['Rashad', 'Young'],
      ['Tasha', 'Monroe'],
      ['Elijah', 'Grant'],
    ],
    interested: [
      ['Kendra', 'Wells'],
      ['Omar', 'Diaz'],
      ['Priya', 'Nair'],
      ['Leon', 'Fisher'],
    ],
  },
  {
    // Real photos (free Unsplash images, hotlinked) so the page can be seen with an organizer's own pictures.
    slug: 'tulum-40th-2027',
    name: "Simone's 40th in Tulum",
    destination: 'Tulum, Mexico',
    startDate: '2027-02-11',
    endDate: '2027-02-15',
    organizerName: 'Simone',
    description:
      'Four nights in a jungle villa with its own pool, ten minutes from the beach. We swim a cenote, walk the ruins on the cliff, and celebrate with a private chef dinner on Saturday.',
    costPerPersonCents: 160000,
    installmentCount: 4,
    galleryTitle: 'The villa',
    showGuestNames: true,
    paymentMethods: [
      { kind: 'zelle', label: '', handle: '(555) 010-0177' },
      { kind: 'venmo', label: '', handle: '@simone-tulum40' },
    ],
    paymentInstructions: "Memo: your name + 'TULUM40'.",
    published: true,
    joinMode: 'pay_first',
    isSample: true,
    photos: [
      { url: unsplash('1713878620264-727e6fc497d8'), caption: 'Villa pool' },
      { url: unsplash('1605217074767-688b113d3b43'), caption: 'The beach' },
      { url: unsplash('1683914791868-69e86700fee1'), caption: 'Kitchen and lounge' },
      { url: unsplash('1763722682615-60ebd0ee2268'), caption: 'Cenote swim' },
      { url: unsplash('1645557180229-98bfc29dbdbf'), caption: 'Ruins on the cliff' },
    ],
    highlights: [
      { icon: 'home', title: 'Private villa', detail: 'Six bedrooms, pool, staff on site' },
      { icon: 'beach', title: 'Beach days', detail: 'Ten minutes by bike or shuttle' },
      { icon: 'activity', title: 'Cenote and ruins', detail: 'Guided morning, Friday' },
      { icon: 'food', title: 'Chef dinner', detail: 'Saturday night, the birthday' },
    ],
    keyDates: [
      {
        date: '2026-11-15',
        label: 'First $400 installment due. Sign and pay it to ask for a spot.',
      },
      { date: '2026-12-15', label: 'Send your flight details' },
      { date: '2027-01-15', label: 'Final payment due' },
      { date: '2027-02-11', label: 'Arrive. Shuttle from Tulum airport at 2:00 PM' },
    ],
    approved: [
      ['Simone', 'Tate'],
      ['Brianna', 'Moss'],
      ['Keisha', 'Ray'],
      ['Nadia', 'Hart'],
      ['Courtney', 'Bishop'],
      ['Jasmine', 'Ford'],
      ['Renee', 'Carter'],
    ],
    interested: [
      ['Monique', 'Hill'],
      ['Tiana', 'Rhodes'],
    ],
  },
]

function unsplash(id: string) {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`
}

const contact = (first: string, last: string, i: number) => ({
  email: `${first}.${last}@example.com`.toLowerCase(),
  phone: `555-01${String(i).padStart(2, '0')}`,
})

// The seed deletes and recreates the demo trips, so it says where it is writing before it does. On Railway it runs
// only in the `dev` environment. From a laptop, a database that is not on this machine (the shared dev one) needs
// `-- --confirm-host <host:port>`, so it is never run against a shared database by accident.
function checkTarget() {
  const railwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_ENVIRONMENT
  if (railwayEnv !== undefined) {
    if (railwayEnv !== 'dev')
      throw new Error(`The seed runs only in Railway's dev environment, not ${railwayEnv}.`)
    return
  }
  const { hostname, port } = new URL(process.env.DATABASE_URL ?? '')
  const host = `${hostname}:${port || '5432'}`
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) return
  const i = process.argv.indexOf('--confirm-host')
  if (i === -1 || process.argv[i + 1] !== host) {
    throw new Error(
      `The database is on ${host}, not this machine. Re-run with -- --confirm-host ${host}.`
    )
  }
}

async function main() {
  checkTarget()
  // Only sample trips are replaced (and their guests, by cascade); every other trip is left alone.
  // The admin's access-log lines for the old sample trips go with them (the log has no tie to the trip itself).
  const old = await prisma.trip.findMany({ where: { isSample: true }, select: { id: true } })
  await prisma.accessLog.deleteMany({ where: { tripId: { in: old.map((t) => t.id) } } })
  await prisma.trip.deleteMany({ where: { isSample: true } })
  for (const {
    approved,
    interested,
    photos,
    highlights,
    keyDates,
    paymentMethods,
    ...trip
  } of trips) {
    // Everyone has signed. Where guests pay first, the accepted have paid and been confirmed, and of the rest the
    // first has reported their payment and the second reported less than due, with a note. Where the organizer
    // accepts first, nobody waiting has paid, and the last guest accepted hasn't paid yet.
    const acceptFirst = trip.joinMode === 'accept_first'
    const paid = new Date('2026-10-20T15:00:00Z')
    // Each guest joined and signed in the same step, a minute apart, before anyone paid.
    const joined = (n: number) => new Date(Date.parse('2026-10-20T14:00:00Z') + n * 60_000)
    const guests = [
      ...approved.map(([firstName, lastName], i) => {
        const hasPaid = !acceptFirst || i < approved.length - 1
        return {
          firstName,
          lastName,
          status: 'approved',
          createdAt: joined(i),
          ...contact(firstName, lastName, i),
          payment: hasPaid ? ('confirmed' as const) : null,
          confirmedAt: new Date(paid.getTime() + (i + 1) * 3600_000),
        }
      }),
      ...interested.map(([firstName, lastName], i) => ({
        firstName,
        lastName,
        status: 'interested',
        createdAt: joined(approved.length + i),
        // On the first come trip the last one joined when it looked full: they wait on the waitlist, and a spot is
        // open for them to be offered.
        waitlistedAt:
          trip.joinMode === 'first_come' && i === interested.length - 1
            ? joined(approved.length + i)
            : null,
        ...contact(firstName, lastName, 50 + i),
        payment: acceptFirst
          ? null
          : i === 0
            ? ('reported' as const)
            : i === 1
              ? ('short' as const)
              : null,
        confirmedAt: paid,
      })),
    ]
    const created = await prisma.trip.create({
      data: {
        ...trip,
        photos: photos as unknown as Prisma.InputJsonValue,
        highlights: highlights as unknown as Prisma.InputJsonValue,
        keyDates: keyDates as unknown as Prisma.InputJsonValue,
        paymentMethods: paymentMethods as unknown as Prisma.InputJsonValue,
        guests: {
          create: guests.map((g) => ({
            firstName: g.firstName,
            lastName: g.lastName,
            status: g.status,
            createdAt: g.createdAt,
            waitlistedAt: 'waitlistedAt' in g ? g.waitlistedAt : null,
            email: g.email,
            phone: g.phone,
          })),
        },
      },
      include: { guests: true },
    })
    const agreement = agreementPreview(created)
    await prisma.agreementSignature.createMany({
      data: created.guests.map((g) => ({
        tripId: created.id,
        guestId: g.id,
        templateVersion: TEMPLATE_VERSION,
        text: agreement.text,
        textHash: agreement.textHash,
        priceCents: created.costPerPersonCents,
        installmentCount: created.installmentCount,
        startDate: created.startDate,
        endDate: created.endDate,
        refundTerms: refundTerms(created.organizerName, created.joinMode),
        typedName: `${g.firstName} ${g.lastName}`,
        signedAt: g.createdAt,
        ipAddress: '192.0.2.10',
        userAgent: 'Seed data',
      })),
    })
    // Their payments: the first installment, by the trip's first way to pay.
    const first = firstInstallmentCents(created.costPerPersonCents, created.installmentCount)
    const method = paymentMethods[0]
    for (const [i, g] of guests.entries()) {
      if (!g.payment) continue
      const confirmed = g.payment === 'confirmed'
      const amount = g.payment === 'short' ? Math.round(first * 0.4) : first
      await prisma.payment.create({
        data: {
          tripId: created.id,
          guestId: created.guests.find((c) => c.email === g.email)!.id,
          guestPaymentAmount: amount,
          receivedPaymentAmount: confirmed ? amount : null,
          method: paymentMethodLabel(method),
          methodKind: method.kind,
          sentOn: paid.toISOString().slice(0, 10),
          note: g.payment === 'short' ? 'The rest on Friday, after payday.' : '',
          status: confirmed ? 'confirmed' : 'reported',
          reportedAt: new Date(paid.getTime() + i * 60_000),
          decidedAt: confirmed ? g.confirmedAt : null,
        },
      })
      // Where guests pay first, the organizer accepted them once their payment arrived. The guest's history wrote
      // "accepted" when the row was made (before the payment existed), so it moves to just after the confirmation.
      if (!acceptFirst && confirmed && g.status === 'approved')
        await prisma.guestEvent.updateMany({
          where: { guestId: created.guests.find((c) => c.email === g.email)!.id, kind: 'accepted' },
          data: { at: new Date(g.confirmedAt.getTime() + 60_000) },
        })
    }
    console.log(`Seeded ${trip.name} → /t/${trip.slug}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
