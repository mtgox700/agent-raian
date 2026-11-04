import type { ArticleBlock } from '@/lib/marketing/blog'

/** Long-form typography: ink on canvas in both brands, the accent only on markers. */
export function ArticleBlockView({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case 'h2':
      return <h2 className="mt-14 text-balance font-display text-[1.65rem] font-semibold leading-tight tracking-[-0.025em] text-ink">{block.text}</h2>
    case 'ul':
      return (
        <ul className="mt-5 space-y-3 text-ink/85">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-[0.85em] h-px w-3 shrink-0 bg-accent" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol className="mt-5 list-decimal space-y-3 pl-6 text-ink/85 marker:font-mono marker:text-sm marker:text-accent">
          {block.items.map((item) => <li key={item}>{item}</li>)}
        </ol>
      )
    case 'callout':
      return (
        <aside className="mt-10 border-l-2 border-accent py-1 pl-6">
          <p className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">{block.title}</p>
          <p className="mt-2 leading-relaxed text-ink/85">{block.text}</p>
        </aside>
      )
    default:
      return <p className="mt-5 leading-[1.75] text-ink/85">{block.text}</p>
  }
}
