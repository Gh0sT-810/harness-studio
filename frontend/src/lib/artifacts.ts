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
}

export type TimelineDocument = {
  version: string
  iterationId: string
  steps: TimelineStep[]
}

export async function authedFetch(path: string) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${tokenStore.getAccessToken()}` },
  })
  if (!response.ok) {
    throw new Error('artifact request failed')
  }
  return response
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
}
