import { brand } from '@/lib/brand'

// Placeholder: the body n°2 landing is being forged (roadmap phase 6).
export default function HomePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-8">
      <h1 className="font-display text-4xl text-ink">{brand.name}</h1>
    </main>
  )
}
