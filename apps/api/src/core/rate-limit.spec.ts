import { RateLimiter } from './rate-limit'

describe('RateLimiter', () => {
  it('allows up to the limit per key, then refuses', () => {
    const limit = new RateLimiter(2, 60_000, 'Too many')
    limit.hit('a')
    limit.hit('a')
    expect(() => limit.hit('a')).toThrow('Too many')
    expect(() => limit.hit('b')).not.toThrow()
  })
})
