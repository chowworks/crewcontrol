import { useUser } from '@clerk/clerk-react'
import { CopyText } from './CopyText'

/**
 * The trip's receipts address, wherever a guest pays or reports a payment (issue #12), with a button that copies it:
 * forwarding the Zelle or Cash App email from a phone means pasting the address. No email link (owner's decision,
 * 2026-11-05): a new email isn't a forward.
 */
export function ReceiptsAddress({
  email,
  inReport = false,
}: {
  email: string
  inReport?: boolean
}) {
  const signInEmail = useUser().user?.primaryEmailAddress?.emailAddress
  return (
    <div className="text-sm">
      <p>
        {inReport ? 'Or skip this form: forward' : 'Paid? Forward'} the Zelle, Cash App or bank
        email to
      </p>
      <CopyText value={email} label="Receipts address">
        <span className="font-semibold">{email}</span>
      </CopyText>
      <p className="text-body">
        {signInEmail ? (
          <>
            Send it from <span className="break-all">{signInEmail}</span> and it’s recorded for you.
          </>
        ) : (
          'Send it from the email you sign in with and it’s recorded for you.'
        )}
      </p>
    </div>
  )
}
