import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { BrowserReplay } from '@/components/live-monitor/BrowserReplay'
import { FileBrowser } from '@/components/live-monitor/FileBrowser'
import { TimelinePane } from '@/components/live-monitor/TimelinePane'
import { artifactApi } from '@/lib/artifacts'
import { BatchSnapshot } from '@/lib/api'
import { prefetchFrame, releaseAllFrames } from '@/lib/frame-cache'

// Base playback cadence at 1x, per the legacy live monitor spec (§8.10).
const PLAYBACK_BASE_INTERVAL_MS = 2500

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
  const artifactCount = iteration.artifacts?.length ?? 0
  const filesQuery = useQuery({
    queryKey: ['iteration-files', iteration.id, artifactCount],
    queryFn: () => artifactApi.listIterationFiles(iteration.id),
  })
  const { refetch: refetchTimeline } = timelineQuery
  const { refetch: refetchFiles } = filesQuery
  const steps = useMemo(() => timelineQuery.data?.steps ?? [], [timelineQuery.data?.steps])
  const isLive = iteration.status === 'executing'
  const effectiveSelectedIndex = isLive && followLive ? Math.max(steps.length - 1, 0) : Math.min(selectedIndex, Math.max(steps.length - 1, 0))

  useEffect(() => {
    if (!isPlaying || steps.length === 0) return
    const timer = window.setTimeout(() => {
      setSelectedIndex((current) => Math.min(current + 1, steps.length - 1))
    }, PLAYBACK_BASE_INTERVAL_MS / speed)
    return () => window.clearTimeout(timer)
  }, [isPlaying, selectedIndex, speed, steps.length])

  // Keep neighbor frames (and the newest live frames) decoded ahead of need,
  // so stepping, playback, and "Continue Live" never wait on the network.
  useEffect(() => {
    const neighborIndexes = [effectiveSelectedIndex - 1, effectiveSelectedIndex + 1]
    if (isPlaying) neighborIndexes.push(effectiveSelectedIndex + 2)
    for (const index of neighborIndexes) {
      const neighbor = steps[index]
      if (neighbor) {
        prefetchFrame(neighbor.beforeArtifactId)
        prefetchFrame(neighbor.afterArtifactId)
      }
    }
    if (isLive && steps.length > 0) {
      const newest = steps[steps.length - 1]
      prefetchFrame(newest.beforeArtifactId)
      prefetchFrame(newest.afterArtifactId)
    }
  }, [effectiveSelectedIndex, isLive, isPlaying, steps])

  // Release all cached frame object URLs when the monitor closes.
  useEffect(() => () => releaseAllFrames(), [])

  useEffect(() => {
    void refetchTimeline()
    void refetchFiles()
  }, [artifactCount, iteration.timelineArtifactId, refetchFiles, refetchTimeline])

  const files = useMemo(() => filesQuery.data ?? [], [filesQuery.data])
  const timelineError = timelineQuery.isError ? 'Timeline artifact is unavailable.' : ''
  const filesError = filesQuery.isError ? 'Artifact file list is unavailable.' : ''

  return (
    <div data-id="live-monitor" className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-4 shadow-2xl">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <p className="harness-kicker">{isLive ? 'Live Monitor' : 'Playback Monitor'}</p>
          <h3 className="harness-title">Iteration {iteration.iterationNumber}</h3>
        </div>
        <div className="flex gap-2">
          {isLive ? <button data-id="live-monitor-continue" className="harness-button-secondary" type="button" onClick={() => setFollowLive(true)}>Continue Live</button> : null}
          <button data-id="live-monitor-close" className="harness-button-secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="grid h-[calc(100vh-8rem)] min-h-0 flex-1 items-stretch gap-4 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)_320px] xl:grid-rows-[minmax(0,1fr)]">
        {timelineError ? <p data-id="live-monitor-timeline-error" className="harness-subtitle xl:col-span-3">{timelineError}</p> : null}
        {filesError ? <p data-id="live-monitor-files-error" className="harness-subtitle xl:col-span-3">{filesError}</p> : null}
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
          isLive={isLive}
          followLive={followLive}
          onContinueLive={() => setFollowLive(true)}
        />
        <BrowserReplay steps={steps} selectedIndex={effectiveSelectedIndex} />
        <FileBrowser files={files} />
      </div>
    </div>
  )
}
