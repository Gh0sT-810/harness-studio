import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { TimelineActivityPanel } from '@/components/live-monitor/TimelineActivityPanel'
import { ArtifactMetadata, TimelineStep, openArtifactInNewTab } from '@/lib/artifacts'

/**
 * Live Monitor right column: a collapsible accordion. The Timeline section is
 * open by default and stays in sync with playback (see TimelineActivityPanel);
 * its header carries a "View JSON" button that opens the raw timeline artifact.
 * Every other artifact type is a collapsed section of file links — bodies are
 * not rendered until opened, so heavy artifacts cost nothing while closed. The
 * `timeline` group is intentionally omitted here since it is reachable through
 * the Timeline section's View JSON.
 */
export function LiveSidePanel({
  files,
  steps,
  selectedIndex,
  onSelect,
}: {
  files: ArtifactMetadata[]
  steps: TimelineStep[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  const timelineArtifactId = files.find((file) => file.artifactType === 'timeline')?.id
  const grouped = files.reduce<Record<string, ArtifactMetadata[]>>((acc, file) => {
    if (file.artifactType === 'timeline') return acc
    acc[file.artifactType] ??= []
    acc[file.artifactType].push(file)
    return acc
  }, {})

  return (
    <section data-id="live-monitor-side-panel" className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      <CollapsibleSection
        title="Timeline"
        dataId="live-monitor-section-timeline"
        defaultOpen
        headerRight={
          timelineArtifactId ? (
            <button
              data-id="live-monitor-timeline-view-json"
              type="button"
              className="harness-button-secondary !px-2 !py-1 text-xs"
              onClick={() => openArtifactInNewTab(timelineArtifactId)}
            >
              View JSON
            </button>
          ) : null
        }
      >
        <TimelineActivityPanel steps={steps} selectedIndex={selectedIndex} onSelect={onSelect} />
      </CollapsibleSection>

      {Object.entries(grouped).map(([type, items]) => (
        <CollapsibleSection key={type} title={type.replaceAll('_', ' ')} dataId={`live-monitor-section-${type}`} count={items.length}>
          <div className="grid gap-2">
            {items.map((item) => (
              <button
                data-id={`live-monitor-file-${item.id}`}
                className="harness-code-inline text-left"
                type="button"
                key={item.id}
                onClick={() => openArtifactInNewTab(item.id)}
              >
                {String(item.metadata.filename ?? item.objectKey)}
              </button>
            ))}
          </div>
        </CollapsibleSection>
      ))}

      {Object.keys(grouped).length === 0 && !timelineArtifactId ? (
        <p data-id="live-monitor-side-panel-empty" className="harness-subtitle">No files captured yet.</p>
      ) : null}
    </section>
  )
}
