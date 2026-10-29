import { receiptsConfig } from './receipts-config'

/**
 * A received email as Resend's "Retrieve Received Email" returns it (GET /emails/receiving/{id}), the fields this
 * reads. `authentication` is what Resend found for SPF, DKIM and DMARC ('pass' | 'fail' | 'gray' |
 * 'processing_failed' | 'unknown'), null on older emails.
 */
export interface ReceivedEmail {
  id: string
  from: string
  to: string[]
  subject: string | null
  created_at: string
  html: string | null
  text: string | null
  authentication: { spf?: string; dkim?: string; dmarc?: string } | null
}

/** A failure talking to Resend: worth trying again later. */
export class ProviderError extends Error {
  override name = 'ProviderError'
}

/** Reads one received email from Resend. Never sends anything: the sender gets no reply. */
export async function fetchReceivedEmail(id: string): Promise<ReceivedEmail> {
  const cfg = receiptsConfig()
  if (!cfg) throw new ProviderError('Receiving email is not set up')
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  }).catch(() => null)
  if (!res?.ok) {
    // Resend names the error in its body (restricted_api_key for a sending-only key); never the key itself.
    const name = res
      ? await res
          .json()
          .then((b: { name?: unknown }) => (typeof b?.name === 'string' ? b.name : null))
          .catch(() => null)
      : null
    throw new ProviderError(
      `Resend answered ${res?.status ?? 'nothing'}${name ? ` (${name.slice(0, 60)})` : ''}`
    )
  }
  return (await res.json()) as ReceivedEmail
}
