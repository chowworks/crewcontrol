import { runAsSystem } from '../core/tenant-context'
import type { PrismaService } from '../prisma/prisma.service'
import { receiptsConfig } from './receipts-config'

/** Why mail to a retired address was refused. Word for word in migration 20261029080000 (receipts_address_release). */
export const RETIRED = 'This address is no longer in use'

/** The bare address of `Name <a@b.org>` or `a@b.org`, lowercased; null when there is none. */
export function addressOf(value: unknown): string | null {
  // A header longer than any real one is not read at all, so no pattern runs on attacker-sized input.
  if (typeof value !== 'string' || value.length > 1000) return null
  const inAngles = /<([^<>\s@]+@[^<>\s]+)>/.exec(value)
  const bare = (inAngles?.[1] ?? value).trim().toLowerCase()
  return /^[^\s@<>]+@[^\s@<>]+$/.test(bare) && bare.length <= 254 ? bare : null
}

/** The part before the @ of an address on `domain`, or null. */
export const localPart = (to: string | null, domain: string): string | null =>
  to?.endsWith(`@${domain}`) ? to.slice(0, -(domain.length + 1)) : null

/**
 * Resend's `email.received` event, checked: the email's id, sender, recipients and subject, no body (it is read from
 * Resend when the email is worked on). The receipts address is the first recipient on our domain; null when none is.
 */
export function parseReceived(payload: unknown, domain: string) {
  const d = ((payload ?? {}) as { data?: Record<string, unknown> }).data ?? {}
  const emailId = typeof d.email_id === 'string' ? d.email_id.trim() : ''
  if (!emailId || emailId.length > 200) return null
  const list = (v: unknown) => (Array.isArray(v) ? v : [v])
  const to = [...list(d.to), ...list(d.received_for)].map(addressOf).filter((a): a is string => !!a)
  const at = typeof d.created_at === 'string' ? new Date(d.created_at) : new Date()
  return {
    emailId,
    fromAddress: addressOf(d.from),
    toAddress: to.find((a) => a.endsWith(`@${domain}`)) ?? null,
    subject: typeof d.subject === 'string' ? d.subject.slice(0, 300) : null,
    receivedAt: Number.isNaN(at.getTime()) ? new Date() : at,
  }
}

/**
 * The webhook's one job for a received email: put it in the queue, once per Resend id, and answer at once (the worker
 * reads it). Mail to none of our addresses is not kept. Mail to a retired address is refused now and kept with no
 * sender or subject, only so the Admin toolbox can count it until the address is released. Trusted work: nobody is
 * known yet. Returns whether it was ours.
 */
export async function enqueueReceived(prisma: PrismaService, payload: unknown): Promise<boolean> {
  const cfg = receiptsConfig()
  if (!cfg) return false
  const row = parseReceived(payload, cfg.domain)
  const local = row && localPart(row.toAddress, cfg.domain)
  if (!row || !local) return false
  await runAsSystem(async () => {
    const retired = await prisma.receiptsAddress.findFirst({
      where: { address: local, removedAt: { not: null }, releasedAt: null },
      select: { id: true },
    })
    await prisma.forwardedReceipt.createMany({
      data: [
        retired
          ? {
              emailId: row.emailId,
              toAddress: row.toAddress,
              receivedAt: row.receivedAt,
              status: 'rejected',
              reason: RETIRED,
            }
          : row,
      ],
      skipDuplicates: true,
    })
  })
  return true
}
