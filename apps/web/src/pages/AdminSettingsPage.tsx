import type { SystemSettings } from '@cc/types'
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import { AdminHow, AdminShell, AdminToolHead } from './AdminPage'

/** System Settings: CrewControl-wide values the platform admin sets (for now, the waitlist buffer). */
export function AdminSettingsPage() {
  const [saved, setSaved] = useState<SystemSettings | null>(null)
  const [buffer, setBuffer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  async function save(e: FormEvent) {
    e.preventDefault()
    if (problem || busy) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      setSaved(await api.setSettings({ waitlistBufferPercent: value }))
      setMessage('Saved. Every trip uses it from now on.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminShell>
      <AdminToolHead to="/admin/settings" />
      {saved && (
        <form
          onSubmit={save}
          noValidate
          className="flex max-w-[560px] flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6"
        >
          {error && (
            <p role="alert" className="font-semibold text-[#B42318]">
              {error}
            </p>
          )}
          <h2 className="text-xl font-extrabold">Waitlist</h2>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Waitlist buffer (%)
            <input
              className="min-h-[44px] w-32 rounded-[10px] border border-[#5B6B80] bg-white px-3.5 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal"
              inputMode="numeric"
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              aria-invalid={Boolean(problem)}
            />
            {problem ? (
              <span className="font-semibold text-[#B42318]">{problem}</span>
            ) : (
              <span className="font-normal text-muted">
                On trips where guests pay before they’re accepted, new guests join the waitlist once
                the guests who can see how to pay fill the spots left plus this share. With 10 spots
                left and {value}%, that’s {10 + Math.ceil((10 * value) / 100)} people.
              </span>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || Boolean(problem) || value === saved.waitlistBufferPercent}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-royal px-5 font-semibold text-white hover:bg-royal-dark disabled:opacity-60"
            >
              Save
            </button>
            {message && (
              <span role="status" className="text-sm font-semibold text-royal">
                {message}
              </span>
            )}
          </div>
        </form>
      )}
      <AdminHow to="/admin/settings" />
    </AdminShell>
  )
}
