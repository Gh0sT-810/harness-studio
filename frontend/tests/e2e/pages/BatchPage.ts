import { Locator, Page } from '@playwright/test'

import { BasePage } from './BasePage'

export class BatchPage extends BasePage {
  readonly batchesPage: Locator
  readonly snapshotPage: Locator

  constructor(page: Page) {
    super(page)
    this.batchesPage = this.byDataId('batches-page')
    this.snapshotPage = this.byDataId('batch-snapshot-page')
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
