import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/messaging.module'
import { ContactController } from './contact.controller'
import { EarlyAccessController } from './early-access.controller'

@Module({ imports: [MessagingModule], controllers: [ContactController, EarlyAccessController] })
export class ContactModule {}
