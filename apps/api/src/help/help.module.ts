import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/messaging.module'
import { AdminHelpController, HelpController } from './help.controller'
import { HelpService } from './help.service'

@Module({
  imports: [MessagingModule],
  controllers: [HelpController, AdminHelpController],
  providers: [HelpService],
})
export class HelpModule {}
