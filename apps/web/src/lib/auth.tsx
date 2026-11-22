import {
  ClerkProvider,
  RedirectToSignIn,
  SignedIn,
  SignedOut,
  useAuth,
  useUser,
} from '@clerk/clerk-react'
import { useEffect, type ReactNode } from 'react'
import { setTokenGetter } from './api'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

export const authConfigured = Boolean(PUBLISHABLE_KEY)

/** Travel HQ's own Clerk application, the same setup as Learn Differently's. */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!authConfigured) return <>{children}</>
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY!}
      afterSignOutUrl="/"
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      telemetry={false}
      appearance={{
        variables: {
          colorPrimary: '#5A2D91',
          colorText: '#0F1C2E',
          fontFamily: "'Instrument Sans', system-ui, sans-serif",
          borderRadius: '12px',
        },
      }}
    >
      <TokenBridge />
      {children}
    </ClerkProvider>
  )
}

/** Hands the API client a way to get the signed-in user's token for organizer requests. */
function TokenBridge() {
  const { getToken } = useAuth()
  useEffect(() => setTokenGetter(() => getToken()), [getToken])
  return null
}

/** Organizer screens and the join page: signed-out visitors go to sign-in first, then come back. */
export function RequireSignIn({ children }: { children: ReactNode }) {
  if (!authConfigured)
    return (
      <p className="mx-auto max-w-md p-8 text-body">
        Sign-in isn&apos;t set up here: set VITE_CLERK_PUBLISHABLE_KEY for this deployment.
      </p>
    )
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  )
}

/** True when the signed-in user's Clerk public metadata says `{"role": "admin"}`. */
export function useIsAdmin(): boolean {
  const { user } = useUser()
  return (user?.publicMetadata as { role?: string } | undefined)?.role === 'admin'
}

/**
 * Whether someone is signed in; false while Clerk loads and when sign-in isn't set up. `authConfigured` never
 * changes while the app runs, so the hook below is always called the same way.
 */
export const useSignedIn: () => boolean = authConfigured
  ? () => useAuth().isSignedIn === true
  : () => false
