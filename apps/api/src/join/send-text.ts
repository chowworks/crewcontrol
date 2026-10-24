import { Logger } from '@nestjs/common'

const logger = new Logger('SendText')

/** A US phone number as typed ("(555) 555-0100") in E.164 ("+15555550100"), or null when it isn't one. */
export function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (phone.trim().startsWith('+') && digits.length >= 8) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/**
 * Sends a guest a text. The one place the join flow sends anything. Mocked: it logs the message and sends nothing,
 * until the messaging module (MessagingService.send(to, body), built in its own change) replaces this body.
 */
export async function sendText(phone: string, body: string): Promise<void> {
  const to = toE164(phone)
  if (!to) {
    logger.warn('Not texted: the phone number is not one we can text')
    return
  }
  // The number masked, so logs don't collect guests' phone numbers.
  logger.log(`[mock text to ${to.slice(0, -4).replace(/\d/g, '•')}${to.slice(-4)}] ${body}`)
}
