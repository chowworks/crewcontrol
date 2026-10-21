import { useClerk, useUser } from '@clerk/clerk-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { authConfigured, useIsAdmin } from '@/lib/auth'

/**
 * The account control at the far right of the header, in the shape of Audit Differently's: an avatar and first
 * name that open a short menu. Page actions (New trip, Add trip) sit to its left as buttons; the menu holds who
 * you are, Your trips, the Admin toolbox for admins, and Sign out. Nothing shows when signed out.
 */
export function AccountMenu() {
  if (!authConfigured) return null
  return <SignedInMenu />
}

function SignedInMenu() {
  const { isLoaded, isSignedIn, user } = useUser()
  const { signOut } = useClerk()
  const isAdmin = useIsAdmin()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!isLoaded || !isSignedIn) return null
  const email = user.primaryEmailAddress?.emailAddress ?? ''
  const name = user.fullName || email
  const first = (user.firstName || email).split(' ')[0] || 'Account'
  const item =
    'flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[15px] font-semibold text-ink hover:bg-ground'

  return (
    <div className="relative z-20" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 min-h-[44px] rounded-full border-[1.5px] border-ink py-1 pl-1 pr-3.5 text-[15px] font-bold text-ink ${
          open ? 'bg-ink/10' : 'hover:bg-ink/10'
        }`}
      >
        {user.hasImage ? (
          <img className="h-8 w-8 rounded-full object-cover" src={user.imageUrl} alt="" />
        ) : (
          <span
            className="grid h-8 w-8 place-items-center rounded-full bg-marigold text-sm font-extrabold"
            aria-hidden="true"
          >
            {first.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="hidden sm:inline">{first}</span>
        <span
          className={`mx-0.5 h-[7px] w-[7px] border-b-2 border-r-2 border-current ${
            open ? 'mt-1 -rotate-[135deg]' : 'mb-1 rotate-45'
          }`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id="account-menu"
          className="absolute right-0 top-[calc(100%+8px)] min-w-[260px] rounded-2xl border border-rule bg-white p-2 shadow-[0_16px_40px_rgba(15,28,46,0.14)]"
        >
          <div className="mb-1.5 flex flex-col border-b border-rule px-3 pb-3 pt-2 text-[15px] leading-snug">
            <strong>{name}</strong>
            {email !== name && <span className="break-all text-[13px] text-muted">{email}</span>}
          </div>
          {/* A choice made here closes the menu. */}
          <div onClick={() => setOpen(false)}>
            <Link to="/organize" className={item}>
              Your trips
            </Link>
            {isAdmin && (
              <Link to="/admin" className={item}>
                Admin toolbox
              </Link>
            )}
          </div>
          <div className="mt-1.5 border-t border-rule pt-1.5">
            <button type="button" onClick={() => void signOut()} className={item}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
