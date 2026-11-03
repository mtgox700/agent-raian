export function AuthDivider({ text = 'ou continuer avec' }: { text?: string }) {
  return (
    <div className="relative flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border/60" />
      <span className="text-xs uppercase tracking-widest text-muted/70">{text}</span>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  )
}
