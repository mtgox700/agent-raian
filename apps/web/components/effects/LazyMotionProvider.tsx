'use client'

/**
 * LazyMotionProvider: shrinks framer-motion's initial JS on every page.
 *
 * The full `motion` component eagerly bundles framer's entire feature set
 * (~34 KB) into the first chunk, which on the marketing pages cost ~2.6s of
 * main-thread CPU (the dominant TBT culprit once LCP was fixed).
 *
 * With <LazyMotion>, public components use the lightweight `m` component
 * (~6 KB) and the feature pack (`domMax`: animations, gestures, drag, layout)
 * is code-split and loaded once, off the critical path. Zero visual/behavioral
 * change: domMax is the complete feature set, so every existing animation,
 * `whileInView`, gesture and AnimatePresence keeps working identically.
 *
 * Non-strict on purpose: the authenticated dashboard still uses the full
 * `motion` component (it isn't Lighthouse-scored and ships in its own route
 * chunks), and must keep working under this same provider.
 */

import { LazyMotion, MotionConfig } from 'framer-motion'
import type { ReactNode } from 'react'

// Async import: keeps the feature pack OUT of the initial bundle (see
// framer-features.ts). This is what actually shrinks the homepage JS.
const loadFeatures = () =>
  import('@/components/effects/framer-features').then((mod) => mod.default)

// reducedMotion="user": framer animations run in JS, so the CSS
// prefers-reduced-motion rule never reached them. With this, a visitor who
// asked for less motion gets the end state of every transform animation
// (opacity and colour changes still play, as the platform recommends).
export function LazyMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures}>{children}</LazyMotion>
    </MotionConfig>
  )
}
