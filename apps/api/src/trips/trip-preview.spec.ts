import { drawPreview, previewIsCurrent, previewName, previewVersion } from './trip-preview'

const trip = {
  name: 'Aruba Crew Getaway 2028',
  destination: 'Palm Beach, Aruba',
  startDate: '2028-04-13',
  endDate: '2028-04-18',
  organizerName: 'Nia',
  photos: [{ url: 'r2:trip-photos/abc.jpg', caption: 'Main pool' }],
}

describe('trip link preview picture', () => {
  it('keeps its picture while what it shows is unchanged', () => {
    const ref = `r2:trip-photos/${previewName(trip)}`
    expect(previewIsCurrent(ref, trip)).toBe(true)
    expect(previewIsCurrent(ref, { ...trip, description: 'New words' } as typeof trip)).toBe(true)
    expect(previewIsCurrent(ref, { ...trip, name: 'Aruba 2029' })).toBe(false)
    expect(previewIsCurrent(ref, { ...trip, endDate: '2028-04-19' })).toBe(false)
    expect(previewIsCurrent(ref, { ...trip, organizerName: 'Kendra' })).toBe(false)
    expect(previewIsCurrent(ref, { ...trip, photos: [] })).toBe(false)
    expect(previewIsCurrent(null, trip)).toBe(false)
  })

  it("ignores a cover's signed link changing", () => {
    const signed = (sig: string) => ({
      ...trip,
      photos: [{ url: `https://images.example.com/pool.jpg?sig=${sig}`, caption: '' }],
    })
    expect(previewVersion(signed('a'))).toBe(previewVersion(signed('b')))
  })

  it('never reuses a name, and keeps to the photo bucket’s names', () => {
    expect(previewName(trip)).not.toBe(previewName(trip))
    expect(previewName(trip)).toMatch(/^[\w-]+\.jpg$/)
  })

  it('draws a JPEG, with or without a cover photo', async () => {
    const jpeg = await drawPreview(trip, null)
    expect(jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    expect(jpeg.length).toBeLessThan(300_000)
  }, 20_000)
})
