import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { TERMS_REQUIRED_CODE } from '../trips/trip-types'
import { TermsService } from './terms.service'

/**
 * After SignedInGuard on the organizer routes: a person who hasn't accepted the current Organizer Terms is refused
 * with 403 `{ code: 'terms_required' }`, and the web app shows the Terms screen. A tab left open while the wording
 * changed is caught on its next action.
 */
@Injectable()
export class OrganizerTermsGuard implements CanActivate {
  constructor(private readonly terms: TermsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { caller } = context.switchToHttp().getRequest<{ caller?: Caller }>()
    if (!caller || !(await this.terms.hasAccepted(caller.userId, 'organizer')))
      throw new ForbiddenException({
        code: TERMS_REQUIRED_CODE,
        message: 'Accept the Organizer Terms to continue.',
      })
    return true
  }
}
