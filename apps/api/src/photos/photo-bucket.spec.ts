import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { photoBucketFromEnv } from './photo-bucket'

const env = {
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_PHOTOS_BUCKET: 'crewcontrol-photos-dev',
}

describe('photoBucketFromEnv', () => {
  afterEach(() => jest.restoreAllMocks())

  it('is off when no R2 variable is set', () => {
    expect(photoBucketFromEnv({})).toBeNull()
  })

  it('names what is missing when only some are set, so a half-set service fails at start', () => {
    expect(() => photoBucketFromEnv({ R2_ACCOUNT_ID: 'acct' })).toThrow(
      'Photo storage needs R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PHOTOS_BUCKET as well'
    )
  })

  it('puts the photo in the bucket and returns its reference, not an address', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never)
    const ref = await photoBucketFromEnv(env)!.put('abc-1.jpg', Buffer.from('x'), 'image/jpeg')
    expect(ref).toBe('r2:trip-photos/abc-1.jpg')
    const command = send.mock.calls[0][0] as PutObjectCommand
    expect(command.input).toMatchObject({
      Bucket: 'crewcontrol-photos-dev',
      Key: 'trip-photos/abc-1.jpg',
      ContentType: 'image/jpeg',
    })
  })

  it('signs a link that expires, the same one all hour, and reads the reference back out of it', async () => {
    const bucket = photoBucketFromEnv(env)!
    const link = await bucket.sign('r2:trip-photos/abc-1.jpg')
    expect(link).toMatch(
      /^https:\/\/acct\.r2\.cloudflarestorage\.com\/crewcontrol-photos-dev\/trip-photos\/abc-1\.jpg\?/
    )
    expect(link).toContain('X-Amz-Expires=7200')
    expect(await bucket.sign('r2:trip-photos/abc-1.jpg')).toBe(link)
    expect(bucket.refFrom(link)).toBe('r2:trip-photos/abc-1.jpg')
  })

  it('takes no other address for one of its photos', () => {
    const bucket = photoBucketFromEnv(env)!
    expect(bucket.refFrom('https://images.unsplash.com/photo-1?w=1600')).toBeNull()
    expect(
      bucket.refFrom('https://acct.r2.cloudflarestorage.com/another-bucket/trip-photos/a.jpg')
    ).toBeNull()
    expect(
      bucket.refFrom('https://acct.r2.cloudflarestorage.com/crewcontrol-photos-dev/../secret.pdf')
    ).toBeNull()
    expect(() => bucket.sign('r2:../secret.pdf')).toThrow('Not a photo reference')
  })
})
