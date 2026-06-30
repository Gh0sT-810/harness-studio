import { Locator, Page } from '@playwright/test'

import { BasePage } from './BasePage'

export class BatchPage extends BasePage {
  readonly batchesPage: Locator
  readonly batchesHeaderSection: Locator
  readonly batchesActionsSection: Locator
  readonly batchesActionsLabel: Locator
  readonly addBatchButton: Locator
  readonly batchFormCard: Locator
  readonly batchesSearch: Locator
  readonly snapshotPage: Locator
  readonly snapshotBackToBatches: Locator
  readonly liveMonitor: Locator
  readonly liveMonitorTimeline: Locator
  readonly liveMonitorBrowser: Locator
  readonly liveMonitorSidePanel: Locator
  readonly liveMonitorTimelineActivity: Locator
  readonly logsViewer: Locator

  constructor(page: Page) {
    super(page)
    this.batchesPage = this.byDataId('batches-page')
    this.batchesHeaderSection = this.byDataId('batches-header-section')
    this.batchesActionsSection = this.byDataId('batches-actions-section')
    this.batchesActionsLabel = this.byDataId('batches-actions-label')
    this.addBatchButton = this.byDataId('add-batch-button')
    this.batchFormCard = this.byDataId('batch-form-card')
    this.batchesSearch = this.byDataId('batches-search')
    this.snapshotPage = this.byDataId('batch-snapshot-page')
    this.snapshotBackToBatches = this.byDataId('snapshot-back-to-batches')
    this.liveMonitor = this.byDataId('live-monitor')
    this.liveMonitorTimeline = this.byDataId('live-monitor-timeline')
    this.liveMonitorBrowser = this.byDataId('live-monitor-browser')
    this.liveMonitorSidePanel = this.byDataId('live-monitor-side-panel')
    this.liveMonitorTimelineActivity = this.byDataId('live-monitor-timeline-activity')
    this.logsViewer = this.byDataId('logs-viewer')
  }

  batchCard(id: string) {
    return this.byDataId(`batch-card-${id}`)
  }

  snapshotExecution(id: string) {
    return this.byDataId(`snapshot-execution-${id}`)
  }

  snapshotIteration(id: string) {
    return this.byDataId(`snapshot-iteration-${id}`)
  }

  openLiveMonitor(id: string) {
    return this.byDataId(`open-live-monitor-${id}`)
  }

  openLogs(id: string) {
    return this.byDataId(`open-logs-${id}`)
  }
}
