import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { TripPhoto } from '../trips/trip-types'

/**
 * Trip photos live in a private Cloudflare R2 bucket, one per environment, as Audit Differently's documents do. A
 * trip keeps a reference to each photo (`r2:trip-photos/<name>`), never an address; whoever reads the trip gets
 * short-lived signed links, and the browser loads the photo from Cloudflare, never through the API. A link stops
 * working within two hours, so a photo taken off a trip, or a trip taken down, is not reachable for long.
 */
export interface PhotoBucket {
  /** Stores the photo and returns its reference. */
  put(name: string, bytes: Buffer, contentType: string): Promise<string>
  /** A signed link to a referenced photo. */
  sign(ref: string): Promise<string>
  /** The reference a signed link from this bucket stands for, or null if it is some other address. */
  refFrom(url: string): string | null
}

const REF = /^r2:(trip-photos\/[\w-]+\.(?:jpg|png|webp))$/
export const isPhotoRef = (value: string) => REF.test(value)

// Links are signed from the start of the hour and last two hours, so every page load within an hour gets the same
// link (the browser can keep the photo), and every link lasts at least an hour after the page loaded.
const HOUR = 60 * 60 * 1000

const VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PHOTOS_BUCKET',
] as const

/** The bucket from the R2_* variables, or null when none is set (uploads then answer that photos are off). */
export function photoBucketFromEnv(env: NodeJS.ProcessEnv = process.env): PhotoBucket | null {
  const missing = VARS.filter((name) => !env[name])
  if (missing.length === VARS.length) return null
  if (missing.length) throw new Error(`Photo storage needs ${missing.join(', ')} as well`)
  const bucket = env.R2_PHOTOS_BUCKET!
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${host}`,
    // Links name the bucket in the path, so refFrom can read the photo's name back out of one.
    forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  })
  return {
    async put(name, bytes, contentType) {
      const key = `trip-photos/${name}`
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          // A name is never reused, so a browser may keep a photo as long as it holds the link.
          CacheControl: 'private, max-age=31536000, immutable',
        })
      )
      return `r2:${key}`
    },
    sign(ref) {
      const key = ref.match(REF)?.[1]
      if (!key) throw new Error(`Not a photo reference: ${ref}`)
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: (2 * HOUR) / 1000,
        signingDate: new Date(Math.floor(Date.now() / HOUR) * HOUR),
      })
    },
    refFrom(url) {
      try {
        const { hostname, pathname } = new URL(url)
        const ref = `r2:${pathname.slice(`/${bucket}/`.length)}`
        return hostname === host && pathname.startsWith(`/${bucket}/`) && isPhotoRef(ref)
          ? ref
          : null
      } catch {
        return null
      }
    },
  }
}

let shared: PhotoBucket | null | undefined
/** This API's bucket, made once from its variables. */
export function photoBucket(): PhotoBucket | null {
  if (shared === undefined) shared = photoBucketFromEnv()
  return shared
}

/** A photo address for a reader: a reference becomes a signed link; any other address (the seed's) stays. */
export async function photoUrl(url: string): Promise<string> {
  const bucket = photoBucket()
  return bucket && isPhotoRef(url) ? bucket.sign(url) : url
}

/** The trip with each photo's reference swapped for a signed link. */
export async function withPhotoLinks<T extends { photos: TripPhoto[] }>(trip: T): Promise<T> {
  const photos = await Promise.all(
    trip.photos.map(async (p) => ({ ...p, url: await photoUrl(p.url) }))
  )
  return { ...trip, photos }
}

/** The summary with its cover's reference swapped for a signed link. */
export async function withCoverLink<T extends { coverUrl: string | null }>(trip: T): Promise<T> {
  return trip.coverUrl ? { ...trip, coverUrl: await photoUrl(trip.coverUrl) } : trip
}
