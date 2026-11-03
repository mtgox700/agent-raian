// Server Component. The five agents as one numbered chain, beside the scene
// that shows the end of that chain: a sequence that stops on the reply.
import { Fragment } from 'react'
import { SequenceStop } from './scenes/SequenceStop'
import { landing } from '@/lib/marketing/content'

// Reality Lock (C1): factual descriptions (real sources, Claude engine, the
// real 75/100 quality bar of lib/agents/copywriter.ts).
const { titleLines, intro, agents } = landing.howItWorks

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border py-24 md:py-32" aria-labelledby="how-it-works-title">
      <div className="mx-auto grid max-w-[1200px] gap-14 px-5 md:px-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6">
          <h2 id="how-it-works-title" className="font-display text-[clamp(2rem,4.2vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-white">
            {titleLines.map((line, i) => (
              <Fragment key={line}>
                {i > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </h2>
          <p className="mt-6 max-w-[32rem] leading-relaxed text-muted">
            {intro}
          </p>

          <ol className="mt-12 border-t border-border">
            {agents.map((agent, i) => (
              <li key={agent.name} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-b border-border py-5">
                <span className="pt-0.5 font-mono text-xs text-cyan tabular-nums" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-medium text-white">{agent.name}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{agent.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="lg:col-span-6 lg:pl-6">
          <div className="lg:sticky lg:top-28">
            <SequenceStop />
          </div>
        </div>
      </div>
    </section>
  )
}
