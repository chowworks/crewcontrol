import { Module } from '@nestjs/common'
import { OrganizerTermsGuard } from './organizer-terms.guard'
import { MyTermsController, PublicTermsController } from './terms.controller'
import { TermsService } from './terms.service'

@Module({
  controllers: [PublicTermsController, MyTermsController],
  providers: [TermsService, OrganizerTermsGuard],
  exports: [TermsService, OrganizerTermsGuard],
})
export class TermsModule {}
