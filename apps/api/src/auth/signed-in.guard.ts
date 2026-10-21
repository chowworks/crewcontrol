import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { identifyAdmin, identifyCaller } from '../core/tenant-context'
import type { Caller } from './caller'
import { ClerkService } from './clerk.service'

type AuthedRequest = { headers: Record<string, string | undefined>; caller?: Caller }

const ADMIN_ONLY = 'adminOnly'
/** Marks a controller or route as admins only (Clerk public metadata `{"role": "admin"}`). */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true)

/** The signed-in caller, as `SignedInGuard` attached it. */
export const CurrentCaller = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthedRequest>().caller as Caller
)

/** Requires a valid Clerk sign-in; with @AdminOnly(), an admin. */
@Injectable()
export class SignedInGuard implements CanActivate {
  constructor(
    private readonly clerk: ClerkService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>()
    const auth = request.headers['authorization'] ?? ''
    const userId = auth.startsWith('Bearer ')
      ? await this.clerk.userIdFrom(auth.slice(7).trim())
      : null
    if (!userId) throw new UnauthorizedException('Sign in to manage trips')
    // Tell the database who this is before anything else touches it (docs/tenant-isolation.md).
    identifyCaller({ userId })
    const caller: Caller = { userId, isAdmin: await this.clerk.isAdmin(userId) }
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (adminOnly && !caller.isAdmin) throw new ForbiddenException('Admins only')
    // The admin mark only on admin routes, after Clerk's backend confirmed the role.
    if (adminOnly) identifyAdmin()
    request.caller = caller
    return true
  }
}
