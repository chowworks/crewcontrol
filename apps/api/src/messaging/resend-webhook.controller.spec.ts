import { createHmac } from 'node:crypto'
import type { PrismaService } from '../prisma/prisma.service'
import { ResendWebhookController } from './resend-webhook.controller'

// A signing secret in Resend's (Svix's) format, and a request signed with it the way Resend signs.
const key = Buffer.from('a-test-signing-key-of-32-bytes!!')
const secret = `whsec_${key.toString('base64')}`

function signed(body: object) {
  const payload = JSON.stringify(body)
  const id = 'msg_1'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64')
  return { req: { rawBody: Buffer.from(payload) }, id, timestamp, signature: `v1,${sig}` }
}

describe('ResendWebhookController', () => {
  const queryRaw = jest.fn(async () => [{ n: 1 }])
  const controller = new ResendWebhookController({
    $queryRaw: queryRaw,
  } as unknown as PrismaService)
  const receive = (r: ReturnType<typeof signed>) =>
    controller.receive(r.req as never, r.id, r.timestamp, r.signature)

  beforeEach(() => {
    queryRaw.mockClear()
    process.env.RESEND_WEBHOOK_SECRET = secret
  })

  it('marks every address a bounce, a blocked send or a spam complaint was for', async () => {
    await receive(signed({ type: 'email.bounced', data: { to: ['dana@travel-hq.app'] } }))
    await receive(signed({ type: 'email.suppressed', data: { to: ['dana@travel-hq.app'] } }))
    await receive(signed({ type: 'email.complained', data: { to: ['kai@travel-hq.app'] } }))
    const calls = queryRaw.mock.calls.map((c) =>
      (c as unknown as [unknown, string, string]).slice(1, 3)
    )
    expect(calls).toEqual([
      ['dana@travel-hq.app', 'bounced'],
      ['dana@travel-hq.app', 'blocked'],
      ['kai@travel-hq.app', 'complained'],
    ])
  })

  it('ignores other events', async () => {
    await receive(signed({ type: 'email.delivered', data: { to: ['dana@travel-hq.app'] } }))
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('refuses a request Resend did not sign', async () => {
    const r = signed({ type: 'email.bounced', data: { to: ['dana@travel-hq.app'] } })
    await expect(receive({ ...r, signature: 'v1,forged' })).rejects.toThrow('Bad signature')
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('refuses everything until the signing secret is set', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    await expect(receive(signed({ type: 'email.bounced', data: { to: [] } }))).rejects.toThrow(
      'not set up'
    )
  })
})
