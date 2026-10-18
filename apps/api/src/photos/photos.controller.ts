import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { randomUUID } from 'node:crypto'
import { mkdirSync, openSync, readSync, closeSync, unlinkSync } from 'node:fs'
import { diskStorage } from 'multer'
import { uploadDir } from './upload-dir'

const TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}
const MAX_BYTES = 8 * 1024 * 1024

/** Whether the file's first bytes are really a JPEG, PNG or WebP: the browser's claimed type alone is never trusted. */
export function looksLikeImage(head: Buffer): boolean {
  const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
  const png = head
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const webp = head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP'
  return jpeg || png || webp
}

function readHead(path: string): Buffer {
  const head = Buffer.alloc(12)
  const fd = openSync(path, 'r')
  try {
    readSync(fd, head, 0, 12, 0)
  } finally {
    closeSync(fd)
  }
  return head
}

// The web app shrinks photos before sending them, so 8 MB is a ceiling, not the usual size.
@Controller('photos')
export class PhotosController {
  @Post()
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: MAX_BYTES },
      fileFilter: (_req, file, done) =>
        TYPES[file.mimetype]
          ? done(null, true)
          : done(new BadRequestException('Photos must be JPEG, PNG or WebP'), false),
      storage: diskStorage({
        destination: (_req, _file, done) => {
          const dir = uploadDir()
          mkdirSync(dir, { recursive: true })
          done(null, dir)
        },
        filename: (_req, file, done) => done(null, `${randomUUID()}${TYPES[file.mimetype]}`),
      }),
    })
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Attach a photo as the "photo" field')
    if (!looksLikeImage(readHead(file.path))) {
      unlinkSync(file.path)
      throw new BadRequestException('That file is not a JPEG, PNG or WebP photo')
    }
    const base = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`
    return { url: `${base}/uploads/${file.filename}` }
  }
}
