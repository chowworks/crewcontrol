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
