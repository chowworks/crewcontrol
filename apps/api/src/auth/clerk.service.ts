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
  private readonly emails = new Map<string, { emails: string[]; at: number }>()

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

  /** The user who signed in with this email, or null if nobody has (a trip's People screen adds only them). */
  async userIdByEmail(email: string): Promise<string | null> {
    if (!this.client) return null
    const { data } = await this.client.users.getUserList({ emailAddress: [email], limit: 1 })
    return data[0]?.id ?? null
  }

  /** A person's verified emails, lowercased: the ones a trip invite may be claimed with. Cached for a minute. */
  async verifiedEmails(userId: string): Promise<string[]> {
    const cached = this.emails.get(userId)
    if (cached && Date.now() - cached.at < 60_000) return cached.emails
    let emails: string[] = []
    try {
      const user = await this.client?.users.getUser(userId)
      emails = (user?.emailAddresses ?? [])
        .filter((e) => e.verification?.status === 'verified')
        .map((e) => e.emailAddress.toLowerCase())
    } catch (err) {
      this.logger.warn(
        `Could not read Clerk user ${userId}: ${err instanceof Error ? err.message : err}`
      )
    }
    this.emails.set(userId, { emails, at: Date.now() })
    return emails
  }

  /**
   * A person's first and last name and primary email from their sign-in, for the trip agreement. Blank parts when
   * Clerk has none or can't be reached.
   */
  async contact(userId: string): Promise<{ name: string; email: string }> {
    try {
      const user = await this.client?.users.getUser(userId)
      return {
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim(),
        email: user?.primaryEmailAddress?.emailAddress ?? '',
      }
    } catch (err) {
      this.logger.warn(
        `Could not read Clerk user ${userId}: ${err instanceof Error ? err.message : err}`
      )
      return { name: '', email: '' }
    }
  }

  /** Names and emails for user ids, for a trip's People screen. Unknown ids are left out. */
  async people(userIds: string[]): Promise<Map<string, { name: string; email: string }>> {
    const out = new Map<string, { name: string; email: string }>()
    if (!this.client || userIds.length === 0) return out
    try {
      const { data } = await this.client.users.getUserList({ userId: userIds, limit: 100 })
      for (const u of data) {
        const email = u.primaryEmailAddress?.emailAddress ?? ''
        out.set(u.id, { name: [u.firstName, u.lastName].filter(Boolean).join(' ') || email, email })
      }
    } catch (err) {
      this.logger.warn(`Could not list Clerk users: ${err instanceof Error ? err.message : err}`)
    }
    return out
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
