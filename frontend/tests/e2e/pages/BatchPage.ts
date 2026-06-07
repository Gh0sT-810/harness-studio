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
}
