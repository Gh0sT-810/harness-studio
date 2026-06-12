import { authedFetch } from '@/lib/artifacts'

/**
 * Screenshot frame cache for the Live Monitor.
 *
 * Frames are fetched once, decoded off-screen, and memoized as object URLs in
 * a small LRU so step revisits and before/after toggles are instant. In-flight
 * requests are de-duplicated. Evicted or released frames revoke their object
 * URLs to bound memory.
 */

export type DecodedFrame = {
  url: string
  width: number
  height: number
}

const MAX_FRAMES = 24

const cache = new Map<string, DecodedFrame>()
const inFlight = new Map<string, Promise<DecodedFrame>>()

async function decodeSize(url: string): Promise<{ width: number; height: number }> {
  if (typeof Image === 'undefined') {
    return { width: 0, height: 0 }
  }
  const image = new Image()
  image.src = url
  try {
    await image.decode()
  } catch {
    await new Promise<void>((resolve) => {
      if (image.complete) {
        resolve()
        return
      }
      image.onload = () => resolve()
      image.onerror = () => resolve()
    })
  }
  return { width: image.naturalWidth, height: image.naturalHeight }
}

async function fetchFrame(artifactId: string): Promise<DecodedFrame> {
  const response = await authedFetch(`/api/artifacts/${artifactId}`)
  const url = URL.createObjectURL(await response.blob())
  const size = await decodeSize(url)
  if (typeof Image !== 'undefined' && (!size.width || !size.height)) {
    URL.revokeObjectURL(url)
    throw new Error('screenshot decode failed')
  }
  return { url, ...size }
}

export function getFrame(artifactId: string): Promise<DecodedFrame> {
  const cached = cache.get(artifactId)
  if (cached) {
    // Refresh LRU position.
    cache.delete(artifactId)
    cache.set(artifactId, cached)
    return Promise.resolve(cached)
  }
  const pending = inFlight.get(artifactId)
  if (pending) {
    return pending
  }
  const request = fetchFrame(artifactId)
    .then((frame) => {
      cache.set(artifactId, frame)
      while (cache.size > MAX_FRAMES) {
        const oldest = cache.keys().next().value
        if (oldest === undefined) break
        const evicted = cache.get(oldest)
        cache.delete(oldest)
        if (evicted) URL.revokeObjectURL(evicted.url)
      }
      return frame
    })
    .finally(() => {
      inFlight.delete(artifactId)
    })
  inFlight.set(artifactId, request)
  return request
}

export function prefetchFrame(artifactId: string | undefined): void {
  if (!artifactId) return
  void getFrame(artifactId).catch(() => undefined)
}

export function releaseAllFrames(): void {
  for (const frame of cache.values()) {
    URL.revokeObjectURL(frame.url)
  }
  cache.clear()
  inFlight.clear()
}
