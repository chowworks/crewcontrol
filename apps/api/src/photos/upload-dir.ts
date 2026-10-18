import { resolve } from 'node:path'

/** Where uploaded photos are written and served from (UPLOAD_DIR, a Railway volume in production). */
export function uploadDir(): string {
  return resolve(process.env.UPLOAD_DIR ?? './storage/uploads')
}
