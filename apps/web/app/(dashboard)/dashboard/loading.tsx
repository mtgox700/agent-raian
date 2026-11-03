// The dashboard skeleton has the shape of the page that is coming (header,
// day counters, metric cards, chart), on the same hairlines, so nothing jumps
// when the data lands. The pulse is opacity only, and stops in reduced motion.
export default function DashboardLoading() {
  return (
    <div className="space-y-6 pb-8" aria-busy="true" aria-label="Chargement">
      <div className="border-b border-border pb-6">
        <div className="h-3 w-40 animate-pulse rounded bg-surface motion-reduce:animate-none" />
        <div className="mt-3 h-7 w-56 animate-pulse rounded bg-surface motion-reduce:animate-none" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-[10px] border border-border bg-obsidian motion-reduce:animate-none" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[10px] border border-border bg-obsidian motion-reduce:animate-none" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[10px] border border-border bg-obsidian motion-reduce:animate-none" />
    </div>
  )
}
