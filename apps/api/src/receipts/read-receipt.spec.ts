import { dayIn, htmlToText, plainText, readReceipt } from './read-receipt'

// Fictional emails in the wordings the payment apps and banks use; no real person's details.
describe('readReceipt', () => {
  it('reads a Zelle alert forwarded by the organizer: who sent it, how much, the day', () => {
    const text = plainText(
      [
        'Here is Kendra’s first payment',
        '',
        '---------- Forwarded message ---------',
        'From: Example Bank <alerts@bank.example>',
        'Date: Thu, Oct 22, 2026 at 3:14 PM',
        'Subject: You received money with Zelle®',
        'To: <organizer@example.com>',
        '',
        'Kendra Smith sent you $300.00',
        'Memo: MV house',
      ].join('\n'),
      null
    )
    expect(readReceipt(text, 'Fwd: You received money with Zelle®')).toEqual({
      amountCents: 30000,
      payerName: 'Kendra Smith',
      payeeName: '',
      methodKind: 'zelle',
      sentOn: '2026-10-22',
    })
  })

  it('reads a Cash App email, cutting the memo off the name', () => {
    const r = readReceipt('Marcus Lee sent you $150 for Beach house deposit\nCash App', null)
    expect(r).toMatchObject({ amountCents: 15000, payerName: 'Marcus Lee', methodKind: 'cashapp' })
  })

  it('reads a bank alert that names the payer after the amount, in capitals', () => {
    const r = readReceipt(
      'You received a Zelle payment of $1,250.50 from KENDRA SMITH on 10/21/2026.',
      null
    )
    expect(r).toMatchObject({
      amountCents: 125050,
      payerName: 'KENDRA SMITH',
      methodKind: 'zelle',
      sentOn: '2026-10-21',
    })
  })

  it('reads the guest’s own confirmation: who was paid', () => {
    const r = readReceipt('You sent $300.00 to Chris Organizer\nConfirmation: ABC123', 'Zelle')
    expect(r).toMatchObject({ amountCents: 30000, payerName: '', payeeName: 'Chris Organizer' })
  })

  it('reads label lines, with the value on the next line, and skips forwarded headers', () => {
    const text = [
      'From: Alerts <alerts@bank.example>',
      'Amount',
      '$400.00',
      'From',
      'Jordan Diaz',
      'Transaction date: November 2, 2026',
    ].join('\n')
    expect(readReceipt(text, null)).toMatchObject({
      amountCents: 40000,
      payerName: 'Jordan Diaz',
      sentOn: '2026-11-02',
    })
  })

  it('says nothing when it can’t tell one amount', () => {
    const r = readReceipt('Your balance is $1,000.00 and your last deposit was $250.00', null)
    expect(r.amountCents).toBeNull()
  })

  it('takes one amount said more than once', () => {
    expect(readReceipt('Payment received\n$300.00\nTotal $300.00', null).amountCents).toBe(30000)
  })

  it('says no method when the email names none', () => {
    expect(readReceipt('Dana sent you $20', null).methodKind).toBeNull()
  })
})

describe('the email’s text', () => {
  it('makes HTML plain: blocks break lines, entities decode, styles go', () => {
    const html =
      '<html><head><style>p{color:red}</style></head><body><p>Kendra Smith sent you &#36;300.00</p><div>Zelle&reg;&nbsp;payment</div></body></html>'
    expect(plainText(null, html)).toBe('Kendra Smith sent you $300.00\nZelle® payment')
    expect(htmlToText('<td>Amount</td><td>$5</td>')).toContain('Amount $5')
    expect(htmlToText('<script>x()</script\t\nfoo="bar">Paid $5')).toBe(' Paid $5')
    expect(htmlToText('<scr<script>ipt>Paid &lt;b&gt;$5')).toBe('ipt Paid  b $5')
  })

  it('drops the quote marks of a forwarded reply', () => {
    expect(plainText('> > Kendra sent you $5\n>\n', null)).toBe('Kendra sent you $5')
  })
})

describe('dayIn', () => {
  it('reads the first real day in the forms emails use', () => {
    expect(dayIn('Sent: Thursday, October 22, 2026 3:14 PM')).toBe('2026-10-22')
    expect(dayIn('on 2026-10-05 at noon')).toBe('2026-10-05')
    expect(dayIn('10/5/26')).toBe('2026-10-05')
    expect(dayIn('Feb 30, 2026')).toBeNull()
    expect(dayIn('no date here')).toBeNull()
  })
})
