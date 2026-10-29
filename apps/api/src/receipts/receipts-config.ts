/**
 * Forwarded receipts are on only when receiving email is set up in this environment: the receipts domain the trip
 * addresses are on (RECEIPTS_DOMAIN, e.g. receipts.travel-hq.app), Resend's receiving key (RESEND_RECEIVING_API_KEY,
 * a Full access key, to read a received email; sending keeps RESEND_API_KEY) and the webhook's signing secret
 * (RESEND_WEBHOOK_SECRET, the same webhook as bounces). With any missing, nothing is queued and the worker never runs.
 */
export interface ReceiptsConfig {
  apiKey: string
  domain: string
}

export function receiptsConfig(env: NodeJS.ProcessEnv = process.env): ReceiptsConfig | null {
  const apiKey = env.RESEND_RECEIVING_API_KEY?.trim()
  const domain = receiptsDomain(env)
  if (!apiKey || !domain || !env.RESEND_WEBHOOK_SECRET?.trim()) return null
  return { apiKey, domain }
}

/** The domain receipts addresses are on, lowercased, when set. */
export const receiptsDomain = (env: NodeJS.ProcessEnv = process.env): string | null =>
  env.RECEIPTS_DOMAIN?.trim().toLowerCase() || null

/** The whole address, when the part before the @ and this environment's domain are both set. */
export const receiptsEmail = (local: string | null): string | null => {
  const domain = receiptsDomain()
  return local && domain ? `${local}@${domain}` : null
}
