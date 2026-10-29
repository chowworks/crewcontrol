import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/messaging.module'
import { ContactController } from './contact.controller'

@Module({ imports: [MessagingModule], controllers: [ContactController] })
export class ContactModule {}
