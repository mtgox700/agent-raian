// Server Component (no JavaScript): the sign-in and sign-up backdrop. The
// moving orbs are gone; what stays is the market field of the home page,
// faint, so the first screen after the site still reads as the same product.
export function AnimatedAuthBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-void" aria-hidden="true">
      <div
        className="absolute inset-y-0 left-0 hidden w-[45%] opacity-[0.07] lg:block"
        style={{
          backgroundImage: 'radial-gradient(circle, rgb(var(--c-white)) 1.2px, transparent 1.6px)',
          backgroundSize: '28px 28px',
          maskImage: 'linear-gradient(180deg, transparent 0%, #000 35%, #000 70%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 35%, #000 70%, transparent 100%)',
        }}
      />
      <div className="absolute inset-y-0 left-[45%] hidden w-px bg-border lg:block" />
    </div>
  )
}
