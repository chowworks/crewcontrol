import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * A small in-memory limit: at most `max` hits per key in `windowMs`. Keys with no recent hits are dropped as it goes,
 * so the map doesn't grow without end. Per API instance; good enough to stop one sender flooding a form.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly message: string
  ) {}

  /** Refuses, without counting a hit, when `key` already has `max` recent hits. */
  check(key: string): void {
    const now = Date.now()
    if ((this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs).length >= this.max)
      throw new HttpException(this.message, HttpStatus.TOO_MANY_REQUESTS)
  }

  hit(key: string): void {
    const now = Date.now()
    if (this.hits.size > 5000) {
      for (const [k, times] of this.hits)
        if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(k)
    }
    const times = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (times.length >= this.max)
      throw new HttpException(this.message, HttpStatus.TOO_MANY_REQUESTS)
    this.hits.set(key, [...times, now])
  }
}
