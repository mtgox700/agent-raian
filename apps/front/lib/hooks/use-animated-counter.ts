'use client'

import { useEffect, useRef, useState } from 'react'

interface UseAnimatedCounterOptions {
  duration?: number
  easing?: (t: number) => number
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

/**
 * Whether a change of value is animated. Never the first value: it is in the
 * server HTML as it is, so a background tab, a slow device or a screen reader
 * never reads a 0 that is not true. Never when motion is reduced, nor in a
 * hidden tab (no frames there: the counter would stay on its old value).
 */
export function shouldAnimate(from: number, to: number, env: { reducedMotion: boolean; hidden: boolean }): boolean {
  return from !== to && !env.reducedMotion && !env.hidden
}

export function useAnimatedCounter(
  target: number,
  options: UseAnimatedCounterOptions = {}
) {
  const { duration = 1800, easing = easeOutQuart } = options
  const [current, setCurrent] = useState(target)
  const shownRef = useRef(target)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const from = shownRef.current
    const env = {
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      hidden: document.hidden,
    }
    if (!shouldAnimate(from, target, env)) {
      shownRef.current = target
      setCurrent(target)
      return
    }

    let start: number | null = null
    const animate = (timestamp: number) => {
      if (start === null) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      const value = Math.round(from + easing(progress) * (target - from))
      shownRef.current = value
      setCurrent(value)
      if (progress < 1) frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [target, duration, easing])

  return current
}
