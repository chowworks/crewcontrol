import { emailKind } from './email-defaults'
import { checkTemplate, htmlToText, render, type GuestEmailContext } from './email-template'

const context: GuestEmailContext = {
  trip: {
    name: 'Aruba Crew Getaway 2028',
    destination: 'Aruba',
    startDate: 'Mar 3, 2028',
    endDate: 'Mar 8, 2028',
    dates: 'Mar 3 – 8, 2028',
    organizerName: 'Nia',
    description: 'Five days at the resort.',
    pricePerPerson: '$1,200',
    installmentCount: 3,
    pageLink: 'https://travel-hq.app/t/aruba-2028',
    joinLink: 'https://travel-hq.app/t/aruba-2028/join',
    highlights: [{ title: 'Beach', detail: 'Steps from the water' }],
    keyDates: [
      { date: 'Jan 5, 2028', label: 'Final payment' },
      { date: 'Feb 1, 2028', label: 'Book flights' },
    ],
  },
  guest: {
    firstName: 'Dana',
    lastName: 'Reyes',
    fullName: 'Dana Reyes',
    email: 'dana.reyes@example.com',
    phone: '(555) 010-0142',
    status: 'Accepted',
    accepted: true,
    canPay: true,
    waitlisted: false,
    room: '',
  },
  paymentDetails: {
    methods: [{ name: 'Zelle', handle: '(555) 010-0199' }],
    oneMethod: true,
    instructions: 'Put your name in the memo.',
    price: '$1,200',
    adjustments: '',
    total: '$1,200',
    firstPayment: '$400',
    deposit: false,
    depositKept: false,
    paid: '$0',
    pending: '$0',
    left: '$1,200',
    dueNow: '$400',
    installmentCount: 3,
  },
}

describe('checkTemplate', () => {
  it('accepts known variables, #if, #unless and #each with their fields', () => {
    const source =
      '<p>Hi {{guest.firstName}}, {{trip.name}}</p>{{#if guest.accepted}}yes{{else}}no{{/if}}' +
      '{{#unless guest.waitlisted}}in{{/unless}}' +
      '<ul>{{#each trip.keyDates}}<li>{{date}}: {{this.label}} {{@index}} {{../trip.name}}</li>{{/each}}</ul>'
    expect(checkTemplate(source, ['trip', 'guest'])).toEqual([])
  })

  it('refuses unknown variables and fields', () => {
    expect(
      checkTemplate('{{trip.secret}} {{#each trip.keyDates}}{{this.nope}}{{/each}}', ['trip'])
    ).toEqual([
      "{{trip.secret}} isn't a variable this email has",
      "{{this.nope}} isn't a field of this list",
    ])
  })

  it('refuses payment details in an email that may not have them', () => {
    expect(checkTemplate('{{paymentDetails.instructions}}', ['trip', 'guest'])).toEqual([
      "{{paymentDetails.instructions}} isn't a variable this email has",
    ])
    expect(checkTemplate('{{paymentDetails.instructions}}', ['paymentDetails'])).toEqual([])
  })

  it('refuses triple braces, helpers, partials and broken syntax', () => {
    expect(checkTemplate('{{{trip.name}}}', ['trip'])).toEqual([
      'Use {{double braces}}; {{{triple braces}}} are not allowed',
    ])
    expect(checkTemplate('{{#with trip}}{{name}}{{/with}}', ['trip'])[0]).toMatch(
      /only #if, #unless and #each/
    )
    expect(checkTemplate('{{lookup trip "name"}}', ['trip'])).toContain(
      'Only variables go in {{ }}'
    )
    expect(checkTemplate('{{> header}}', ['trip'])).toEqual([
      'Partials and other Handlebars features are not allowed',
    ])
    expect(checkTemplate('{{#if trip.name}}', ['trip'])[0]).toMatch(/doesn't read/)
    expect(checkTemplate('{{#each trip.name}}x{{/each}}', ['trip'])).toEqual([
      '{{#each trip.name}} needs a list',
    ])
  })
})

describe('render', () => {
  it('fills the subject as plain text and the body as escaped HTML in the frame', () => {
    const evil = { ...context, guest: { ...context.guest, firstName: '<b>Dana</b> & co' } }
    const out = render(
      {
        subject: 'Welcome, {{guest.firstName}}\n to {{trip.name}}',
        body: '<p>Hi {{guest.firstName}}</p>',
      },
      evil
    )
    expect(out.subject).toBe('[Travel HQ] Welcome, <b>Dana</b> & co to Aruba Crew Getaway 2028')
    expect(out.html).toContain('<p>Hi &lt;b&gt;Dana&lt;/b&gt; &amp; co</p>')
    expect(out.html).toContain('Travel HQ never handles money: you pay Nia directly.')
    expect(out.text).toMatch(/^Hi <b>Dana<\/b> & co\n\n--\n/)
  })

  it('lists payment methods for a guest who may pay', () => {
    const out = render(
      {
        subject: 'How to pay',
        body: '<ul>{{#each paymentDetails.methods}}<li>{{name}}: {{handle}}</li>{{/each}}</ul><p>{{paymentDetails.dueNow}} now</p>',
      },
      context
    )
    expect(out.text).toContain('- Zelle: (555) 010-0199')
    expect(out.text).toContain('$400 now')
  })

  it('reaches trip and guest variables from inside a list', () => {
    const out = render(
      {
        subject: 's',
        body: '{{#each trip.keyDates}}{{label}} for {{guest.firstName}} on {{trip.name}}. {{/each}}',
      },
      context
    )
    expect(out.text).toMatch(
      /^Final payment for Dana on Aruba Crew Getaway 2028\. Book flights for Dana/
    )
  })

  it('gives a guest of a deleted trip their record, and never the ways to pay', () => {
    const k = emailKind('trip_deleted')!
    expect(checkTemplate(k.body, k.groups)).toEqual([])
    const out = render(k, {
      ...context,
      deletion: {
        eraseDate: 'Nov 29, 2026',
        agreement: 'Trip agreement: Aruba Crew Getaway 2028',
        signedName: 'Dana Reyes',
        signedOn: 'Oct 21, 2026',
        payments: [{ date: 'Oct 22, 2026', amount: '$400', how: 'Zelle', status: 'confirmed' }],
      },
    })
    expect(out.text).toContain('Oct 22, 2026: $400 by Zelle (confirmed)')
    expect(out.text).toContain('Your copy is attached')
    expect(out.text).toContain('which Nia deleted from Travel HQ')
    expect(out.html).not.toContain('(555) 010-0199')
  })
})

it('turns HTML into readable text', () => {
  expect(
    htmlToText(
      '<h1>Hi</h1><p>Open <a href="https://x.test/j">your page</a><br>then pay.</p><ul><li>A</li><li>B</li></ul>'
    )
  ).toBe('Hi\n\nOpen your page (https://x.test/j)\nthen pay.\n\n- A\n- B')
})
