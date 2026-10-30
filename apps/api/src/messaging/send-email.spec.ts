import { deliverable, maskEmail, resetEmailClient, sendEmail } from './send-email'

const send = jest.fn()
jest.mock('resend', () => ({ Resend: jest.fn(() => ({ emails: { send } })) }))

const email = {
  to: 'kendra@travel-hq.app',
  subject: 'You signed up for Aruba',
  text: 'Your copy: …',
}

describe('sendEmail', () => {
  beforeEach(() => {
    send.mockReset()
    resetEmailClient()
    delete process.env.RESEND_API_KEY
    delete process.env.DEV_EMAIL_TO
  })

  it('only logs without an API key', async () => {
    await expect(sendEmail(email)).resolves.toEqual({ sent: false, reason: 'mocked' })
    expect(send).not.toHaveBeenCalled()
  })

  it('sends through Resend with a key, from Travel HQ', async () => {
    process.env.RESEND_API_KEY = 're_test'
    send.mockResolvedValue({ data: { id: 'em_1' }, error: null })
    await expect(sendEmail({ ...email, replyTo: 'ana@travel-hq.app' })).resolves.toEqual({
      sent: true,
      id: 'em_1',
    })
    expect(send).toHaveBeenCalledWith({
      from: 'Travel HQ <trips@travel-hq.app>',
      to: 'kendra@travel-hq.app',
      subject: 'You signed up for Aruba',
      text: 'Your copy: …',
      html: undefined,
      replyTo: 'ana@travel-hq.app',
      attachments: undefined,
    })
  })

  it('sends the logo inside an email that shows it', async () => {
    process.env.RESEND_API_KEY = 're_test'
    send.mockResolvedValue({ data: { id: 'em_2' }, error: null })
    await sendEmail({ ...email, html: '<img src="cid:travelhq-logo">' })
    expect(send.mock.calls[0][0].attachments).toEqual([
      { filename: 'travel-hq.png', content: expect.any(Buffer), contentId: 'travelhq-logo' },
    ])
  })

  it('sends files with it, such as a signed agreement', async () => {
    process.env.RESEND_API_KEY = 're_test'
    send.mockResolvedValue({ data: { id: 'em_3' }, error: null })
    await sendEmail({ ...email, attachments: [{ filename: 'a.txt', content: 'Signed.' }] })
    expect(send.mock.calls[0][0].attachments).toEqual([
      { filename: 'a.txt', content: Buffer.from('Signed.', 'utf8') },
    ])
  })

  it('throws when Resend refuses, without the full address', async () => {
    process.env.RESEND_API_KEY = 're_test'
    send.mockResolvedValue({ data: null, error: { message: 'Domain not verified' } })
    await expect(sendEmail(email)).rejects.toThrow(
      'Email to k•••@travel-hq.app failed: Domain not verified'
    )
  })

  it('never sends to the seed’s fictional addresses', async () => {
    process.env.RESEND_API_KEY = 're_test'
    await expect(sendEmail({ ...email, to: 'dana.reyes@example.com' })).resolves.toEqual({
      sent: false,
      reason: 'not_deliverable',
    })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('DEV_EMAIL_TO', () => {
  beforeEach(() => {
    send.mockReset()
    resetEmailClient()
    process.env.RESEND_API_KEY = 're_test'
    send.mockResolvedValue({ data: { id: 'em_3' }, error: null })
  })
  afterEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.DEV_EMAIL_TO
  })

  it('sends every email to the developer, saying who it was for, the seed’s fictional guests included', async () => {
    process.env.DEV_EMAIL_TO = 'dev@travel-hq.app'
    await sendEmail({
      ...email,
      to: 'dana.reyes@example.com',
      html: '<!doctype html><html><body style="margin:0"><p>Hi</p></body></html>',
    })
    const sent = send.mock.calls[0][0]
    expect(sent.to).toBe('dev@travel-hq.app')
    expect(sent.subject).toBe('[Test] You signed up for Aruba')
    expect(sent.text).toMatch(
      /^Test email from Travel HQ dev\. It would have gone to dana\.reyes@example\.com\./
    )
    expect(sent.html).toMatch(
      /<body style="margin:0"><div[^>]*>Test email .* dana\.reyes@example\.com\.<\/div><p>Hi/
    )
  })

  it('sends normally when it isn’t set', async () => {
    await sendEmail(email)
    expect(send.mock.calls[0][0]).toMatchObject({
      to: 'kendra@travel-hq.app',
      subject: email.subject,
    })
  })
})

describe('deliverable', () => {
  it.each(['a@mail.example.co', 'a@travel-hq.app'])('%s can take mail', (to) =>
    expect(deliverable(to)).toBe(true)
  )
  it.each(['a@example.com', 'a@x.example.org', 'a@trip.test', 'a@localhost', 'a@nodot', 'nope'])(
    '%s cannot',
    (to) => expect(deliverable(to)).toBe(false)
  )
})

it('masks an address for logs', () =>
  expect(maskEmail('kendra@travel-hq.app')).toBe('k•••@travel-hq.app'))
