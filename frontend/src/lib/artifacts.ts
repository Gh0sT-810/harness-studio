import { apiBaseUrl, tokenStore } from '@/lib/api'

export type ArtifactMetadata = {
  id: string
  scope: string
  artifactType: string
  objectKey: string
  sizeBytes: number
  contentHash: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type CaptureMetadata = {
  viewport?: {
    width?: number
    height?: number
  }
  screenshot?: {
    fullPage?: boolean
    scrollX?: number
    scrollY?: number
    deviceScaleFactor?: number
  }
  cursor?: {
    coordinateBasis?: 'viewport' | 'screenshot' | string
    x?: number
    y?: number
    visible?: boolean
  }
}

export type TimelineStep = {
  id: string
  index: number
  type: string
  message: string
  url?: string
  title?: string
  provider?: string
  action?: string
  args?: Record<string, unknown>
  status?: string
  occurredAt?: string
  beforeArtifactId?: string
  afterArtifactId?: string
  capture?: CaptureMetadata
  captureAfter?: CaptureMetadata
  // Optional model narrative, populated by the execution-api adapters
  // (model_thinking → reasoning, final model_response → response). Read
  // defensively: pre-parity timelines omit these.
  reasoning?: string
  response?: string
}

export type TimelineDocument = {
  version: string
  iterationId: string
  steps: TimelineStep[]
}

export async function authedFetch(path: string) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    // Living artifacts (timeline, execution log) are upserted in place during a
    // run, so never serve a stale cached copy when polling for live updates.
    cache: 'no-store',
    headers: { Authorization: `Bearer ${tokenStore.getAccessToken()}` },
  })
  if (!response.ok) {
    throw new Error('artifact request failed')
  }
  return response
}

function filenameFromContentDisposition(header: string | null): string | undefined {
  if (!header) return undefined
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }
  return header.match(/filename="?([^";]+)"?/i)?.[1]?.trim()
}

/**
 * Download an artifact through the authenticated API. A plain `<a href>` cannot
 * carry the bearer token (it lives in localStorage, attached only by fetch), so
 * the download is fetched with the Authorization header, read as a Blob, and
 * saved via a synthetic anchor. Throws when the request is not OK so callers can
 * surface a failure. Prefers the server-provided filename, falling back to the
 * caller-supplied name.
 */
export async function downloadArtifact(artifactId: string, fallbackName: string) {
  const response = await authedFetch(`/api/artifacts/${artifactId}`)
  const filename = filenameFromContentDisposition(response.headers.get('Content-Disposition')) ?? fallbackName
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const artifactApi = {
  listIterationFiles: async (iterationId: string) => {
    const response = await authedFetch(`/api/iterations/${iterationId}/files`)
    return response.json() as Promise<ArtifactMetadata[]>
  },
  timeline: async (iterationId: string) => {
    const response = await authedFetch(`/api/iterations/${iterationId}/timeline`)
    return response.json() as Promise<TimelineDocument>
  },
  objectUrl: async (artifactId: string) => {
    const response = await authedFetch(`/api/artifacts/${artifactId}`)
    return URL.createObjectURL(await response.blob())
  },
  text: async (artifactId: string) => {
    const response = await authedFetch(`/api/artifacts/${artifactId}`)
    return response.text()
  },
}

/**
 * Opens an artifact in a new tab without tripping popup blockers or leaking the
 * blob URL. The tab is opened synchronously inside the click handler (so it
 * keeps the user-gesture context), then redirected to the fetched blob once it
 * resolves, and the object URL is revoked after the tab has loaded it.
 */
export function openArtifactInNewTab(artifactId: string) {
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  void artifactApi
    .objectUrl(artifactId)
    .then((url) => {
      if (tab) {
        tab.location.href = url
      } else {
        // Popup was blocked despite the synchronous open; best-effort fallback.
        window.open(url, '_blank', 'noopener,noreferrer')
      }
      // Give the new tab time to load the blob before reclaiming it.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    })
    .catch(() => tab?.close())
}
