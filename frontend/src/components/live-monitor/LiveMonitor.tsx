import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { BrowserReplay } from '@/components/live-monitor/BrowserReplay'
import { FileBrowser } from '@/components/live-monitor/FileBrowser'
import { TimelinePane } from '@/components/live-monitor/TimelinePane'
import { artifactApi } from '@/lib/artifacts'
import { BatchSnapshot } from '@/lib/api'

type Iteration = BatchSnapshot['iterations'][number]

export function LiveMonitor({ iteration, onClose }: { iteration: Iteration; onClose: () => void }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [followLive, setFollowLive] = useState(true)
  const [speed, setSpeed] = useState(1)
  const timelineQuery = useQuery({
    queryKey: ['iteration-timeline', iteration.id, iteration.timelineArtifactId],
    queryFn: () => artifactApi.timeline(iteration.id),
  })
  const filesQuery = useQuery({
    queryKey: ['iteration-files', iteration.id, iteration.artifacts?.length],
    queryFn: () => artifactApi.listIterationFiles(iteration.id),
  })
  const steps = timelineQuery.data?.steps ?? []
  const isLive = iteration.status === 'executing'
  const effectiveSelectedIndex = isLive && followLive ? Math.max(steps.length - 1, 0) : Math.min(selectedIndex, Math.max(steps.length - 1, 0))
  const selectedStep = steps[effectiveSelectedIndex]

  useEffect(() => {
    if (!isPlaying || steps.length === 0) return
    const timer = window.setTimeout(() => {
      setSelectedIndex((current) => Math.min(current + 1, steps.length - 1))
    }, 1000 / speed)
    return () => window.clearTimeout(timer)
  }, [isPlaying, selectedIndex, speed, steps.length])

  const files = useMemo(() => filesQuery.data ?? [], [filesQuery.data])

  return (
    <div data-id="live-monitor" className="fixed inset-4 z-50 overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="harness-kicker">{isLive ? 'Live Monitor' : 'Playback Monitor'}</p>
          <h3 className="harness-title">Iteration {iteration.iterationNumber}</h3>
        </div>
        <div className="flex gap-2">
          {isLive ? <button data-id="live-monitor-continue" className="harness-button-secondary" type="button" onClick={() => setFollowLive(true)}>Continue Live</button> : null}
          <button data-id="live-monitor-close" className="harness-button-secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <TimelinePane
          steps={steps}
          selectedIndex={effectiveSelectedIndex}
          isPlaying={isPlaying}
          speed={speed}
          onSelect={(index) => {
            setSelectedIndex(index)
            setFollowLive(false)
            setIsPlaying(false)
          }}
          onPrevious={() => setSelectedIndex((current) => Math.max(current - 1, 0))}
          onNext={() => setSelectedIndex((current) => Math.min(current + 1, Math.max(steps.length - 1, 0)))}
          onTogglePlay={() => setIsPlaying((current) => !current)}
          onSpeedChange={setSpeed}
        />
        <BrowserReplay step={selectedStep} />
        <FileBrowser files={files} />
      </div>
    </div>
  )
}
