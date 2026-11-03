import { Section } from '@/components/ui'
import { anchorLabel, landing } from '@/lib/content'

/**
 * Five agents in relay. One rail runs through them and ends on the last one,
 * the agent that listens: its node is the point of the signature. Below it
 * the rail does not continue: nothing more leaves for someone who replied.
 */
export function Relay() {
  const { howItWorks } = landing
  const last = howItWorks.agents.length - 1
  return (
    <Section
      id="how-it-works"
      index={1}
      eyebrow={anchorLabel('#how-it-works')}
      title={howItWorks.titleLines.map((line, i) => (
        <span key={line} className={i > 0 ? 'block text-quiet' : 'block'}>{line}</span>
      ))}
      intro={howItWorks.intro}
    >
      <ol className="mt-14 md:mt-20">
        {howItWorks.agents.map((agent, i) => (
          <li key={agent.name} className="relative grid grid-cols-[2rem_1fr] gap-x-5 pb-10 md:grid-cols-[2rem_16rem_1fr] md:gap-x-10 md:pb-12">
            {i < last && <span className="absolute bottom-0 left-[calc(1rem-0.5px)] top-6 w-px bg-line" aria-hidden="true" />}
            <span className="relative mt-1.5 flex size-8 items-center justify-center" aria-hidden="true">
              {i < last
                ? <span className="size-3 rounded-full border-2 border-line bg-canvas" />
                : <span className="size-4 rounded-full bg-accent" />}
            </span>
            <h3 className="flex items-baseline gap-3 font-display text-xl font-semibold tracking-[-0.02em] text-ink">
              <span className="font-mono text-xs font-normal text-quiet">{String(i + 1).padStart(2, '0')}</span>
              {agent.name}
            </h3>
            <p className="col-start-2 mt-2 max-w-prose leading-relaxed text-quiet md:col-start-3 md:mt-0">{agent.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
