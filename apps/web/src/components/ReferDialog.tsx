import { UserPlus } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Dialog } from '@/components/Dialog'
import { field } from '@/components/EditorParts'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Referrals while Travel HQ is a limited preview (issue #39): someone who runs a trip refers a person to start their
 * own. It puts them on the early access list, marked as referred; the admin approves them in the Admin toolbox.
 */
export function ReferCard() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <section className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-royal px-4 py-3 text-white">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-white">
          <UserPlus className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="text-lg font-extrabold leading-tight">
            Early access is invite-only. Share yours.
          </h2>
          <p className="text-sm text-white/85">
            Know the friend who always plans the trip? Invite them and they skip the line.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-marigold px-4 font-semibold text-ink hover:brightness-95"
        >
          Invite a friend
        </button>
      </section>
      {/* Outside the card, so the dialog doesn't take its white text. */}
      {open && <ReferDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function ReferDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', note: '' })
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problems = {
    name: form.name.trim() ? null : 'Enter their name.',
    email: EMAIL.test(form.email.trim()) ? null : 'Enter their email address.',
  }

  const set =
    (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  async function send(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (problems.name || problems.email || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.refer(form)
      toast({ text: `${form.name.trim()} just skipped the line. Thanks for spreading the word!` })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t send. Try again.')
      setBusy(false)
    }
  }

  const fieldError = (problem: string | null) =>
    tried && problem && <span className="font-semibold text-[#B42318]">{problem}</span>

  return (
    <Dialog title="Invite a friend to Travel HQ" onClose={onClose}>
      <form onSubmit={send} noValidate className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <p className="rounded-xl bg-royal-pale px-4 py-3">
          Invited friends jump to the front of the early access line. Use the email they’ll sign in
          with.
        </p>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Their name
          <input
            className={`${field} font-normal`}
            value={form.name}
            onChange={set('name')}
            maxLength={120}
            autoComplete="off"
            aria-invalid={Boolean(tried && problems.name)}
          />
          {fieldError(problems.name)}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Their email
          <input
            className={`${field} font-normal`}
            type="email"
            value={form.email}
            onChange={set('email')}
            maxLength={254}
            autoComplete="off"
            aria-invalid={Boolean(tried && problems.email)}
          />
          {fieldError(problems.email)}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          What trip would they run? (optional)
          <textarea
            className={`${field} min-h-[100px] font-normal`}
            value={form.note}
            maxLength={2000}
            onChange={set('note')}
            placeholder="For example: my cousin runs our family reunion every summer."
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-royal px-6 text-[17px] font-semibold text-white hover:bg-royal-dark disabled:opacity-60"
        >
          {busy ? 'Sending…' : 'Send invite'}
        </button>
      </form>
    </Dialog>
  )
}
