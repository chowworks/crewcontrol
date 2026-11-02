import { useClerk, useUser } from '@clerk/clerk-react'
import type { MyActions } from '@cc/types'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { authConfigured, useIsAdmin } from '@/lib/auth'

/**
 * The account control at the far right of the header, in the shape of Audit Differently's: an avatar and first
 * name that open a short menu. Page actions (New trip, Add trip) sit to its left as buttons; the menu holds who
 * you are, Your trips, the Admin toolbox for admins, and Sign out. Nothing shows when signed out.
 *
 * A red count on the pill says how many things need you across the app (owner's decision, 2026-10-24): on the trips
 * you run, what each one's Actions lists; on trips you joined, a payment that's due. The menu lists each with its
 * count and links there. An admin's count adds the organizers' questions waiting in Review Customer Requests, and help answers they edited
 * whose default changed since
 * (owner's ask, 2026-11-02).
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
  const [actions, setActions] = useState<MyActions | null>(null)
  const [help, setHelp] = useState({ questions: 0, changed: 0 })
  const { pathname } = useLocation()
  const toast = useToast()

  // Counted again on every page and whenever the tab comes back into view, so a done action drops off.
  useEffect(() => {
    if (!isSignedIn) return
    /**
     * A guest with a payment due hears it once when they open the app (owner's decision, 2026-10-26), in a toast with a
     * link to pay: once per visit (this tab), not on every page. Their join page itself already says what's due.
     */
    const remind = (a: MyActions) => {
      const due = a.items.find((i) => i.as === 'guest')
      if (!due || pathname === due.href) return
      try {
        if (sessionStorage.getItem('cc:reminded')) return
        sessionStorage.setItem('cc:reminded', '1')
      } catch {
        // Storage blocked (a private window): remind anyway; at worst it shows again on the next visit.
      }
      toast({
        text: `A payment is due for ${due.name}.`,
        action: { label: 'Pay now', to: due.href },
      })
    }
    const loadActions = () =>
      api
        .myActions()
        .then((a) => {
          setActions(a)
          remind(a)
        })
        .catch(() => setActions(null))
    const loadQuestions = () =>
      api
        .adminHelpWaiting()
        .then(setHelp)
        .catch(() => setHelp({ questions: 0, changed: 0 }))
    const load = () => {
      void loadActions()
      if (isAdmin) void loadQuestions()
    }
    load()
    // Trip Control says when something was just done (cc:actions-changed).
    window.addEventListener('focus', load)
    window.addEventListener('cc:actions-changed', load)
    return () => {
      window.removeEventListener('focus', load)
      window.removeEventListener('cc:actions-changed', load)
    }
  }, [isSignedIn, isAdmin, pathname, toast])

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
  const total = (actions?.total ?? 0) + help.questions + help.changed
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
        {/* The red count sits on the avatar's corner, so the pill stays as narrow on a phone. */}
        <span className="relative">
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
          {total > 0 && (
            <span className="absolute -right-2 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#B42318] px-1 text-xs font-bold text-white ring-2 ring-white">
              {total}
              <span className="sr-only"> {total === 1 ? 'thing needs' : 'things need'} you</span>
            </span>
          )}
        </span>
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
            {((actions && actions.items.length > 0) || help.questions + help.changed > 0) && (
              <div className="mb-1.5 border-b border-rule pb-1.5">
                <span className="block px-3 pb-1 pt-1 text-[13px] font-semibold text-muted">
                  Needs you
                </span>
                {help.questions > 0 && (
                  <Link to="/admin/requests" className={`${item} justify-between gap-3`}>
                    <span className="min-w-0 truncate">Organizers’ questions</span>
                    <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-[#B42318] px-1.5 text-sm font-bold text-white">
                      {help.questions}
                    </span>
                  </Link>
                )}
                {help.changed > 0 && (
                  <Link to="/admin/requests" className={`${item} justify-between gap-3`}>
                    <span className="min-w-0 truncate">Help answers to check</span>
                    <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-[#B42318] px-1.5 text-sm font-bold text-white">
                      {help.changed}
                    </span>
                  </Link>
                )}
                {actions?.items.map((a) => (
                  <Link key={a.href} to={a.href} className={`${item} justify-between gap-3`}>
                    <span className="min-w-0 truncate">
                      {a.as === 'guest' ? `Pay for ${a.name}` : a.name}
                    </span>
                    <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-[#B42318] px-1.5 text-sm font-bold text-white">
                      {a.count}
                    </span>
                  </Link>
                ))}
              </div>
            )}
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
