import { Module } from '@nestjs/common'
import { TermsModule } from '../terms/terms.module'
import { AdminMembershipsController, MyFeaturesController } from './memberships.controller'
import { MembershipsService } from './memberships.service'

/** Paid features (issue #90). Exports the check for the features that use it. */
@Module({
  imports: [TermsModule],
  controllers: [MyFeaturesController, AdminMembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
