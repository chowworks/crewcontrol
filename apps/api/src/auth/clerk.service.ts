import { Injectable, Logger } from '@nestjs/common'
import { createClerkClient, verifyToken, type ClerkClient } from '@clerk/backend'

/**
 * Clerk on the API, the way Learn Differently does it: verify the Bearer token the web app sends, and read the
 * user's role from their Clerk public metadata (`{"role": "admin"}` makes them an admin). Without
 * CLERK_SECRET_KEY every organizer request is refused.
 */
@Injectable()
export class ClerkService {
  private readonly logger = new Logger(ClerkService.name)
  private readonly secretKey = process.env.CLERK_SECRET_KEY ?? null
  private readonly client: ClerkClient | null = this.secretKey
    ? createClerkClient({ secretKey: this.secretKey })
    : null
  // Roles change rarely; a minute's cache saves a Clerk call on every request.
  private readonly roles = new Map<string, { role: string | null; at: number }>()

  constructor() {
    if (!this.secretKey)
      this.logger.warn('CLERK_SECRET_KEY is not set: organizer requests are refused')
  }

  /** The Clerk user id behind a Bearer token, or null if it is missing, invalid or expired. */
  async userIdFrom(token: string): Promise<string | null> {
    if (!this.secretKey) return null
    try {
      return (await verifyToken(token, { secretKey: this.secretKey })).sub ?? null
    } catch {
      return null
    }
  }

  async isAdmin(userId: string): Promise<boolean> {
    const cached = this.roles.get(userId)
    if (cached && Date.now() - cached.at < 60_000) return cached.role === 'admin'
    let role: string | null = null
    try {
      const user = await this.client?.users.getUser(userId)
      role = (user?.publicMetadata as { role?: string } | undefined)?.role ?? null
    } catch (err) {
      this.logger.warn(
        `Could not read Clerk user ${userId}: ${err instanceof Error ? err.message : err}`
      )
    }
    this.roles.set(userId, { role, at: Date.now() })
    return role === 'admin'
  }

  /** Display names for user ids, for the Admin toolbox. Unknown ids are left out. */
  async names(userIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (!this.client || userIds.length === 0) return out
    try {
      const { data } = await this.client.users.getUserList({ userId: userIds, limit: 100 })
      for (const u of data) {
        const email = u.primaryEmailAddress?.emailAddress ?? ''
        out.set(u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || email || u.id)
      }
    } catch (err) {
      this.logger.warn(`Could not list Clerk users: ${err instanceof Error ? err.message : err}`)
    }
    return out
  }
}
