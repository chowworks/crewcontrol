import { SignIn, SignUp } from '@clerk/clerk-react'
import { Logo } from '@/components/Logo'
import { authConfigured } from '@/lib/auth'

/** Sign-in and sign-up, for organizers and for guests joining a trip (who come back to the join page after). */
export function SignInPage({ mode = 'sign-in' }: { mode?: 'sign-in' | 'sign-up' }) {
  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[960px] items-center px-5 py-4">
        <Logo />
      </header>
      <main className="mx-auto flex max-w-[960px] flex-col items-center gap-4 px-5 py-8">
        {!authConfigured ? (
          <p className="text-body">
            Sign-in isn&apos;t set up here: set VITE_CLERK_PUBLISHABLE_KEY for this deployment.
          </p>
        ) : mode === 'sign-up' ? (
          <SignUp routing="path" path="/sign-up" fallbackRedirectUrl="/organize" />
        ) : (
          <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/organize" />
        )}
        <p className="text-sm text-muted">
          Organizers run trips here. Guests sign in to join a trip and sign its agreement.
        </p>
      </main>
    </div>
  )
}
