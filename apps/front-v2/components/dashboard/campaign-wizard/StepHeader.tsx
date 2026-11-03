import { wizardCopy } from '@/lib/copy/campaign-wizard'

/** « Étape 0X sur 05 », the step's title and one line of intent. */
export function StepHeader({ step, title, intro }: { step: number; title: string; intro: string }) {
  return (
    <header className="mb-8">
      <p className="mb-3 font-mono text-xs text-accent">{wizardCopy.stepOf(step)}</p>
      <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink md:text-3xl">{title}</h2>
      <p className="mt-2 text-sm text-quiet">{intro}</p>
    </header>
  )
}

/** A choice card / chip: the accent marks the one picked. */
export const choiceClass = (selected: boolean) =>
  selected ? 'border-accent bg-accent/[0.06]' : 'border-line bg-raised hover:border-quiet/50'

export const fieldLabel = 'mb-2 block font-mono text-xs text-quiet'
export const textControl = 'w-full rounded-md border border-line bg-raised text-sm text-ink outline-none transition-colors duration-200 ease-signal placeholder:text-quiet/60 focus:border-accent/50 disabled:opacity-50'
