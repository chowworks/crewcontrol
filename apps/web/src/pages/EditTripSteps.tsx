import type { ReactNode } from 'react'

/** What each step holds, in one line, under its name in the menu. */
const HINTS = [
  'Name, dates and how the trip works',
  'Registration, who’s going, photos, highlights',
  'The rooms guests choose from',
  'Cost, price per person and the schedule',
  'Publishing and the trip link',
]

interface FrameProps {
  title: string
  steps: string[]
  step: number
  onStep: (n: number) => void
  children: ReactNode
}

/**
 * The trip editor's page body: its title, the steps (a menu down the left that stays in view on a wide screen, a
 * row of numbers on a phone) and the current step's cards.
 */
export function StepsFrame({ title, steps, step, onStep, children }: FrameProps) {
  return (
    <div className="mx-auto grid max-w-[1120px] gap-6 px-5 py-6 md:gap-8 md:py-8 md:grid-cols-[250px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,760px)]">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        <PhoneSteps steps={steps} step={step} onStep={onStep} />
        <SideMenu steps={steps} step={step} onStep={onStep} />
      </div>
      <main className="flex min-w-0 flex-col gap-6 md:pt-14">{children}</main>
    </div>
  )
}

/** Each step's circle, styled by where it is against the current step. */
const circle = (on: boolean, done: boolean) =>
  `grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full border-2 text-base font-extrabold ${
    on
      ? 'border-royal bg-royal text-white'
      : done
        ? 'border-royal bg-white text-royal'
        : 'border-rule bg-white text-muted'
  }`

/**
 * On a phone: the same circles in a row, joined by a line, with the current step's name and line under them, so
 * the step's own cards start on the first screen.
 */
function PhoneSteps({
  steps,
  step,
  onStep,
}: {
  steps: string[]
  step: number
  onStep: (n: number) => void
}) {
  return (
    <nav aria-label="Steps" className="flex flex-col gap-2 md:hidden">
      <ol className="relative flex justify-between">
        <span
          className="absolute left-[22px] right-[22px] top-[21px] h-0.5 bg-rule"
          aria-hidden="true"
        />
        <span
          className="absolute left-[22px] top-[21px] h-0.5 bg-royal"
          style={{ width: `calc((100% - 44px) * ${(step - 1) / (steps.length - 1)})` }}
          aria-hidden="true"
        />
        {steps.map((title, i) => {
          const n = i + 1
          return (
            <li key={title} className="relative">
              <button
                type="button"
                onClick={() => onStep(n)}
                aria-current={n === step ? 'step' : undefined}
                aria-label={`Step ${n}: ${title}`}
                className={circle(n === step, n < step)}
              >
                {n}
              </button>
            </li>
          )
        })}
      </ol>
      <p>
        <span className="block font-semibold text-royal">
          Step {step} of {steps.length}: {steps[step - 1]}
        </span>
        <span className="text-sm text-muted">{HINTS[step - 1]}</span>
      </p>
    </nav>
  )
}

/**
 * Each step as a numbered circle with its name and a line on what it holds, joined by a line down the side: the
 * current step filled royal, the ones before it outlined royal, the ones after it grey.
 */
function SideMenu({
  steps,
  step,
  onStep,
}: {
  steps: string[]
  step: number
  onStep: (n: number) => void
}) {
  return (
    <nav aria-label="Steps" className="hidden md:sticky md:top-24 md:block">
      <ol className="flex flex-col gap-1 rounded-2xl bg-white p-2 shadow-card">
        {steps.map((title, i) => {
          const n = i + 1
          const on = n === step
          const done = n < step
          return (
            <li key={title} className="relative">
              {n < steps.length && (
                <span
                  className={`absolute left-[33px] top-[54px] h-[calc(100%-36px)] w-0.5 ${
                    done ? 'bg-royal' : 'bg-rule'
                  }`}
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                onClick={() => onStep(n)}
                aria-current={on ? 'step' : undefined}
                className={`relative flex min-h-[44px] w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ${
                  on ? 'bg-royal-pale' : 'hover:bg-ground'
                }`}
              >
                <span className={circle(on, done)}>{n}</span>
                <span className="flex flex-col pt-1">
                  <span className={`font-semibold ${on ? 'text-royal' : 'text-ink'}`}>{title}</span>
                  <span className="text-sm text-muted">{HINTS[i]}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
