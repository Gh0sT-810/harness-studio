import { useEffect, useState } from 'react'

import { artifactApi, TimelineStep } from '@/lib/artifacts'

export function BrowserReplay({ step }: { step: TimelineStep | undefined }) {
  const [mode, setMode] = useState<'before' | 'after'>('after')
  const [image, setImage] = useState<{ artifactId: string; url: string } | null>(null)
  const artifactId = mode === 'before' ? step?.beforeArtifactId : step?.afterArtifactId
  const imageUrl = image && image.artifactId === artifactId ? image.url : ''

  useEffect(() => {
    let revoked = ''
    if (!artifactId) return
    artifactApi.objectUrl(artifactId).then((url) => {
      revoked = url
      setImage({ artifactId, url })
    }).catch(() => undefined)
    return () => {
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [artifactId])

  return (
    <section data-id="live-monitor-browser" className="grid gap-3">
      <div className="harness-card-base p-3">
        <p data-id="live-monitor-url" className="harness-code-inline w-full overflow-hidden text-ellipsis">{step?.url ?? 'No URL captured yet'}</p>
        <p className="harness-subtitle mt-2">{step?.title ?? 'No title captured yet'}</p>
      </div>
      <div className="flex gap-2">
        <button data-id="live-monitor-before" className={mode === 'before' ? 'harness-button-primary' : 'harness-button-secondary'} type="button" onClick={() => setMode('before')}>Before</button>
        <button data-id="live-monitor-after" className={mode === 'after' ? 'harness-button-primary' : 'harness-button-secondary'} type="button" onClick={() => setMode('after')}>After</button>
      </div>
      <div className="harness-card-base min-h-[320px] overflow-hidden p-3">
        {imageUrl ? <img data-id="live-monitor-screenshot" className="w-full rounded-lg border border-[var(--border)]" src={imageUrl} alt={`${mode} screenshot`} /> : <p className="harness-subtitle">No screenshot available.</p>}
      </div>
    </section>
  )
}
