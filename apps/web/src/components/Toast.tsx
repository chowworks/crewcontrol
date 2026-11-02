import { X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'

/**
 * The toast (owner's decision, 2026-10-26): one short line at the bottom of the screen that confirms what someone just
 * did ("Payment confirmed", with Undo when it can be undone), or reminds a guest of something due when they first
 * open the app. It never asks a question and never holds a form; anything that needs a decision stays on the page or
 * in a dialog. One at a time: a new toast replaces the last.
 */
export interface ToastInput {
  text: string
  /** A button (Undo) or a link (Pay now) beside the text. */
  action?: { label: string; onClick: () => void } | { label: string; to: string }
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {})

/** Shows a toast. */
export const useToast = () => useContext(ToastContext)

const ShowingContext = createContext(false)

/** Whether a toast is on screen, so something else at the bottom (the Help button) can move out of its way. */
export const useToastShowing = () => useContext(ShowingContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null)
  const timer = useRef<number>()
  const show = useCallback((t: ToastInput) => {
    window.clearTimeout(timer.current)
    const id = Date.now()
    setToast({ ...t, id })
    // Long enough to read and reach the action on a phone; longer when there's something to tap.
    timer.current = window.setTimeout(
      () => setToast((cur) => (cur?.id === id ? null : cur)),
      t.action ? 8000 : 5000
    )
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const close = () => setToast(null)
  const action =
    'shrink-0 min-h-[44px] px-2 font-bold text-marigold underline-offset-2 hover:underline'

  return (
    <ToastContext.Provider value={show}>
      <ShowingContext.Provider value={toast !== null}>{children}</ShowingContext.Provider>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
      >
        {toast && (
          <div className="pointer-events-auto flex w-full max-w-[440px] items-center gap-2 rounded-xl bg-ink py-1.5 pl-4 pr-1.5 text-[15px] text-white shadow-[0_16px_40px_rgba(15,28,46,0.25)]">
            <span className="min-w-0 flex-1 py-2">{toast.text}</span>
            {toast.action &&
              ('to' in toast.action ? (
                <Link
                  to={toast.action.to}
                  onClick={close}
                  className={`${action} flex items-center`}
                >
                  {toast.action.label}
                </Link>
              ) : (
                <button
                  type="button"
                  className={action}
                  onClick={() => {
                    close()
                    ;(toast.action as { onClick: () => void }).onClick()
                  }}
                >
                  {toast.action.label}
                </button>
              ))}
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white/80 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
