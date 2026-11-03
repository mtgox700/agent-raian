'use client'

import { useEffect, useRef, useState } from 'react'

interface ScenePlayerProps {
  /** Text of the replay button, shown once the scene has ended. */
  label: string
  /** Length of the scene in ms, kept in sync with its CSS timeline. */
  sceneMs: number
}

/**
 * Plays the signature scene it sits in (the closest `.scene`). The scene's
 * CSS animations wait, paused on their first frame, until `data-play` is set:
 * here, once the page is idle and the scene is on screen. A replay rewinds the
 * same animations. With reduced motion the scene has no animation at all (CSS),
 * so nothing is played and no replay is offered.
 */
export function ScenePlayer({ label, sceneMs }: ScenePlayerProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const playRef = useRef<() => void>(() => {})
  const [canReplay, setCanReplay] = useState(false)

  useEffect(() => {
    const scene = ref.current?.closest<HTMLElement>('.scene')
    if (!scene) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let done: ReturnType<typeof setTimeout> | undefined
    const play = () => {
      if (scene.hasAttribute('data-play')) {
        // Rewind every animation of the scene to its first frame.
        scene.getAnimations({ subtree: true }).forEach((animation) => {
          animation.currentTime = 0
          animation.play()
        })
      } else {
        scene.setAttribute('data-play', '')
      }
      clearTimeout(done)
      done = setTimeout(() => setCanReplay(true), sceneMs)
    }
    playRef.current = play

    // Safari has no requestIdleCallback: a short timer stands in for it.
    const hasIdle = typeof window.requestIdleCallback === 'function'
    let idle: number | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        if (hasIdle) idle = window.requestIdleCallback(play, { timeout: 1200 })
        else timer = setTimeout(play, 400)
      },
      { threshold: 0.35 },
    )
    observer.observe(scene)

    return () => {
      observer.disconnect()
      clearTimeout(done)
      clearTimeout(timer)
      if (idle !== undefined) window.cancelIdleCallback(idle)
    }
  }, [sceneMs])

  // Hidden (not just transparent) until the first play has ended, so it is
  // never a focusable ghost; once shown it stays, and a replay keeps focus.
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => playRef.current()}
      className={
        'shrink-0 rounded-[4px] border border-border px-2.5 py-1.5 font-mono text-[11px] text-muted ' +
        'transition-colors duration-200 hover:text-white max-sm:min-h-11 ' +
        (canReplay ? '' : 'invisible')
      }
    >
      {label}
    </button>
  )
}
