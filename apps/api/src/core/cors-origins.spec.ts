import { corsOrigins } from './cors-origins'

const allowed = (list: string, origin: string) =>
  corsOrigins(list).some((o) => (typeof o === 'string' ? o === origin : o.test(origin)))

describe('corsOrigins', () => {
  const dev =
    'http://localhost:5373, https://travel-hq-git-*-ludakhris-projects.vercel.app,https://travelhq-vert.vercel.app'

  it('keeps exact addresses exact', () => {
    expect(allowed(dev, 'http://localhost:5373')).toBe(true)
    expect(allowed(dev, 'https://travelhq-vert.vercel.app')).toBe(true)
    expect(allowed(dev, 'https://travelhq-vert.vercel.app.evil.com')).toBe(false)
  })

  it('lets a pattern match any branch preview, and nothing beyond it', () => {
    expect(
      allowed(dev, 'https://travel-hq-git-organizer-going-too-ludakhris-projects.vercel.app')
    ).toBe(true)
    expect(allowed(dev, 'https://travel-hq-git-x.evil.com-ludakhris-projects.vercel.app')).toBe(
      false
    )
    expect(allowed(dev, 'https://evil.com/travel-hq-git-x-ludakhris-projects.vercel.app')).toBe(
      false
    )
    expect(allowed(dev, 'http://travel-hq-git-x-ludakhris-projects.vercel.app')).toBe(false)
    expect(allowed(dev, 'https://travel-hq-git-x-ludakhris-projects.vercel.app.evil.com')).toBe(
      false
    )
    expect(allowed(dev, 'https://travel-hq-git--ludakhris-projects.vercel.app')).toBe(false)
  })

  it('refuses a * anywhere but the first part of an https address', () => {
    expect(() => corsOrigins('https://*.vercel.app.*')).toThrow()
    expect(() => corsOrigins('http://*-preview.example.com')).toThrow()
    expect(() => corsOrigins('https://app.*.vercel.app')).toThrow()
  })
})
