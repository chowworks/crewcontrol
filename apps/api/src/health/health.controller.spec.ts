import type { Response } from 'express'
import type { ServiceFailureLog } from '../core/service-failure-log'
import { CHECK_CACHE_MS, CHECK_TIMEOUT_MS, HealthController } from './health.controller'

function setup() {
  const recent = jest.fn().mockResolvedValue({ status: 'ok', failures: 0, windowMinutes: 15 })
  const controller = new HealthController({ recent } as unknown as ServiceFailureLog)
  const res = () => {
    const r = { status: jest.fn() }
    r.status.mockReturnValue(r)
    return r as unknown as Response & { status: jest.Mock }
  }
  return { controller, recent, res }
}

describe('HealthController', () => {
  afterEach(() => jest.useRealTimers())

  it('says the API is up, and nothing more', () => {
    expect(Object.keys(setup().controller.check()).sort()).toEqual(['status', 'timestamp'])
  })

  it('counts server errors, and answers ok when there was none', async () => {
    const { controller, recent, res } = setup()
    const r = res()
    expect(await controller.serverErrors(r)).toEqual({
      status: 'ok',
      failures: 0,
      windowMinutes: 15,
    })
    expect(recent.mock.calls).toEqual([['server']])
    expect(r.status).not.toHaveBeenCalled()
  })

  it('answers 503 when there was a failure in the window', async () => {
    const { controller, recent, res } = setup()
    recent.mockResolvedValue({ status: 'failing', failures: 2, windowMinutes: 15 })
    const r = res()
    expect(await controller.serverErrors(r)).toMatchObject({ status: 'failing', failures: 2 })
    expect(r.status).toHaveBeenCalledWith(503)
  })

  it('answers 503 when it cannot count, and never says why', async () => {
    const { controller, recent, res } = setup()
    recent.mockRejectedValue(new Error('connect ECONNREFUSED db.internal:5432'))
    const r = res()
    const out = await controller.serverErrors(r)
    expect(r.status).toHaveBeenCalledWith(503)
    expect(Object.keys(out).sort()).toEqual(['failures', 'status', 'windowMinutes'])
    expect(out.status).toBe('failing')
  })

  it('a count that hangs is failing after the timeout', async () => {
    jest.useFakeTimers()
    const { controller, recent, res } = setup()
    recent.mockReturnValue(new Promise(() => {}))
    const r = res()
    const pending = controller.serverErrors(r)
    await jest.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS)
    expect((await pending).status).toBe('failing')
    expect(r.status).toHaveBeenCalledWith(503)
  })

  it('reuses a result for a minute, so a public caller cannot hammer the database', async () => {
    jest.useFakeTimers()
    const { controller, recent, res } = setup()
    await controller.serverErrors(res())
    await controller.serverErrors(res())
    expect(recent).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(CHECK_CACHE_MS)
    await controller.serverErrors(res())
    expect(recent).toHaveBeenCalledTimes(2)
  })
})
