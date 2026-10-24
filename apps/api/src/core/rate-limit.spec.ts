import { RateLimiter } from './rate-limit'

describe('RateLimiter', () => {
  it('allows up to the limit per key, then refuses', () => {
    const limit = new RateLimiter(2, 60_000, 'Too many')
    limit.hit('a')
    limit.hit('a')
    expect(() => limit.hit('a')).toThrow('Too many')
    expect(() => limit.hit('b')).not.toThrow()
  })

  it('checks a key without counting a hit', () => {
    const limit = new RateLimiter(1, 60_000, 'Too many')
    expect(() => limit.check('a')).not.toThrow()
    limit.hit('a')
    expect(() => limit.check('a')).toThrow('Too many')
    expect(() => limit.check('b')).not.toThrow()
  })
})
