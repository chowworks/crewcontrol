import { Module } from '@nestjs/common'
import { EmailsController } from './emails.controller'
import { EmailsService } from './emails.service'
import { ResendWebhookController } from './resend-webhook.controller'

@Module({
  controllers: [EmailsController, ResendWebhookController],
  providers: [EmailsService],
  exports: [EmailsService],
})
export class MessagingModule {}
