import { ArtifactMetadata, artifactApi } from '@/lib/artifacts'

export function FileBrowser({ files }: { files: ArtifactMetadata[] }) {
  const grouped = files.reduce<Record<string, ArtifactMetadata[]>>((acc, file) => {
    acc[file.artifactType] ??= []
    acc[file.artifactType].push(file)
    return acc
  }, {})

  async function openArtifact(artifactId: string) {
    const url = await artifactApi.objectUrl(artifactId)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section data-id="live-monitor-files" className="grid min-h-0 content-start gap-3 overflow-auto">
      {Object.keys(grouped).length === 0 ? <p className="harness-subtitle">No files captured yet.</p> : null}
      {Object.entries(grouped).map(([type, items]) => (
        <div className="harness-card-base p-3" key={type}>
          <h4 className="font-semibold capitalize">{type.replaceAll('_', ' ')}</h4>
          <div className="mt-2 grid gap-2">
            {items.map((item) => (
              <button data-id={`live-monitor-file-${item.id}`} className="harness-code-inline text-left" type="button" key={item.id} onClick={() => openArtifact(item.id)}>
                {String(item.metadata.filename ?? item.objectKey)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
