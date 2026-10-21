import { Global, Module } from '@nestjs/common'
import { ClerkService } from './clerk.service'
import { SignedInGuard } from './signed-in.guard'

@Global()
@Module({ providers: [ClerkService, SignedInGuard], exports: [ClerkService, SignedInGuard] })
export class AuthModule {}
