import { looksLikeImage } from './photos.controller'

describe('looksLikeImage', () => {
  it('accepts JPEG, PNG and WebP by their first bytes', () => {
    expect(looksLikeImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true)
    expect(
      looksLikeImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))
    ).toBe(true)
    expect(looksLikeImage(Buffer.from('RIFF\0\0\0\0WEBP', 'ascii'))).toBe(true)
  })

  it('refuses anything else, whatever the browser claimed', () => {
    expect(looksLikeImage(Buffer.from('<svg xmlns="h', 'ascii'))).toBe(false)
    expect(looksLikeImage(Buffer.from('%PDF-1.7\n\0\0\0', 'ascii'))).toBe(false)
  })
})
