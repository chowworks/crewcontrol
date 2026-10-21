import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { mkdirSync } from 'node:fs'
import { AppModule } from './app.module'
import { uploadDir } from './photos/upload-dir'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  // FRONTEND_URL may list several web addresses, comma-separated (a laptop, a Vercel preview, production).
  const origins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
  app.enableCors({ origin: origins })
  app.setGlobalPrefix('api')
  // Uploaded photos, served outside the /api prefix so their URLs stay short.
  mkdirSync(uploadDir(), { recursive: true })
  app.useStaticAssets(uploadDir(), { prefix: '/uploads/', maxAge: '30d', immutable: true })
  const port = process.env.PORT ?? 3000
  await app.listen(port)
  console.log(`API running on port ${port}`)
}

bootstrap()
