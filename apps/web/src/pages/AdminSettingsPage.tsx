import type { SystemSettings } from '@cc/types'
import { Hourglass, Sparkles } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { AdminHow, AdminSection, AdminShell, AdminToolHead } from './AdminPage'

/**
 * System Settings: app-wide values the platform admin sets, one section each (the limited preview and the waitlist
 * buffer). The switch saves as it's flipped, with Undo; the buffer saves with its own button.
 */
export function AdminSettingsPage() {
  const [saved, setSaved] = useState<SystemSettings | null>(null)
  const [buffer, setBuffer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSaved(s)
        setBuffer(String(s.waitlistBufferPercent))
      })
      .catch(() => setError('The settings could not be loaded.'))
  }, [])

  const value = Number(buffer)
  const problem =
    buffer.trim() === '' || !Number.isInteger(value) || value < 0 || value > 100
      ? 'Enter a whole number from 0 to 100.'
      : null

  async function store(next: SystemSettings, text: string, undo?: SystemSettings) {
    setBusy(true)
    setError(null)
    try {
      setSaved(await api.setSettings(next))
      toast({
        text,
        ...(undo && {
          action: {
            label: 'Undo',
            onClick: () => store(undo, 'Put back as it was.'),
          },
        }),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed.')
    } finally {
      setBusy(false)
    }
  }

  function flipPreview() {
    if (!saved || busy) return
    const limitedPreview = !saved.limitedPreview
    store(
      { ...saved, limitedPreview },
      limitedPreview
        ? 'Limited preview is on. Only approved people start trips.'
        : 'Limited preview is off. Anyone signed in can start a trip.',
      saved
    )
  }

  function saveBuffer(e: FormEvent) {
    e.preventDefault()
    if (!saved || problem || busy) return
    store({ ...saved, waitlistBufferPercent: value }, `Waitlist buffer set to ${value}%.`, saved)
  }

  return (
    <AdminShell>
      <AdminToolHead to="/admin/settings" />
      {error && (
        <p role="alert" className="mb-4 font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {saved && (
        <div className="flex flex-col gap-6">
          <AdminSection
            icon={Sparkles}
            title="Limited preview"
            steps={[
              'On: only admins and people you approve in Review Customer Requests start trips, and people who run a trip can invite friends.',
              'Off: anyone signed in starts a trip. Early access and invites disappear. Turn it off when the preview ends.',
            ]}
          >
            <div className="flex items-center gap-4 rounded-xl bg-ground px-4 py-3">
              <button
                type="button"
                role="switch"
                aria-checked={saved.limitedPreview}
                aria-label="Limited preview"
                disabled={busy}
                onClick={flipPreview}
                className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                  saved.limitedPreview ? 'bg-royal' : 'bg-[#5B6B80]'
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${
                    saved.limitedPreview ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
              <span className="text-lg font-extrabold">
                {saved.limitedPreview ? 'On: invite-only' : 'Off: open to everyone'}
              </span>
            </div>
          </AdminSection>

          <AdminSection
            icon={Hourglass}
            title="Waitlist buffer"
            steps={[
              'On trips where guests pay before they’re accepted, new guests join the waitlist once the guests who can see how to pay fill the spots left plus this share.',
              `With 10 spots left and ${problem ? 'this' : `${value}%`}, that’s ${
                problem ? 'more' : 10 + Math.ceil((10 * value) / 100)
              } people.`,
            ]}
          >
            <form onSubmit={saveBuffer} noValidate className="flex flex-col gap-1.5">
              <label htmlFor="buffer" className="text-sm font-semibold">
                Buffer (%)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="buffer"
                  className="min-h-[44px] w-32 rounded-[10px] border border-[#5B6B80] bg-white px-3.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal"
                  inputMode="numeric"
                  value={buffer}
                  onChange={(e) => setBuffer(e.target.value)}
                  aria-invalid={Boolean(problem)}
                />
                <button
                  type="submit"
                  disabled={busy || Boolean(problem) || value === saved.waitlistBufferPercent}
                  className="inline-flex min-h-[44px] items-center rounded-xl bg-royal px-5 font-semibold text-white hover:bg-royal-dark disabled:opacity-60"
                >
                  Save
                </button>
              </div>
              {problem && <span className="text-sm font-semibold text-[#B42318]">{problem}</span>}
            </form>
          </AdminSection>
        </div>
      )}
      <AdminHow to="/admin/settings" />
    </AdminShell>
  )
}
