/**
 * Async feature pack for LazyMotion.
 *
 * Isolated in its own module so it is code-split into a SEPARATE async chunk.
 * If `domMax` were imported directly in the provider, framer's full feature set
 * would land in the initial bundle and LazyMotion would save nothing. Loading it
 * via `() => import(...)` keeps the initial chunk down to the lightweight `m`
 * component; the feature pack streams in after first paint (off the TBT path).
 *
 * domMax = the complete feature set (animations, gestures, drag, layout), so no
 * existing animation, whileInView, or AnimatePresence behaviour changes.
 */
export { domMax as default } from 'framer-motion'
