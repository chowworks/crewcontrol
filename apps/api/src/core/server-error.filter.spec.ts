import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import type { ArgumentsHost } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { ServerErrorFilter } from './server-error.filter'
import type { BotRequestLog } from './bot-request-log'
import type { ServiceFailureLog } from './service-failure-log'

function setup(route: { path: string } | null = { path: '/api/trips/:id' }) {
  const record = jest.fn().mockResolvedValue(undefined)
  const note = jest.fn()
  const filter = new ServerErrorFilter(
    { record } as unknown as ServiceFailureLog,
    { note } as unknown as BotRequestLog
  )
  const req = {
    method: 'GET',
    route: route ?? undefined,
    url: '/api/trips/t-123',
    originalUrl: '/api/trips/t-123',
  }
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ArgumentsHost
  return { filter, record, note, host }
}

describe('ServerErrorFilter', () => {
  // Nest's own answer is not under test here
  beforeEach(() => jest.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => {}))
  afterEach(() => jest.restoreAllMocks())

  it('counts an unexpected error by its route pattern, never its ids, then lets Nest answer', () => {
    const { filter, record, host } = setup()
    const err = new Error('boom')
    filter.catch(err, host)
    expect(record).toHaveBeenCalledWith('server', 'GET /api/trips/:id')
    expect(BaseExceptionFilter.prototype.catch).toHaveBeenCalledWith(err, host)
  })

  it('counts a 5xx HttpException', () => {
    const { filter, record, host } = setup()
    filter.catch(new ServiceUnavailableException(), host)
    expect(record).toHaveBeenCalledWith('server', 'GET /api/trips/:id')
  })

  it("does not count a 4xx: that is the request's fault", () => {
    const { filter, record, host } = setup()
    filter.catch(new NotFoundException(), host)
    filter.catch(new BadRequestException(), host)
    expect(record).not.toHaveBeenCalled()
    expect(BaseExceptionFilter.prototype.catch).toHaveBeenCalledTimes(2)
  })

  it('does not count an error carrying its own 4xx status, as the body reader throws', () => {
    const { filter, record, host } = setup()
    const err = Object.assign(new Error('unsupported content encoding "br"'), {
      statusCode: 415,
      status: 415,
      type: 'encoding.unsupported',
    })
    filter.catch(err, host)
    expect(record).not.toHaveBeenCalled()
  })

  it('counts an error carrying its own 5xx status', () => {
    const { filter, record, host } = setup()
    filter.catch(Object.assign(new Error('upstream'), { statusCode: 502 }), host)
    expect(record).toHaveBeenCalledWith('server', 'GET /api/trips/:id')
  })

  it('counts a 4xx on a request that reached no route as a bot request, never as a server error', () => {
    const { filter, record, note, host } = setup(null)
    filter.catch(new NotFoundException(), host)
    filter.catch(
      Object.assign(new Error('unsupported content encoding "br"'), { statusCode: 415 }),
      host
    )
    expect(note).toHaveBeenCalledTimes(2)
    expect(note).toHaveBeenCalledWith('GET', '/api/trips/t-123')
    expect(record).not.toHaveBeenCalled()
  })

  it('counts a body it could not read without its path, which can be a real one with a token in it', () => {
    const { filter, record, note, host } = setup(null)
    jest
      .spyOn((filter as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation()
    const err = Object.assign(new Error('unsupported content encoding "br"'), {
      statusCode: 415,
      type: 'encoding.unsupported',
    })
    filter.catch(err, host)
    expect(note).toHaveBeenCalledWith('GET', '[unreadable body]')
    expect(record).not.toHaveBeenCalled()
  })

  it('reads a status given as text the way Nest answers it', () => {
    const { filter, record, host } = setup()
    filter.catch(Object.assign(new Error('nope'), { statusCode: '404' }), host)
    expect(record).not.toHaveBeenCalled()
  })

  it('does not count a 4xx on a matched route as a bot request', () => {
    const { filter, note, host } = setup()
    filter.catch(new NotFoundException(), host)
    expect(note).not.toHaveBeenCalled()
  })

  it('names a request that matched no route without its path', () => {
    const { filter, record, host } = setup(null)
    filter.catch(new Error('boom'), host)
    expect(record).toHaveBeenCalledWith('server', 'GET unmatched')
  })
})
