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

export type TimelineStep = {
  id: string
  index: number
  type: string
  message: string
  url?: string
  title?: string
  beforeArtifactId?: string
  afterArtifactId?: string
}

export type TimelineDocument = {
  version: string
  iterationId: string
  steps: TimelineStep[]
}

async function authedFetch(path: string) {
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
