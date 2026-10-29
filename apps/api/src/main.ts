import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'

async function bootstrap() {
  // rawBody: Resend's webhook is checked against the exact bytes it signed (messaging/resend-webhook.controller.ts).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })
  // FRONTEND_URL may list several web addresses, comma-separated (a laptop, a Vercel preview, production).
  const origins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
  app.enableCors({ origin: origins })
  app.setGlobalPrefix('api')
  // Railway puts one proxy in front of the API: trust that hop, so a request's address is the visitor's, not the
  // proxy's (the sign-up and contact limits count per visitor). Never `true`, which would let anyone fake it.
  app.set('trust proxy', 1)
  const port = process.env.PORT ?? 3000
  await app.listen(port)
  console.log(`API running on port ${port}`)
}

bootstrap()
