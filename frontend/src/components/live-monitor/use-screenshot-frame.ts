import { useCallback, useEffect, useRef, useState } from 'react'

import { DecodedFrame, getFrame } from '@/lib/frame-cache'

export type FrameSlot = (DecodedFrame & { artifactId: string }) | null

export type ScreenshotFrameState = {
  /** Double buffer: both slots stay mounted so swaps never blank the stage. */
  slots: [FrameSlot, FrameSlot]
  /** Fully visible slot. */
  activeSlot: number
  /** Slot currently fading in over the active one, if any. */
  incomingSlot: number | null
  /** The slot that should be treated as the displayed frame (incoming wins). */
  shown: FrameSlot
  isInitialLoading: boolean
  isFetching: boolean
  isError: boolean
  retry: () => void
  /** Promote the incoming slot once its fade-in finished. */
  completeTransition: () => void
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

/**
 * Decode-gated screenshot frame state: the previous frame is held on screen
 * while the next one is fetched and decoded, then crossfaded in. Errors leave
 * any held frame untouched; `isError` is only meaningful for the current
 * target artifact.
 */
export function useScreenshotFrame(artifactId: string | undefined): ScreenshotFrameState {
  const [slots, setSlots] = useState<[FrameSlot, FrameSlot]>([null, null])
  const [activeSlot, setActiveSlot] = useState(0)
  const [incomingSlot, setIncomingSlot] = useState<number | null>(null)
  const [failedArtifactId, setFailedArtifactId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const stateRef = useRef({ slots, activeSlot, incomingSlot })
  const seqRef = useRef(0)

  // Keep a snapshot for event handlers and later-declared effects.
  // (Declared first so it runs before the fetch effect in the same commit.)
  useEffect(() => {
    stateRef.current = { slots, activeSlot, incomingSlot }
  }, [slots, activeSlot, incomingSlot])

  useEffect(() => {
    if (!artifactId) {
      return
    }
    const snapshot = stateRef.current
    const shownIndex = snapshot.incomingSlot ?? snapshot.activeSlot
    if (snapshot.slots[shownIndex]?.artifactId === artifactId) {
      return
    }
    const seq = ++seqRef.current
    let cancelled = false
    getFrame(artifactId)
      .then((frame) => {
        if (cancelled || seq !== seqRef.current) return
        setFailedArtifactId(null)
        const state = stateRef.current
        const hasVisibleFrame = state.slots[state.activeSlot] !== null
        if (!hasVisibleFrame || prefersReducedMotion()) {
          const slot = state.activeSlot
          setSlots((current) => {
            const next: [FrameSlot, FrameSlot] = [current[0], current[1]]
            next[slot] = { ...frame, artifactId }
            return next
          })
          setIncomingSlot(null)
          return
        }
        const backSlot = 1 - state.activeSlot
        setSlots((current) => {
          const next: [FrameSlot, FrameSlot] = [current[0], current[1]]
          next[backSlot] = { ...frame, artifactId }
          return next
        })
        setIncomingSlot(backSlot)
      })
      .catch(() => {
        if (!cancelled && seq === seqRef.current) {
          setFailedArtifactId(artifactId)
        }
      })
    return () => {
      cancelled = true
    }
  }, [artifactId, attempt])

  const completeTransition = useCallback(() => {
    const incoming = stateRef.current.incomingSlot
    if (incoming !== null) {
      setActiveSlot(incoming)
      setIncomingSlot(null)
    }
  }, [])

  // Safety net: promote even if the transitionend event is missed.
  useEffect(() => {
    if (incomingSlot === null) return
    const timer = window.setTimeout(completeTransition, 450)
    return () => window.clearTimeout(timer)
  }, [completeTransition, incomingSlot])

  const retry = useCallback(() => {
    setFailedArtifactId(null)
    setAttempt((value) => value + 1)
  }, [])

  const shown = slots[incomingSlot ?? activeSlot]
  const hasAnyFrame = Boolean(slots[0] || slots[1])
  const isError = Boolean(artifactId && failedArtifactId === artifactId)
  const isFetching = Boolean(artifactId && !isError && shown?.artifactId !== artifactId)

  return {
    slots,
    activeSlot,
    incomingSlot,
    shown,
    isInitialLoading: Boolean(artifactId) && !hasAnyFrame && !isError,
    isFetching,
    isError,
    retry,
    completeTransition,
  }
}
