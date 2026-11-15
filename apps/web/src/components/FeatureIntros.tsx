import { PAID_FEATURES, type PaidFeature } from '@cc/types'
import { Gem } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Dialog } from './Dialog'

// Paid features (issue #90, owner's ask 2026-11-15): each feature the admin gives someone is introduced once, in a
// popup, on the first organizer page they open after. Closing it marks those features seen. The Help's "Paid
// features" link shows them again.

// Asked once per visit: the organizer pages share it, and a second page shouldn't ask again.
let asked = false

export function FeatureIntros() {
  const [intros, setIntros] = useState<PaidFeature[]>([])

  useEffect(() => {
    if (asked) return
    asked = true
    api
      .myFeatures()
      .then((m) => setIntros(m.intros))
      .catch(() => setIntros([]))
  }, [])

  if (intros.length === 0) return null
  const features = PAID_FEATURES.filter((f) => intros.includes(f.key))
  const close = () => {
    // Shown is shown: if marking fails, it shows again next visit, which is harmless.
    api.markFeaturesSeen(intros).catch(() => undefined)
    setIntros([])
  }

  return (
    <Dialog
      title={features.length === 1 ? 'You have a new paid feature' : 'You have new paid features'}
      onClose={close}
    >
      <div className="flex flex-col gap-5">
        <ul className="flex flex-col gap-3">
          {features.map((f) => (
            <li key={f.key} className="flex items-start gap-3 rounded-xl bg-royal-pale px-4 py-3">
              <Gem className="mt-0.5 h-5 w-5 shrink-0 text-royal" aria-hidden="true" />
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-bold text-ink">
                  {f.title}
                  {!f.built && (
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-royal">
                      Coming soon
                    </span>
                  )}
                </span>
                <span className="text-body">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
        {features.some((f) => !f.built) && (
          <p className="text-body">
            Coming soon means it isn’t ready yet. It’s yours as soon as it is.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={close}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-royal px-5 font-semibold text-white hover:bg-royal-dark"
          >
            Got it
          </button>
          <Link
            to="/organize/features"
            onClick={close}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale"
          >
            See your membership
          </Link>
        </div>
      </div>
    </Dialog>
  )
}
